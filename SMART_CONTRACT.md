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

A single deployed contract escrows all `$SACH` stakes for every match. The
operator (a server-held key) opens and resolves pools; bettors stake and later
**pull** their payout. There is no order book, no oracle, no per-match
contract — one singleton, many logical pools keyed by `bytes32`.

Design goals:

- **Chain is the ledger.** Every stake and payout is a token transfer; Postgres
  is only a mirror.
- **Deterministic pool ids.** One pool per match, derived off-chain so both
  sides agree without a registry.
- **Tiny trusted surface.** The operator can only open pools, resolve them, and
  sweep accrued rake. It can never touch user stakes directly.
- **Exact off-chain parity.** `lib/odds.ts` reproduces the payout math and is
  unit-tested against the same numbers (see `lib/odds.test.ts`).

---

## 2. Interface

Solidity `^0.8.24`, inherits OpenZeppelin `ReentrancyGuard`, uses `SafeERC20`.

### Constants

| Name                 | Type     | Value   | Meaning                  |
| -------------------- | -------- | ------- | ------------------------ |
| `OUTCOME_UNRESOLVED` | `uint8`  | `0`     | No result yet.           |
| `HOME`               | `uint8`  | `1`     | Home win.                |
| `DRAW`               | `uint8`  | `2`     | Draw.                    |
| `AWAY`               | `uint8`  | `3`     | Away win.                |
| `VOID`               | `uint8`  | `4`     | Cancelled → full refund. |
| `MAX_RAKE_BPS`       | `uint16` | `1000`  | Rake cap (10%).          |
| `BPS_DENOMINATOR`    | `uint16` | `10000` | Basis-point denominator. |

Selections accepted by `bet` are `1..3` only; `4` (VOID) is resolution-only.

### Immutables / storage

```solidity
IERC20  public immutable token;      // $SACH that is escrowed
address public immutable treasury;   // nominal rake recipient (constructor arg)
address public operator;             // server hot key; can be rotated
uint256 public minStake;             // minimum bet, token base units
uint256 public treasuryBalance;      // accrued rake awaiting withdrawal
mapping(bytes32 => Pool) private pools;
mapping(bytes32 => mapping(address => uint256[3])) private userStake;
mapping(bytes32 => mapping(address => bool)) public claimed;
```

### `struct Pool`

```solidity
struct Pool {
    uint64  expiresAt;        // betting closes at this timestamp
    uint16  rakeBps;          // rake for this pool (<= MAX_RAKE_BPS)
    uint8   outcome;          // 0 unresolved, 1/2/3, 4 void
    bool    exists;
    bool    resolved;
    bool    refundMode;       // true => everyone refunded, no rake
    uint256 totalStake;
    uint256[3] stakeBySelection; // [home, draw, away]
    uint256 winningStake;
    uint256 paidOut;
    uint256 treasuryCredit;   // rake credited for this pool
}
```

### Constructor

```solidity
constructor(address token_, address treasury_, address operator_, uint256 minStake_)
```

Reverts on any zero address: `token_`, `treasury_`, `operator_`.

### Functions

| Function                                                       | Access         | Notes                                                                                                                                                                                         |
| -------------------------------------------------------------- | -------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `createPool(bytes32 poolId, uint64 expiresAt, uint16 rakeBps)` | `onlyOperator` | Reverts `PoolExists`, `ExpiryInPast` (`expiresAt <= block.timestamp`), `RakeTooHigh` (`> 1000`).                                                                                              |
| `bet(bytes32 poolId, uint8 selection, uint256 amount)`         | anyone         | `nonReentrant`. Pulls `amount` via `transferFrom`. Reverts `PoolMissing`, `AlreadyResolved`, `BettingClosed` (at/after expiry), `InvalidSelection` (not 1–3), `StakeTooSmall` (`< minStake`). |
| `resolve(bytes32 poolId, uint8 outcome)`                       | `onlyOperator` | Reverts `PoolMissing`, `AlreadyResolved`, `PoolNotExpired` (before expiry), `InvalidOutcome` (not 1–4). Sets `refundMode` for `VOID` **or** when `winningStake == 0`.                         |
| `claim(bytes32 poolId)`                                        | anyone         | `nonReentrant`. Reverts `PoolMissing`, `NotResolved`, `AlreadyClaimed`, `NothingToClaim`. Pays refund (sum of all three stakes) or proportional win.                                          |
| `setOperator(address)`                                         | `onlyOperator` | Zero-address guarded; emits `OperatorChanged`.                                                                                                                                                |
| `setMinStake(uint256)`                                         | `onlyOperator` | Emits `MinStakeChanged`.                                                                                                                                                                      |
| `withdrawTreasury(address to)`                                 | `onlyOperator` | Zero-address guarded; sweeps `treasuryBalance` to `to`.                                                                                                                                       |
| `getPool(bytes32) → Pool`                                      | view           | Full pool struct.                                                                                                                                                                             |
| `getUserStake(bytes32, address) → (uint256,uint256,uint256)`   | view           | Per-selection stake for a user.                                                                                                                                                               |
| `claimed(bytes32, address) → bool`                             | view           | Public mapping.                                                                                                                                                                               |

### Events

```solidity
event PoolCreated(bytes32 indexed poolId, uint64 expiresAt, uint16 rakeBps);
event BetPlaced(bytes32 indexed poolId, address indexed bettor, uint8 selection, uint256 amount);
event PoolResolved(bytes32 indexed poolId, uint8 outcome, bool refundMode, uint256 winningStake, uint256 treasuryCredit);
event Claimed(bytes32 indexed poolId, address indexed bettor, uint256 amount);
event TreasuryWithdrawn(address indexed to, uint256 amount);
event OperatorChanged(address indexed operator);
event MinStakeChanged(uint256 minStake);
```

These are the exact events the indexer decodes (`lib/indexer.ts`). `PoolCreated`,
`BetPlaced`, `PoolResolved`, `Claimed` drive state; the other three are recorded
for audit only.

### Errors

`NotOperator`, `PoolExists`, `PoolMissing`, `AlreadyResolved`, `NotResolved`,
`BettingClosed`, `PoolNotExpired`, `InvalidSelection`, `InvalidOutcome`,
`RakeTooHigh`, `ExpiryInPast`, `StakeTooSmall`, `AlreadyClaimed`,
`NothingToClaim`. (Constructor/zero-address checks use `require` strings.)

---

## 3. Pool id derivation

One pool per match, derived deterministically off-chain:

```
poolId = keccak256(utf8("sachet:1x2:" + match.externalId))
```

`lib/onchain.ts::computeOnchainPoolId` is the single implementation; the admin
action (`app/(app)/admin/actions.ts`) persists it on the `Pool` row and passes
the same value to `createPool`. `createPool` also rejects a reused id
(`PoolExists`), so the mapping is enforceable on-chain.

---

## 4. Payout math (must match `lib/odds.ts`)

All arithmetic is integer with floor division; amounts are token base units.

```
rake            = floor(totalStake * rakeBps / 10000)        // on resolve, only if there is a winner
distributable   = totalStake - rake
payout(user)    = floor(distributable * userStakeOnWinner / winningStake)
refund(user)    = userStake[home] + userStake[draw] + userStake[away]   // refundMode
```

Rules:

- **`VOID`** outcome → `refundMode = true`, `treasuryCredit = 0`, everyone gets
  their exact stake back, no rake.
- **Winning selection with zero stake** → also `refundMode = true`, no rake.
  Nobody backed the winner, so refunding is the only fair outcome.
- **Normal resolution** → `treasuryCredit = floor(totalStake * rakeBps / 10000)`
  added to `treasuryBalance` at resolve time.
- Claim is **once per pool per address** and pays from the already-reserved
  `treasuryCredit`, so claimed sums can never exceed `distributable`
  (fuzz-tested).
- Rounding **dust stays in the contract**; `paidOut` and `treasuryBalance` track
  what leaves.

Off-chain parity lives in `lib/odds.ts`:

- `rakeAmount`, `distributablePot`, `winnerPayout` — identical integer math.
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
