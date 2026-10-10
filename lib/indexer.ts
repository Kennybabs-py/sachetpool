import "server-only";
import { parseEventLogs } from "viem";
import type { Address, Hash } from "viem";
import { prisma } from "./prisma";
import { indexerClient } from "./chain/server-client";
import { sachetMarketAbi } from "./contracts/sachet-market";
import { chain, MARKET_ADDRESS, MARKET_DEPLOY_BLOCK } from "@/config/chains";
import { codeToSelection } from "./onchain";
import { toAmountString } from "./amounts";
import { applyPoolResolution, reconcileSettledPools } from "./settlement";
import {
  BetStatus,
  PoolStatus,
  Selection,
  type Prisma,
} from "@/generated/prisma/client";

/**
 * Chain → Postgres mirror.
 *
 * Reads `ChainCursor` and pulls `SachetMarket` logs from `lastBlock + 1` up to
 * `latest − INDEXER_CONFIRMATIONS`, applying them in order. The chain is always
 * the source of truth; this mirror only feeds reads.
 *
 * Providers cap `eth_getLogs` to a small block span (Alchemy's free tier allows
 * 10 blocks), so a run is split into fixed-size chunks rather than one
 * unbounded query. Each invocation also has a block budget: a large backlog is
 * drained across several runs, while progress is persisted in `ChainCursor`.
 * Handlers are idempotent and every raw log is recorded in `ChainEvent`, so a
 * crash or a retried chunk replays safely.
 */

const CONFIRMATIONS = (() => {
  const raw = Number(process.env.INDEXER_CONFIRMATIONS);
  return Number.isFinite(raw) && raw >= 0 ? raw : 5;
})();

/** Max blocks per `eth_getLogs` call (Alchemy free tier: 10). */
const BLOCK_RANGE = (() => {
  const raw = Number(process.env.INDEXER_BLOCK_RANGE);
  return Number.isFinite(raw) && raw >= 1 ? Math.floor(raw) : 10;
})();

/**
 * Max blocks a single invocation advances. Keeps a backlog drain within the
 * serverless time budget; the cursor carries the rest to the next run.
 */
const MAX_BLOCKS_PER_RUN = (() => {
  const raw = Number(process.env.INDEXER_MAX_BLOCKS_PER_RUN);
  return Number.isFinite(raw) && raw >= 1 ? Math.floor(raw) : BLOCK_RANGE * 100;
})();

/**
 * Chunks fetched in parallel on each round. Kept low: Alchemy's free tier
 * returns 429 past ~10 in-flight `eth_getLogs` calls.
 */
const CONCURRENCY = (() => {
  const raw = Number(process.env.INDEXER_CONCURRENCY);
  return Number.isFinite(raw) && raw >= 1 ? Math.floor(raw) : 8;
})();

export interface IndexResult {
  fromBlock: string;
  toBlock: string;
  latestBlock: string;
  processed: number;
  skipped: number;
  /** True when the mirror has caught up to `latest − confirmations`. */
  caughtUp: boolean;
}

interface DecodedLog {
  eventName: string;
  args: Record<string, unknown>;
  blockNumber: bigint | null;
  logIndex: number | null;
  transactionHash: Hash;
}

/** Recursively convert bigint to string so a payload is JSON-serialisable. */
function jsonSafe(value: unknown): Prisma.InputJsonValue {
  if (typeof value === "bigint") return value.toString();
  if (Array.isArray(value)) return value.map(jsonSafe);
  if (value && typeof value === "object") {
    const out: Record<string, Prisma.InputJsonValue> = {};
    for (const [k, v] of Object.entries(value)) out[k] = jsonSafe(v);
    return out;
  }
  return value as Prisma.InputJsonValue;
}

function cursorId(): string {
  return `${chain.id}:${MARKET_ADDRESS ?? "unset"}`;
}

/**
 * Read a pool's snapshotted rake straight from the contract. The `PoolLaunched`
 * event does not carry it, so it has to be re-read; `null` on failure so the
 * handler can keep the row's existing value rather than zeroing it.
 */
async function readPoolRakeBps(poolId: string): Promise<number | null> {
  if (!MARKET_ADDRESS) return null;
  try {
    const pool = await indexerClient.readContract({
      address: MARKET_ADDRESS as Address,
      abi: sachetMarketAbi,
      functionName: "getPool",
      args: [poolId as `0x${string}`],
    });
    return Number(pool.rakeBps);
  } catch {
    return null;
  }
}

// ── Event handlers ─────────────────────────────────────────────────────────

async function handlePoolLaunched(args: Record<string, unknown>) {
  const poolId = String(args.poolId);
  const rakeBps = await readPoolRakeBps(poolId);
  await prisma.pool.updateMany({
    where: { onchainPoolId: poolId },
    data: {
      status: PoolStatus.OPEN,
      ...(rakeBps !== null ? { rakeBps } : {}),
    },
  });
}

async function handleBetPlaced(args: Record<string, unknown>, log: DecodedLog) {
  const poolId = String(args.poolId);
  const bettor = String(args.user).toLowerCase();
  const selection = codeToSelection(Number(args.outcome));
  const amount = BigInt(args.amount as bigint);
  const txHash = log.transactionHash;
  const logIndex = log.logIndex ?? 0;

  const pool = await prisma.pool.findUnique({
    where: { onchainPoolId: poolId },
    select: { id: true },
  });
  if (!pool) return;
  if (!selection) return;

  const user = await prisma.user.upsert({
    where: { address: bettor },
    update: {},
    create: { address: bettor },
    select: { id: true },
  });

  // One row per (pool, address): a live stake is topped up, a withdrawn one
  // restarts (the contract lets the outcome change once amount is back to 0).
  const existing = await prisma.bet.findUnique({
    where: { poolId_address: { poolId: pool.id, address: bettor } },
    select: { id: true, status: true },
  });

  if (existing) {
    const restart = existing.status === BetStatus.WITHDRAWN;
    await prisma.bet.update({
      where: { id: existing.id },
      data: {
        amount: restart ? amount.toString() : { increment: amount.toString() },
        selection,
        status: BetStatus.PENDING,
        payout: "0",
        claimed: false,
        txHash,
        logIndex,
        blockNumber: log.blockNumber ?? 0n,
      },
    });
  } else {
    await prisma.bet.create({
      data: {
        poolId: pool.id,
        userId: user.id,
        address: bettor,
        selection,
        amount: amount.toString(),
        status: BetStatus.PENDING,
        txHash,
        logIndex,
        blockNumber: log.blockNumber ?? 0n,
      },
    });
  }

  const stakeField: "stakeHome" | "stakeDraw" | "stakeAway" =
    selection === Selection.HOME
      ? "stakeHome"
      : selection === Selection.DRAW
        ? "stakeDraw"
        : "stakeAway";

  await prisma.pool.update({
    where: { id: pool.id },
    data: {
      totalStake: { increment: amount.toString() },
      [stakeField]: { increment: amount.toString() },
    },
  });
}

async function handleBetWithdrawn(args: Record<string, unknown>) {
  const poolId = String(args.poolId);
  const bettor = String(args.user).toLowerCase();
  const amount = BigInt(args.amount as bigint);

  const pool = await prisma.pool.findUnique({
    where: { onchainPoolId: poolId },
    select: { id: true },
  });
  if (!pool) return;

  const bet = await prisma.bet.findUnique({
    where: { poolId_address: { poolId: pool.id, address: bettor } },
    select: { id: true, selection: true },
  });
  if (!bet) return;

  await prisma.bet.update({
    where: { id: bet.id },
    data: { amount: "0", status: BetStatus.WITHDRAWN, payout: "0" },
  });

  const stakeField: "stakeHome" | "stakeDraw" | "stakeAway" =
    bet.selection === Selection.HOME
      ? "stakeHome"
      : bet.selection === Selection.DRAW
        ? "stakeDraw"
        : "stakeAway";

  await prisma.pool.update({
    where: { id: pool.id },
    data: {
      totalStake: { decrement: amount.toString() },
      [stakeField]: { decrement: amount.toString() },
    },
  });
}

async function handlePoolCancelled(args: Record<string, unknown>) {
  const poolId = String(args.poolId);
  const pool = await prisma.pool.findUnique({
    where: { onchainPoolId: poolId },
  });
  if (!pool) return;
  if (pool.status === PoolStatus.CANCELLED) return;

  await prisma.pool.update({
    where: { id: pool.id },
    data: { status: PoolStatus.CANCELLED },
  });

  const pending = await prisma.bet.findMany({
    where: { poolId: pool.id, status: BetStatus.PENDING },
    select: { id: true, amount: true },
  });
  for (const bet of pending) {
    await prisma.bet.update({
      where: { id: bet.id },
      data: { status: BetStatus.VOID, payout: toAmountString(bet.amount) },
    });
  }
}

async function handlePoolResolved(
  args: Record<string, unknown>,
  log: DecodedLog,
) {
  const poolId = String(args.poolId);
  const outcome = Number(args.result);

  const pool = await prisma.pool.findUnique({
    where: { onchainPoolId: poolId },
    select: { id: true },
  });
  if (!pool) return;

  // Shared with the admin `/admin` resolve path; idempotent, so replaying the
  // event after an admin confirm still settles any bets the action left behind.
  await applyPoolResolution(pool.id, outcome, log.transactionHash);
}

async function handleClaimed(args: Record<string, unknown>, log: DecodedLog) {
  const poolId = String(args.poolId);
  const bettor = String(args.user).toLowerCase();

  const pool = await prisma.pool.findUnique({
    where: { onchainPoolId: poolId },
    select: { id: true },
  });
  if (!pool) return;

  const bet = await prisma.bet.findUnique({
    where: { poolId_address: { poolId: pool.id, address: bettor } },
    select: { id: true, status: true },
  });
  if (!bet) return;

  // The contract marks every settled bet claimed, including losers (payout 0).
  await prisma.bet.update({
    where: { id: bet.id },
    data: {
      claimed: true,
      claimTxHash: log.transactionHash,
      status:
        bet.status === BetStatus.LOST ? BetStatus.LOST : BetStatus.CLAIMED,
    },
  });
}

async function applyLog(log: DecodedLog) {
  switch (log.eventName) {
    case "PoolLaunched":
      return handlePoolLaunched(log.args);
    case "BetPlaced":
      return handleBetPlaced(log.args, log);
    case "BetWithdrawn":
      return handleBetWithdrawn(log.args);
    case "PoolCancelled":
      return handlePoolCancelled(log.args);
    case "PoolResolved":
      return handlePoolResolved(log.args, log);
    case "Claimed":
      return handleClaimed(log.args, log);
    default:
      return;
  }
}

// ── Runner ─────────────────────────────────────────────────────────────────

interface FetchedChunk {
  rawCount: number;
  decoded: DecodedLog[];
}

/** Fetch and decode one `eth_getLogs` window, in chain order. */
async function fetchChunk(
  address: Address,
  fromBlock: bigint,
  toBlock: bigint,
): Promise<FetchedChunk> {
  const rawLogs = await indexerClient.getLogs({ address, fromBlock, toBlock });
  const decoded = parseEventLogs({
    abi: sachetMarketAbi,
    logs: rawLogs,
    strict: false,
  }) as unknown as DecodedLog[];

  decoded.sort((a, b) => {
    const blockA = a.blockNumber ?? 0n;
    const blockB = b.blockNumber ?? 0n;
    if (blockA < blockB) return -1;
    if (blockA > blockB) return 1;
    return (a.logIndex ?? 0) - (b.logIndex ?? 0);
  });

  return { rawCount: rawLogs.length, decoded };
}

/** Apply a chunk's logs in order. Idempotent: each raw log is deduped. */
async function applyChunk(
  address: Address,
  decoded: DecodedLog[],
): Promise<number> {
  let processed = 0;
  for (const log of decoded) {
    const txHash = log.transactionHash;
    const logIndex = log.logIndex ?? 0;

    const existing = await prisma.chainEvent.findUnique({
      where: { txHash_logIndex: { txHash, logIndex } },
      select: { id: true },
    });
    if (existing) continue;

    await applyLog(log);

    await prisma.chainEvent.create({
      data: {
        txHash,
        logIndex,
        blockNumber: log.blockNumber ?? 0n,
        address,
        eventName: log.eventName,
        poolId: typeof log.args.poolId === "string" ? log.args.poolId : null,
        payload: jsonSafe(log.args),
      },
    });
    processed++;
  }
  return processed;
}

/**
 * Pull and apply newly-finalized logs in fixed-size, bounded chunks. Safe to
 * run on a tight schedule: a no-op when there is nothing new. Advances the
 * cursor only past fully-applied chunks, so an interrupted run resumes cleanly.
 * Throws if `MARKET_ADDRESS` is unset.
 */
export async function runIndexer(): Promise<IndexResult> {
  if (!MARKET_ADDRESS) {
    throw new Error("MARKET_ADDRESS is not configured");
  }
  const address = MARKET_ADDRESS as Address;

  const latest = await indexerClient.getBlockNumber();
  const safe = latest - BigInt(CONFIRMATIONS);

  const id = cursorId();
  const cursor = await prisma.chainCursor.findUnique({ where: { id } });

  const startBlock = cursor
    ? cursor.lastBlock + 1n
    : BigInt(MARKET_DEPLOY_BLOCK);

  if (safe < startBlock) {
    return {
      fromBlock: startBlock.toString(),
      toBlock: safe.toString(),
      latestBlock: latest.toString(),
      processed: 0,
      skipped: 0,
      caughtUp: true,
    };
  }

  // Bound this run; the cursor carries any remaining backlog to the next one.
  const budgetEnd = startBlock + BigInt(MAX_BLOCKS_PER_RUN) - 1n;
  const windowEnd = budgetEnd < safe ? budgetEnd : safe;

  const chunks: [bigint, bigint][] = [];
  for (let from = startBlock; from <= windowEnd; from += BigInt(BLOCK_RANGE)) {
    const to = from + BigInt(BLOCK_RANGE) - 1n;
    chunks.push([from, to > windowEnd ? windowEnd : to]);
  }

  let processed = 0;
  let skipped = 0;
  let lastBlock = startBlock - 1n;

  for (let i = 0; i < chunks.length; i += CONCURRENCY) {
    const batch = chunks.slice(i, i + CONCURRENCY);

    let fetched: FetchedChunk[];
    try {
      fetched = await Promise.all(
        batch.map(([from, to]) => fetchChunk(address, from, to)),
      );
    } catch (err) {
      // Keep the position at the last fully-applied chunk. The cursor is not
      // advanced past this point, so the next run replays the failed batch.
      if (lastBlock < startBlock) throw err;
      break;
    }

    for (let j = 0; j < batch.length; j++) {
      const { rawCount, decoded } = fetched[j];
      processed += await applyChunk(address, decoded);
      skipped += rawCount - decoded.length;
      lastBlock = batch[j][1];
    }
  }

  if (lastBlock >= startBlock) {
    await prisma.chainCursor.upsert({
      where: { id },
      update: { lastBlock },
      create: { id, lastBlock },
    });
  }

  // Heal pools resolved through the admin path before it settled bets — the
  // on-chain event is already recorded, so replaying logs can't fix them.
  await reconcileSettledPools();

  return {
    fromBlock: startBlock.toString(),
    toBlock: lastBlock.toString(),
    latestBlock: latest.toString(),
    processed,
    skipped,
    caughtUp: lastBlock >= safe,
  };
}
