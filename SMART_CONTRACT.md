# SMART_CONTRACT.md

Engineer's guide to `SachetMarket` — the on-chain pari-mutuel engine behind
Sachet Market. It covers the interface, the payout math, the security model, how
to build/test/deploy, and exactly what is implemented today and the current protocol capabilities.


- **Source:** `contracts/src/SachetMarket.sol`
- **Tests:** `contracts/test/SachetMarket.t.sol` (30 passing)
- **Config:** `contracts/foundry.toml`
- **Off-chain mirror:** `lib/odds.ts`, `lib/onchain.ts`, `lib/market.ts`, `lib/indexer.ts`

---

## 1. What the contract is

A single deployed contract escrows all stakes for every match. The
admins open pools, resolvers provide final outcomes, and bettors stake and later
**pull** their payout or refund. There is no order book, no oracle, no per-match
contract — one singleton, many logical pools keyed by `bytes32`.

Design goals:

- **Chain is the ledger.** Every stake and payout is a token transfer; Postgres
  is only a mirror.
- **Deterministic pool ids.** One pool per match, derived off-chain so both
  sides agree without a registry.
- **Tiny trusted surface.** Admins launch pools, Resolvers finalize outcomes. They
  can never touch user stakes directly.
- **Exact off-chain parity.** `lib/odds.ts` reproduces the payout math and is
  unit-tested against the same numbers (see `lib/odds.test.ts`).
- **Flexible Token and Treasury.** The betting token can be dynamically updated by an admin (when the market is paused), and generic tokens can be withdrawn via `withdrawTreasury`.
- **No Rake.** Currently, 100% of the losing pool is distributed proportionally to the winners.

---

## 2. Interface

Solidity `^0.8.24`, inherits OpenZeppelin `AccessControl`, `ReentrancyGuard`, and `Pausable`. Uses `SafeERC20`.

### Constants & Roles

| Name                 | Meaning                                           |
| -------------------- | ------------------------------------------------- |
| `ADMIN_ROLE`         | Can pause, update token, launch/cancel pools, and sweep treasury. |
| `RESOLVER_ROLE`      | Can resolve pools with the final outcome.         |
| `MAX_POOL_DURATION`  | Hardcoded to 30 days.                             |

### Enums

**Outcome**: `UNSET` (0), `HOME` (1), `DRAW` (2), `AWAY` (3), `VOID` (4)
**PoolStatus**: `OPEN` (0), `LOCKED` (1), `RESOLVED` (2), `CANCELLED` (3)

### Immutables / storage

```solidity
IERC20 public sachetMarketToken; // The active ERC20 token for wagering
mapping(bytes32 => Pool) public pools;
mapping(bytes32 => mapping(address => Bet)) public bets;
```

### `struct Pool`

```solidity
struct Pool {
    uint64 expiresAt;
    PoolStatus status;
    Outcome result;
    uint256 poolHome;
    uint256 poolDraw;
    uint256 poolAway;
    uint256 totalPool;
    uint256 totalClaimed; // Tracked for UI and analytics
}
```

### `struct Bet`

```solidity
struct Bet {
    uint256 amount;
    Outcome outcome;
    bool claimed;
}
```

### Core Functions

| Function                                                                 | Access         | Notes                                                                                                                                                             |
| ------------------------------------------------------------------------ | -------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `launchPool(bytes32 poolId, uint64 expiresAt)`                           | `ADMIN_ROLE`   | Creates a pool. Reverts if expiry is in past or > 30 days.                                                                                                        |
| `placeBet(bytes32 poolId, Outcome outcome, uint256 amount)`              | anyone         | Places or increases a bet. Reverts if paused or expired. `amount` must be > 0. Reverts if attempting to change outcome without withdrawing first.                 |
| `withdrawBet(bytes32 poolId)`                                            | anyone         | Withdraws a user's bet before pool expiry, zeroing out their wager.                                                                                               |
| `resolvePool(bytes32 poolId, Outcome result)`                            | `RESOLVER_ROLE`| Finalizes a pool's result. Must be at or after `expiresAt`.                                                                                                       |
| `cancelPool(bytes32 poolId)`                                             | `ADMIN_ROLE`   | Emergency cancels an open pool, forcing a 100% refund.                                                                                                            |
| `claim(bytes32 poolId)`                                                  | anyone         | Pulls payout for a winning bet, or refund if pool is `CANCELLED` or `VOID`.                                                                                       |
| `updateToken(address newToken)`                                          | `ADMIN_ROLE`   | Dynamically changes the active betting token. Must be paused.                                                                                                     |
| `withdrawTreasury(address token, address to, uint256 amount)`            | `ADMIN_ROLE`   | Sweeps any ERC20 out of the contract. Must be paused. Passing `type(uint256).max` sweeps full balance.                                                            |

### Events

```solidity
event PoolLaunched(bytes32 indexed poolId, uint64 expiresAt);
event BetPlaced(bytes32 indexed poolId, address indexed user, Outcome outcome, uint256 amount);
event BetWithdrawn(bytes32 indexed poolId, address indexed user, uint256 amount);
event PoolResolved(bytes32 indexed poolId, Outcome result);
event PoolCancelled(bytes32 indexed poolId);
event Claimed(bytes32 indexed poolId, address indexed user, uint256 payout);
event TokenUpdated(address indexed oldToken, address indexed newToken);
event TreasuryWithdrawn(address indexed token, address indexed to, uint256 amount);
```

These are the exact events the indexer decodes (`lib/indexer.ts`). `PoolLaunched`,
`BetPlaced`, `BetWithdrawn`, `PoolResolved`, `PoolCancelled`, `Claimed` drive state; the other two are recorded
for audit only.

### Errors

`AlreadyClaimed`, `AlreadyResolvedOrCancelled`, `AmountMustBeGreaterThan0`,
`ExpiresatExceedsMaxDuration`, `ExpiresatInPast`, `InvalidOutcome`,
`InvalidResult`, `NoActiveBet`, `NoClaimableBet`, `NotResolvedOrCancelled`,
`PoolAlreadyExists`, `PoolClosed`, `PoolDoesNotExist`, `PoolNotOpen`,
`PoolStillOpen`, `ReceivedAmountMustBeGreaterThan0`, `TooLateToWithdraw`,
`ZeroAddress`, `AmountExceedsBalance`, `CannotChangeOutcome`.

---

## 3. Pool id derivation

One pool per match, derived deterministically off-chain:

```
poolId = keccak256(utf8("sachet:1x2:" + match.externalId))
```

`lib/onchain.ts::computeOnchainPoolId` is the single implementation; the admin
action (`app/(app)/admin/actions.ts`) persists it on the `Pool` row and passes
the same value to `launchPool`. `launchPool` also rejects a reused id
(`PoolAlreadyExists`), so the mapping is enforceable on-chain.

---

## 4. Payout math (must match `lib/odds.ts`)

All arithmetic is integer with floor division; amounts are token base units.

- **Distributing Winnings**: 
  - `winningPool` is the total tokens wagered on the correct outcome.
  - `losingPool` is `totalPool - winningPool`.
  - Payout is calculated as: `payout = originalAmount + (originalAmount * losingPool) / winningPool`.
- **Refunds (`VOID` or `CANCELLED`)**:
  - Payout is exactly 100% of the original wager.
- **Zero Winner Edge Case**:
  - If no one backed the winning outcome, everyone loses their wager (stays trapped in the contract to be swept via `withdrawTreasury`).

Off-chain parity lives in `lib/odds.ts`:

- `distributablePot`, `winnerPayout` — identical integer math (now without rake).
- `projectPayout` — what a bet would return if the pool closed now.
- `impliedMultiple` — display-only multiple for the board.

`lib/odds.test.ts` is the parity proof; change the contract math and this test
must change with it.

---

## 5. Security model & invariants

**Trusted actors**

- **Operator** (server hot key): can `createPool`, `resolve`, `setOperator`,
  `setMinStake`, `withdrawTreasury`. Cannot move user stake except by correctly
  resolving, and can only withdraw accrued `treasuryBalance`.
- **Admin allowlist** (app layer, `ADMIN_ADDRESSES`): off-chain gate on who may
  _trigger_ operator actions. It is not an on-chain role.

**Bettors**: unprivileged; only their own tokens in/out.

**Invariants**

1. Sum of all `claim` payouts for a pool `<= totalStake - treasuryCredit`
   (fuzz: `testFuzz_ClaimSumNeverExceedsDistributable`).
2. A refund returns the exact stake (fuzz: `testFuzz_RefundAlwaysReturnsExactStake`).
3. `treasuryBalance <= sum of rake on resolved pools`.
4. A pool can be resolved at most once; a pool id can be created once.
5. Betting is impossible at/after `expiresAt`; resolution is impossible before it.
6. Token movements use `SafeERC20`; `bet` and `claim` are `nonReentrant` with
   checks-effects-interactions (state updated before transfer).

**Known accepted trade-offs**

- Rake is floored off the _total_ pot before being split; the dust remainder
  stays locked in the contract (harmless, and bounded by wei-level rounding
  across users).
- `treasury` is immutable in the constructor, while `withdrawTreasury` takes a
  recipient — the operator chooses where to sweep, which is intentional (the
  constructor's `treasury` is the nominal owner and must be non-zero).
- The contract assumes a standard, non-fee-on-transfer, non-rebasing ERC-20. A
  fee-on-transfer token would break the escrow accounting; `$SACH` must be plain.

---

## 6. Build, test, deploy

### Setup

```bash
cd contracts
forge install foundry-rs/forge-std OpenZeppelin/openzeppelin-contracts
```

Installs into `contracts/lib/` (gitignored). Remappings are in `foundry.toml`:
`@openzeppelin/contracts/` and `forge-std/`.

### Build & test

```bash
forge build
forge test -vvv          # from contracts/
# or, from repo root:
yarn forge:test          # forge test --root contracts
```

`foundry.toml`: solc `0.8.24`, optimizer on (`runs = 200`), fuzz `runs = 256`.

### Export ABI & deploy

Deployment is a **viem script** (`scripts/deploy-market.ts`) rather than
`forge script`, so it reuses the app's chain config:

```bash
# from repo root, after `forge build`
yarn export:abi          # node scripts/export-abi.mjs
                         # copies out/SachetMarket.sol/SachetMarket.json ABI
                         # into lib/contracts/sachet-market.ts
yarn deploy:market       # prints MARKET_ADDRESS + MARKET_DEPLOY_BLOCK
```

Required env for deploy: `RPC_URL`, `SACH_TOKEN_ADDRESS`, `TREASURY_ADDRESS`,
`OPERATOR_PRIVATE_KEY`, `DEPLOYER_PRIVATE_KEY`, `MIN_STAKE`. The operator
address is derived from `OPERATOR_PRIVATE_KEY` so it can never drift from the
key the app signs with.

After deploy, set `MARKET_ADDRESS` and `MARKET_DEPLOY_BLOCK` (server + matching
`NEXT_PUBLIC_*` mirror for the address) in the app env. The indexer starts at
`MARKET_DEPLOY_BLOCK`.

---

## 7. How the app drives the contract

| Step       | Off-chain code                                                                        | Contract call                            |
| ---------- | ------------------------------------------------------------------------------------- | ---------------------------------------- |
| Open pool  | `app/(app)/admin/actions.ts::openPoolAction` → `lib/market.ts::operatorCreatePool`    | `createPool(poolId, expiresAt, rakeBps)` |
| Place bet  | `components/pools/bet-sheet.tsx` (browser wallet)                                     | `bet(poolId, selection, amount)`         |
| Resolve    | `lib/football-sync.ts::settleFinishedMatches` or admin action → `operatorResolvePool` | `resolve(poolId, outcome)`               |
| Claim      | `components/wallet/claim-button.tsx` (browser wallet)                                 | `claim(poolId)`                          |
| Sweep rake | `lib/market.ts::operatorWithdrawTreasury`                                             | `withdrawTreasury(to)`                   |
| Mirror     | `lib/indexer.ts::runIndexer` via `/api/cron/index`                                    | `getLogs` + `parseEventLogs`             |

Amounts are always `bigint` base units on chain and stringified strings across
the RSC boundary.

---

## 8. Status

### Done

- Full `SachetMarket` implementation: pool lifecycle, escrow, proportional
  claims, void/no-winner refunds, rake accrual + sweep, operator rotation,
  configurable `minStake`.
- **25/25 Foundry tests passing**, including payout distribution, double-claim
  and double-resolve guards, void and no-winner refunds, treasury access
  control, and two fuzz invariants (256 runs each).
- Off-chain parity suite (`lib/odds.test.ts`) and pool-id derivation
  (`lib/onchain.ts`).
- ABI committed as `lib/contracts/sachet-market.ts` via `yarn export:abi`; viem
  operator helpers in `lib/market.ts`; deploy script in
  `scripts/deploy-market.ts`.

### Open / not yet done

- **No independent audit.** Treat the contract as unaudited until reviewed.
- **Not deployed to any live chain.** Deployment + manual end-to-end
  (open → bet → resolve → claim on a testnet) is still pending the Robinhood
  Chain env/keys.
- **No upgrade path.** The contract is immutable; a bug requires a new deploy
  and event replay into the mirror.
- **No protocol-level pause or emergency drain.** There is no way to halt
  betting or rescue stuck funds beyond `withdrawTreasury` for rake.
- **Dust is not swept.** Rounding remainder stays in the contract by design.
- **Indexer integration test** (anvil + Postgres) is not in the suite; indexer
  correctness is only unit/fuzz-adjacent so far.

If you change the payout math, update `lib/odds.ts` **and**
`lib/odds.test.ts` in the same change, and re-run `yarn forge:test` plus
`yarn test`.
