# Admin Workflow

How to open, settle, and resolve `$SACH` pools — and what to do when a pool
"stays open" after its match is over.

Audience: operators with access to `/admin` and the deployment's environment
variables. For the product overview see [`README.md`](./README.md); for the
contract see [`SMART_CONTRACT.md`](./SMART_CONTRACT.md).

---

## 1. The mental model

- **The chain is the source of truth.** The `SachetMarket` contract escrows every
  stake and settles every pool. Postgres is only a *mirror* for reads (board,
  My bets, leaderboard).
- **A pool is two things:** an on-chain record (status `OPEN`/`LOCKED`/`RESOLVED`/
  `CANCELLED`, stakes, result) and a mirrored `Pool` row. They converge only when
  the indexer runs.
- **Settlement is an on-chain transaction.** Nothing resolves itself: a signer
  with `RESOLVER_ROLE` must call `resolvePool(poolId, outcome)` after the pool
  expires. The mirror then flips to `RESOLVED`/`VOID` when the indexer mirrors
  the `PoolResolved` event.

Outcome codes on-chain: `HOME = 1`, `DRAW = 2`, `AWAY = 3`, `VOID = 4`
(`UNSET = 0` is never a result).

---

## 2. Who can do what

| Action | Where | Requires |
| --- | --- | --- |
| View fixtures / pool details | `/board`, `/pools/[id]` | nothing (public) |
| Place a bet | bet sheet | a connected wallet with `$SACH` |
| Open the admin dashboard | `/admin` | SIWE session **and** address in `ADMIN_ADDRESSES` |
| Open a pool (`launchPool`) | `/admin` | admin wallet holds on-chain `ADMIN_ROLE` |
| Resolve a pool (`resolvePool`) | `/admin` | admin wallet holds on-chain `RESOLVER_ROLE` |
| Auto-settle | `/api/cron/settle` | server `OPERATOR_PRIVATE_KEY` address holds `RESOLVER_ROLE` |
| Mirror chain → DB | `/api/cron/index` | `CRON_SECRET` |

Two different signers exist, don't confuse them:

- **Manual resolve** in `/admin` is signed by the **admin's own connected
  wallet** (`components/admin/admin-panel.tsx`). It must hold the on-chain role.
- **Auto-settle** via `/api/cron/settle` is signed by the server
  **operator key** (`lib/market.ts` → `resolvePool`).

---

## 3. Prerequisites

Set these in the deployment (see `.env.example`):

| Variable | Purpose |
| --- | --- |
| `CRON_SECRET` | Bearer/`?secret=` guard for `/api/cron/*` and `/api/sync/*`. |
| `OPERATOR_PRIVATE_KEY` | Server key that signs auto-settle `resolvePool` calls. |
| `ADMIN_ADDRESSES` | CSV allowlist for `/admin` (off-chain gate). |
| `FOOTBALL_PROVIDER` | `football-data` (default) or `api-sports`. Must match ingested fixtures. |
| `MARKET_ADDRESS`, `MARKET_DEPLOY_BLOCK`, `INDEXER_RPC_URL` | Indexer + market config. |

On-chain: the operator address must be granted `RESOLVER_ROLE`, and any admin
who resolves from `/admin` must hold `RESOLVER_ROLE`; whoever opens pools needs
`ADMIN_ROLE`.

---

## 4. How a pool settles (two paths)

### 4a. Automatic — the settle cron

`GET/POST /api/cron/settle` runs `settleFinishedMatches` (`lib/football-sync.ts`):

1. Finds matches whose kickoff has passed and whose pool is still `OPEN`/`LOCKED`
   (most recent first, up to 100 per run).
2. Refreshes only matches belonging to the active provider
   (`externalId` starts with `${FOOTBALL_PROVIDER}:`).
3. If the fixture is finished, computes `HOME`/`DRAW`/`AWAY` from the score and
   calls `resolvePool` with the operator key. If it is cancelled/postponed, calls
   `resolvePool(..., VOID)` (full refunds).
4. The indexer mirrors the `PoolResolved` event; bets become claimable.

**This only runs if something calls the endpoint.** If no scheduler is set up,
pools never auto-settle. Vercel example (`vercel.json`):

```json
{
  "crons": [
    { "path": "/api/cron/index", "schedule": "*/2 * * * *" },
    { "path": "/api/cron/settle", "schedule": "*/10 * * * *" }
  ]
}
```

Vercel sends `Authorization: Bearer $CRON_SECRET` automatically when that env
var is set. Note plan limits (Hobby allows only daily crons); otherwise use any
external scheduler, or run the endpoint manually (below).

### 4b. Manual — the `/admin` resolve queue

Use this when the provider has no/mismatched data, the result is disputed, the
match was cancelled, or auto-settle was never scheduled.

1. Sign in at `/admin` with an allowlisted admin wallet that holds
   `RESOLVER_ROLE` on-chain.
2. Under **Resolve pools**, find the fixture. The row shows the DB status
   (`OPEN`/`LOCKED`), the staked total, and `expired`/`open`.
3. **Wait until the row says `expired`.** `resolvePool` reverts with
   `PoolStillOpen` if `block.timestamp < expiresAt`.
4. Pick `HOME`, `DRAW`, `AWAY`, or `VOID` and click **Resolve**. Your wallet
   signs `resolvePool`; the page waits for the receipt and then saves the result.
5. Run the indexer (or wait for the cron) so the mirror updates; bets flip to
   `WON`/`LOST`/`VOID` and winners can claim from **My bets**.

`VOID` is the refund path: every stake (and cancelled fixtures) refunds in full,
no rake. It is issued through `resolvePool(..., VOID)`, not `cancelPool`.

---

## 5. Verifying a settlement

- On the contract: the pool status is `RESOLVED`, a `PoolResolved(poolId, result)`
  event exists, and `winningSelection` is set.
- In the app: the pool detail page shows **Result: …** and **Final pot**.
- Mirror: the `Pool` row is `RESOLVED`/`VOID` and its `resolvedTxHash` is set;
  `Bet` rows move to `WON`/`LOST`/`VOID`.
- Winners: **My bets** shows a claimable row; `claim` is a pull payment the
  bettor signs.

Manual command reference:

```bash
# Mirror new chain events into Postgres (safe every 1–2 min)
curl -H "Authorization: Bearer $CRON_SECRET" https://HOST/api/cron/index

# Auto-settle expired pools (safe ~every 10 min)
curl -H "Authorization: Bearer $CRON_SECRET" https://HOST/api/cron/settle

# ...for a specific provider (when fixtures came from a different one)
curl -H "Authorization: Bearer $CRON_SECRET" "https://HOST/api/cron/settle?provider=football-data"

# Ingest fixtures before opening a pool
curl -X POST -H "Authorization: Bearer $CRON_SECRET" -H "Content-Type: application/json" \
  -d '{"league":"PL","season":2026}' https://HOST/api/sync/fixtures

# Local: drain the indexer backlog immediately
yarn indexer:backfill
```

`?secret=$CRON_SECRET` works in place of the Authorization header.

---

## 6. Troubleshooting: "the match is over but the pool still shows open"

Work down this list in order.

| # | Cause | Check | Fix |
| --- | --- | --- | --- |
| 1 | **No scheduler is calling `/api/cron/settle`.** Most common. | Is a cron configured (Vercel `crons`, GitHub Action, etc.)? | Schedule it (§4a) or resolve manually (§4b). |
| 2 | **On-chain `expiresAt` is later than the match.** A pool opened with a late/incorrect `closesAt` cannot be resolved early — `resolvePool` reverts `PoolStillOpen`. | Pool detail "Betting closed" time; contract `getPool`. | Wait until `expiresAt`, then resolve. Set `closesAt` = kickoff when opening next time. |
| 3 | **The provider hasn't marked the match finished** (score not final). | `/board` match status; `getFixturesByIds` result. | Wait, re-sync fixtures, or resolve manually if the result is known. |
| 4 | **Provider mismatch.** The pool's match `externalId` isn't namespaced with the active `FOOTBALL_PROVIDER`. | `Match.externalId` prefix vs `FOOTBALL_PROVIDER`. | Settle with `?provider=<the ingesting provider>` or set `FOOTBALL_PROVIDER` to match. |
| 5 | **Signer lacks the role.** Auto-settle operator or admin wallet not granted `RESOLVER_ROLE`. | Revert reason `AccessControlUnauthorizedAccount`. | Grant `RESOLVER_ROLE` to the operator/admin address. |
| 6 | **Resolved on-chain but the DB still says OPEN.** The resolve tx mined, but the indexer hasn't mirrored it. | `Pool.resolvedTxHash` is null while the contract shows `RESOLVED`. | Run `/api/cron/index` (or `yarn indexer:backfill`), then reload. |
| 7 | **Contract paused.** `resolvePool` reverts while paused. | `paused()` on the contract. | Unpause (`ADMIN_ROLE`), then resolve. |
| 8 | **Already resolved.** Someone resolved it first (`AlreadyResolvedOrCancelled`). | Contract status `RESOLVED`. | Run the indexer; no action needed. |
| 9 | **Pool opened days ago, before auto-settle was reliable.** | Old `kickoffAt`, still `OPEN`. | The settle cron now retries every past unresolved match (100/run, newest first); run it a few times, or resolve manually. |

Why the board can look "inconsistent": `PoolStatus.LOCKED` is **derived at read
time** from `closesAt` — the DB row stays `OPEN` until a `PoolResolved` event is
mirrored. So a past-kickoff pool disappears from `/board` (which filters
`closesAt > now`) and shows "Betting closed" on its detail page, while the admin
queue still labels it `OPEN`. That label means "awaiting resolution", not
"accepting bets".

---

## 7. Operating checklist

- [ ] `CRON_SECRET` set and a scheduler pointing at `/api/cron/index` (1–2 min)
      and `/api/cron/settle` (10 min).
- [ ] `OPERATOR_PRIVATE_KEY` address has `RESOLVER_ROLE`; admins in
      `ADMIN_ADDRESSES` have the roles they use.
- [ ] `FOOTBALL_PROVIDER` matches the fixtures in the DB.
- [ ] Open pools with `closesAt` equal to kickoff (never a padded expiry).
- [ ] After any resolve, confirm `/api/cron/index` has run so the mirror and
      claims update.
- [ ] Spot-check `/admin` after each match weekend for pools still `OPEN` past
      kickoff and clear them.
