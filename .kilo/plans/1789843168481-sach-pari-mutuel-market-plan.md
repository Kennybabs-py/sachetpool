# $SACH Pari-Mutuel Prediction Market — Implementation Plan

## Goal

Replace the repo's play-money points economy with a real prediction market where
users stake the `$SACH` ERC-20 (Robinhood Chain) on 1X2 football outcomes.
Funds are escrowed in an on-chain singleton market contract until the match is
resolved, then winners pull their pari-mutuel payout.

## Architecture (decided)

- **Escrow:** on-chain singleton `SachetMarket` contract holds all `$SACH`.
- **Pool admin:** admin dashboard opens pools on-chain with `poolId`,
  `expiresAt` (selection expiry, default kickoff) and `rakeBps`. Betting is
  rejected on-chain after expiry and after resolution.
- **Resolution:** the football-sync cron refreshes final scores and the operator
  key auto-calls `resolve()`; admin dashboard exposes a manual Resolve/Void
  override. Both paths execute through the server-held operator key.
- **Payouts:** pull model. Winners/refundees call `claim()`.
- **Reads/aggregation:** a polling event indexer mirrors chain state into
  Postgres for the board, history, and leaderboard. Chain is source of truth.
- **Identity:** NextAuth v5 SIWE, lowercase wallet address is the identity.
- **Network:** Robinhood Chain testnet first, mainnet via config flip.
- **Economy:** drop points/Stars/faucet/seasons/Telegram. Keep accuracy
  leaderboard, re-denominated in `$SACH`.
- **Markets:** one `RESULT_1X2` pool per match (HOME=1, DRAW=2, AWAY=3, VOID=4).
- **Toolchain:** Foundry for contract tests; viem TypeScript deploy script.

## Required inputs (must be provided before deploy)

| Env var | Meaning |
|---|---|
| `CHAIN_ID` | Robinhood Chain id (testnet) |
| `CHAIN_NAME` | Display name |
| `RPC_URL` | HTTP RPC for the chain |
| `EXPLORER_URL` | Block explorer base URL |
| `SACH_TOKEN_ADDRESS` | `$SACH` ERC-20 address |
| `SACH_TOKEN_DECIMALS` | Token decimals (UI formatting) |
| `TREASURY_ADDRESS` | Receives rake |
| `OPERATOR_PRIVATE_KEY` | Server hot key: createPool/resolve/withdraw |
| `DEPLOYER_PRIVATE_KEY` | One-time deploy key |
| `ADMIN_ADDRESSES` | CSV allowlist for the admin dashboard |
| `INDEXER_CONFIRMATIONS` | Reorg depth to wait (default 5) |
| `MARKET_ADDRESS` | Filled after deploy |

Assumptions to confirm: `$SACH` is a standard ERC-20 (no EIP-2612 permit
required); native gas token is ETH.

## Repo blockers to fix first

1. `prisma/schema.prisma` is **empty** (no models/enums). Rebuild it (Phase 3).
2. Generated-client path is wrong. Intended output is repo-root
   `generated/prisma` (all imports use `@/generated/prisma/client` and
   `lib/prisma.ts` uses `../generated/prisma/client`). Set generator
   `output = "../generated/prisma"` and change `.gitignore` to
   `/generated/prisma` (remove `/prisma/generated/prisma`).
3. Two auth systems: `lib/session.ts` imports non-existent `@/lib/auth`
   (better-auth) while `config/nextauthConfg.ts` implements NextAuth v5 SIWE.
   Standardize on NextAuth; remove `better-auth`.
4. Referenced-but-missing: `app/(app)/actions.ts`,
   `app/(app)/wallet/actions.ts`, `lib/telegram/webapp`, `lib/auth`.
5. `vitest` is imported by `lib/*.test.ts` but not installed and has no script.

## Phase 1 — Contract (`contracts/`)

Create a Foundry project at `contracts/`.

`src/SachetMarket.sol` — immutable `token`, `treasury`, mutable `operator`,
`minStake`, `MAX_RAKE_BPS = 1000`.

```solidity
function createPool(bytes32 poolId, uint64 expiresAt, uint16 rakeBps) external onlyOperator;
function bet(bytes32 poolId, uint8 selection, uint256 amount) external nonReentrant;
function resolve(bytes32 poolId, uint8 outcome) external onlyOperator;
function claim(bytes32 poolId) external nonReentrant;
function setOperator(address) external onlyOperator;
function setMinStake(uint256) external onlyOperator;
function withdrawTreasury(address to) external onlyOperator;
```

State per pool: `expiresAt`, `rakeBps`, `outcome` (0 = unresolved),
`refundMode`, `totalStake`, `stakeBySelection[3]`, `winningStake`, `paidOut`,
`treasuryCredit`. Per user: `userStake[poolId][address][3]`, `claimed`.

Behaviour:
- `createPool`: operator-only; require `expiresAt > block.timestamp`,
  `rakeBps <= MAX_RAKE_BPS`, pool not already created.
- `bet`: require unresolved, `block.timestamp < expiresAt`, `selection` in
  1..3, `amount >= minStake`; `transferFrom` user to contract; update totals.
- `resolve`: operator-only; require `block.timestamp >= expiresAt` and
  unresolved. `outcome` in {HOME, DRAW, AWAY, VOID}. Set `refundMode` when
  `VOID` or `winningStake == 0`; credit `rake = totalStake * rakeBps / 10000`
  to `treasuryCredit` only in non-refund mode.
- `claim`: require resolved and not claimed. Refund mode pays the user's summed
  stake; otherwise payout `= floor(distributable * userStake[winner] /
  winningStake)` where `distributable = totalStake - rake`. Losers revert
  `NOTHING_TO_CLAIM`. Track `paidOut`.
- Use SafeERC20, CEI ordering, `ReentrancyGuard`.
- Events: `PoolCreated`, `BetPlaced`, `PoolResolved`, `Claimed`,
  `TreasuryWithdrawn`.

Tests (`test/SachetMarket.t.sol`), using a mock ERC-20:
- fuzz the proportional split and assert `sum(payouts) <= distributable`;
- expiry, double-resolve, double-claim, unauthorized resolve/create, min-stake,
  invalid selection, refund on VOID, refund on no-winners, rake bounds.

## Phase 2 — Chain config, ABI, deploy

- `config/chains.ts`: `defineChain` from env; export the chain object.
- Update `config/wagmiConfig.ts` and `config/rainbowkitConfig.ts` to use it
  (drop mainnet/polygon/etc.).
- `lib/chain/server-client.ts`: viem public client + wallet client bound to
  `OPERATOR_PRIVATE_KEY`.
- `lib/contracts/sachet-market.ts`: exported ABI (generated).
- `scripts/export-abi.mjs`: copy `contracts/out/SachetMarket.sol/SachetMarket.json`
  ABI into `lib/contracts/sachet-market.ts`.
- `scripts/deploy-market.ts`: viem deploy, constructor args
  (`token`, `treasury`, `operator`, `minStake`), print `MARKET_ADDRESS`.

## Phase 3 — Prisma schema + migration

Rewrite `prisma/schema.prisma` (Postgres, generator output `../generated/prisma`).

Enums: `MatchStatus {SCHEDULED,LIVE,FINISHED,POSTPONED,CANCELLED}`,
`PoolType {RESULT_1X2}`,
`PoolStatus {PENDING_ONCHAIN,OPEN,LOCKED,RESOLVED,VOID}`,
`Selection {HOME,DRAW,AWAY}`,
`BetStatus {PENDING,WON,LOST,VOID,CLAIMED}`.

Models:
- `User` — `id`, `address` unique (lowercase), `createdAt`, `bets`.
- `Match` — existing fields (`externalId` unique, league, season, teams, logos,
  `kickoffAt`, `status`, scores, `settledAt`), `pools`.
- `Pool` — `id`, `matchId`, `onchainPoolId` unique (0x bytes32), `type`,
  `status`, `rakeBps`, `closesAt`, `createdBy`, `createTxHash`,
  `totalStake/stakeHome/stakeDraw/stakeAway` `BigInt`, `winningSelection?`,
  `resolvedTxHash?`, `settledAt?`; `@@unique([matchId, type])`.
- `Bet` — `id`, `poolId`, `userId`, `address`, `selection`, `amount BigInt`,
  `status`, `payout BigInt`, `txHash`, `logIndex`, `blockNumber BigInt`,
  `claimTxHash?`; `@@unique([txHash, logIndex])`, indexes on pool/status/user.
- `ChainEvent` — `txHash`, `logIndex`, `blockNumber`, `address`, `eventName`,
  `poolId?`, `payload Json`; `@@unique([txHash, logIndex])`.
- `ChainCursor` — `id = "<chainId>:<market>"`, `lastBlock BigInt`.

`onchainPoolId = keccak256(utf8("sachet:1x2:" + match.externalId))` — stable and
idempotent, one pool per match. Delete `Season`, `SeasonReward`, `StarPurchase`
and points-ledger models. Run `prisma migrate dev` against a **dev Neon branch**.

## Phase 4 — Auth / identity

- Keep `config/nextauthConfg.ts`; add `events.signIn` to upsert `User` by
  lowercase address.
- Rewrite `lib/session.ts` on NextAuth `auth()`; `getSessionUser()` returns the
  address. Remove the `@/lib/auth` (better-auth) import and dependency.
- Point the SIWE verification `publicClient` at the Robinhood chain RPC (needed
  for ERC-1271 smart wallets).
- Note: betting needs only a wallet, not a session. The indexer upserts `User`
  rows for any address seen in `BetPlaced`.

## Phase 5 — Indexer

- `lib/indexer.ts`: read `ChainCursor`, `getLogs` for contract events from
  `lastBlock+1` to `latest - INDEXER_CONFIRMATIONS`, process in order.
  - `PoolCreated` -> Pool status `OPEN`, store tx hash.
  - `BetPlaced` -> upsert User + Bet (idempotent on `txHash`+`logIndex`),
    increment mirrored pool totals.
  - `PoolResolved` -> set `winningSelection`, status `RESOLVED`/`VOID`,
    update settled bets (`WON`/`LOST`/`VOID`), record `payout` seeds.
  - `Claimed` -> set Bet `CLAIMED`, store `claimTxHash`.
  - Persist raw event in `ChainEvent`, advance `ChainCursor`.
- `app/api/cron/index/route.ts` — `assertCronAuthorized`, GET+POST, calls the
  indexer. Schedule every 1–2 minutes.

## Phase 6 — Admin dashboard + pool lifecycle

- `lib/admin.ts`: `isAdmin(address)` against `ADMIN_ADDRESSES`, server-side only.
- `app/(app)/admin/page.tsx` (RSC, gated) + server actions:
  - **Open pool:** pick a `Match` with no pool; set `expiresAt` (default
    kickoff) and `rakeBps`; insert Pool `PENDING_ONCHAIN` with computed
    `onchainPoolId`, then operator `createPool`; store `createTxHash`. If the tx
    fails, leave `PENDING_ONCHAIN` for retry.
  - **Resolve/Void:** operator `resolve(poolId, outcome)` for pools past expiry.
- Derive `LOCKED` when `closesAt < now` in read queries (no cron needed).

## Phase 7 — Settlement automation

Rework `lib/football-sync.ts`: keep fixture upsert, **remove auto pool
creation**, keep score refresh/void detection. `settleFinishedMatches` now calls
operator `resolve()` for each pool with `onchainPoolId` and status `OPEN`/
`LOCKED`, mapping the score to HOME/DRAW/AWAY and postponed/cancelled to VOID.
Existing cron routes `app/api/cron/settle` stay; `app/api/cron/close-season` and
`lib/season-close.ts` are deleted.

## Phase 8 — UI (`app/(app)/`)

- `layout.tsx` — SIWE gate, wallet connect, nav, `$SACH` balance (`balanceOf`).
- `page.tsx` — board of open pools (`lib/pools.ts` rewritten to read the mirror;
  odds via `lib/odds.ts` `impliedMultiple`). Convert `BigInt` to `string`/number
  in the read layer — RSC cannot serialize `BigInt` to client components.
- `pools/[id]/page.tsx` — pool detail + bet sheet. Bet flow: check allowance,
  `approve(market, amount)` if needed, then `bet(poolId, selection, amount)` via
  wagmi `writeContract`; wait for receipt; `router.refresh()`.
- `my-bets/page.tsx` — mirrored bets; `claim()` button for `WON`/`VOID` bets.
- `leaderboard/page.tsx` — adapt `lib/leaderboard-core.ts` to count-based
  accuracy with `BigInt` amounts; reads mirrored settled bets.
- Adapt `components/pools/*` (board, card, bet sheet) to token decimals and
  on-chain min stake; keep `components/wallet/bet-row.tsx`; delete
  `tx-row.tsx`/`package-card.tsx`.

## Phase 9 — Removals

Delete `lib/points.ts`, `lib/stars.ts`, `lib/stars-catalog.*`, `lib/bot.ts`,
`lib/seasons.*`, `lib/season-close.ts`, `lib/rewards-catalog.*`,
`app/(app)/wallet/*`, `app/api/cron/close-season`, `lib/telegram/*`, and the
points-based settlement callers. Remove `better-auth` from `package.json`.
Keep `lib/settlement.ts` only if reused for the shared pari-mutuel math; the
authoritative math now lives in the contract.

## Phase 10 — Tests & validation

- Add `vitest` devDependency + `"test": "vitest run"`; keep the pure TS tests
  (`odds`, `leaderboard`).
- `forge test` for the contract (unit + fuzz).
- Indexer integration test against `anvil`: deploy the mock token + market,
  place/resolve/claim, assert the mirror matches chain state.
- Gates: `forge test`, `yarn test`, `yarn lint`, `tsc --noEmit`, `yarn build`.
- Manual E2E on Robinhood testnet: faucet `$SACH`, open a pool, bet, resolve,
  claim, confirm board/history/leaderboard.

## Risks / gotchas

- **BigInt serialization** across the RSC boundary — must stringify in read
  layers.
- **Approval + bet** is two transactions; surface both states in the UI.
- **Dust:** floored payouts leave rounding dust in the contract. Default for
  v1: dust stays in the contract, unwithdrawn (no sweep).
- **Reorgs:** only logs at `latest - INDEXER_CONFIRMATIONS` are trusted; deeper
  reorgs need manual reconciliation (out of scope).
- **Key custody:** `OPERATOR_PRIVATE_KEY` in server env controls pool creation,
  resolution, and rake withdrawal. Compromise = fund theft. Use a dedicated hot
  key with only the operator role, and plan a multisig migration post-MVP.
- **Resolution timeliness:** if the cron or API fails, a pool stays locked until
  the admin manually resolves. That is why the manual override exists.

## Open items (defaults assumed unless changed)

- Minimum stake: contract `minStake` set at deploy in token base units (propose
  1 `$SACH` equivalent).
- Claim deadline: none in v1; unclaimed winnings remain claimable indefinitely.
- Dust sweep: not implemented in v1.
- Admin actions execute via the server operator key (allowlist-gated), not by
  the admin's own wallet signature.
