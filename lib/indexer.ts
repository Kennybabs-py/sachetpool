import "server-only";
import { parseEventLogs } from "viem";
import type { Address, Hash } from "viem";
import { prisma } from "./prisma";
import { publicClient } from "./chain/server-client";
import { sachetMarketAbi } from "./contracts/sachet-market";
import { chain, MARKET_ADDRESS, MARKET_DEPLOY_BLOCK } from "@/config/chains";
import { codeToSelection } from "./onchain";
import { winnerPayout } from "./odds";
import {
  BetStatus,
  PoolStatus,
  Selection,
  type Prisma,
} from "@/generated/prisma/client";

/**
 * Chain → Postgres mirror.
 *
 * Reads `ChainCursor`, pulls `SachetMarket` logs from `lastBlock + 1` up to
 * `latest − INDEXER_CONFIRMATIONS`, and applies them in order. Handlers are
 * idempotent and each raw log is also recorded in `ChainEvent`, so a crash
 * mid-run simply replays safely on the next invocation.
 *
 * The chain is always the source of truth; this mirror only feeds reads.
 */

const CONFIRMATIONS = (() => {
  const raw = Number(process.env.INDEXER_CONFIRMATIONS);
  return Number.isFinite(raw) && raw >= 0 ? raw : 5;
})();

export interface IndexResult {
  fromBlock: string;
  toBlock: string;
  latestBlock: string;
  processed: number;
  skipped: number;
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

// ── Event handlers ─────────────────────────────────────────────────────────

async function handlePoolCreated(args: Record<string, unknown>) {
  const poolId = String(args.poolId);
  await prisma.pool.updateMany({
    where: { onchainPoolId: poolId },
    data: { status: PoolStatus.OPEN },
  });
}

async function handleBetPlaced(
  args: Record<string, unknown>,
  log: DecodedLog,
) {
  const poolId = String(args.poolId);
  const bettor = String(args.bettor).toLowerCase();
  const selection = codeToSelection(Number(args.selection));
  const amount = BigInt(args.amount as bigint);
  const txHash = log.transactionHash;
  const logIndex = log.logIndex ?? 0;

  const pool = await prisma.pool.findUnique({
    where: { onchainPoolId: poolId },
    select: { id: true },
  });
  if (!pool) return;
  if (!selection) return;

  const existing = await prisma.bet.findUnique({
    where: { txHash_logIndex: { txHash, logIndex } },
    select: { id: true },
  });
  if (existing) return; // already mirrored

  const user = await prisma.user.upsert({
    where: { address: bettor },
    update: {},
    create: { address: bettor },
    select: { id: true },
  });

  await prisma.bet.create({
    data: {
      poolId: pool.id,
      userId: user.id,
      address: bettor,
      selection,
      amount,
      status: BetStatus.PENDING,
      txHash,
      logIndex,
      blockNumber: log.blockNumber ?? 0n,
    },
  });

  const stakeField: "stakeHome" | "stakeDraw" | "stakeAway" =
    selection === Selection.HOME
      ? "stakeHome"
      : selection === Selection.DRAW
        ? "stakeDraw"
        : "stakeAway";

  await prisma.pool.update({
    where: { id: pool.id },
    data: {
      totalStake: { increment: amount },
      [stakeField]: { increment: amount },
    },
  });
}

async function handlePoolResolved(
  args: Record<string, unknown>,
  log: DecodedLog,
) {
  const poolId = String(args.poolId);
  const outcome = Number(args.outcome);
  const refundMode = Boolean(args.refundMode);

  const pool = await prisma.pool.findUnique({
    where: { onchainPoolId: poolId },
  });
  if (!pool) return;
  if (
    pool.status === PoolStatus.RESOLVED ||
    pool.status === PoolStatus.VOID
  ) {
    return; // already applied
  }

  const selection = codeToSelection(outcome);
  const status =
    outcome === 4 || !selection ? PoolStatus.VOID : PoolStatus.RESOLVED;

  await prisma.pool.update({
    where: { id: pool.id },
    data: {
      status,
      winningSelection: selection ?? undefined,
      resolvedTxHash: log.transactionHash,
      settledAt: new Date(),
    },
  });

  const winningStake =
    selection === Selection.HOME
      ? pool.stakeHome
      : selection === Selection.DRAW
        ? pool.stakeDraw
        : pool.stakeAway;

  const bets = await prisma.bet.findMany({
    where: { poolId: pool.id, status: BetStatus.PENDING },
  });

  for (const bet of bets) {
    if (refundMode) {
      await prisma.bet.update({
        where: { id: bet.id },
        data: { status: BetStatus.VOID, payout: bet.amount },
      });
      continue;
    }
    if (bet.selection === selection) {
      const payout = winnerPayout(
        pool.totalStake,
        bet.amount,
        winningStake,
        pool.rakeBps,
      );
      await prisma.bet.update({
        where: { id: bet.id },
        data: { status: BetStatus.WON, payout },
      });
    } else {
      await prisma.bet.update({
        where: { id: bet.id },
        data: { status: BetStatus.LOST, payout: 0n },
      });
    }
  }
}

async function handleClaimed(args: Record<string, unknown>, log: DecodedLog) {
  const poolId = String(args.poolId);
  const bettor = String(args.bettor).toLowerCase();

  const pool = await prisma.pool.findUnique({
    where: { onchainPoolId: poolId },
    select: { id: true },
  });
  if (!pool) return;

  await prisma.bet.updateMany({
    where: {
      poolId: pool.id,
      address: bettor,
      status: { in: [BetStatus.WON, BetStatus.VOID] },
    },
    data: {
      status: BetStatus.CLAIMED,
      claimTxHash: log.transactionHash,
    },
  });
}

async function applyLog(log: DecodedLog) {
  switch (log.eventName) {
    case "PoolCreated":
      return handlePoolCreated(log.args);
    case "BetPlaced":
      return handleBetPlaced(log.args, log);
    case "PoolResolved":
      return handlePoolResolved(log.args, log);
    case "Claimed":
      return handleClaimed(log.args, log);
    default:
      return; // TreasuryWithdrawn / OperatorChanged / MinStakeChanged: audit only
  }
}

// ── Runner ─────────────────────────────────────────────────────────────────

/**
 * Pull and apply all newly-finalized logs. Safe to run on a tight schedule:
 * a no-op when there is nothing new. Throws if `MARKET_ADDRESS` is unset.
 */
export async function runIndexer(): Promise<IndexResult> {
  if (!MARKET_ADDRESS) {
    throw new Error("MARKET_ADDRESS is not configured");
  }
  const address = MARKET_ADDRESS as Address;

  const latest = await publicClient.getBlockNumber();
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
    };
  }

  const rawLogs = await publicClient.getLogs({
    address,
    fromBlock: startBlock,
    toBlock: safe,
  });

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
        poolId:
          typeof log.args.poolId === "string" ? log.args.poolId : null,
        payload: jsonSafe(log.args),
      },
    });
    processed++;
  }

  await prisma.chainCursor.upsert({
    where: { id },
    update: { lastBlock: safe },
    create: { id, lastBlock: safe },
  });

  return {
    fromBlock: startBlock.toString(),
    toBlock: safe.toString(),
    latestBlock: latest.toString(),
    processed,
    skipped: rawLogs.length - decoded.length,
  };
}
