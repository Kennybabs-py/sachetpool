import "server-only";
import { prisma } from "./prisma";
import {
  BetStatus,
  MatchStatus,
  PoolStatus,
  PoolType,
  Selection,
} from "@/generated/prisma/client";
import {
  codeToSelection,
  computeOnchainPoolId,
  outcomeToCode,
  selectionToCode,
  type OnchainOutcome,
  type OnchainSelection,
} from "./onchain";
import { getOperatorAccount } from "./chain/server-client";
import {
  launchPool,
  operatorBet,
  operatorClaim,
  readOperatorTokenBalance,
  resolvePool,
} from "./market";
import { getGlobalRakeBps } from "./pools";
import { formatToken, parseToken } from "./format";
import { winnerPayout } from "./odds";
import { MARKET_ADDRESS, TOKEN_DECIMALS, TOKEN_SYMBOL } from "@/config/chains";

/**
 * Admin sandbox: a fixed dummy fixture exercised end-to-end through the real
 * contract and the Postgres mirror.
 *
 * The operator wallet plays every role — it opens the pool, stakes as the dummy
 * bettor, resolves, and claims — so one key drives the whole lifecycle. DB
 * writes mirror `lib/indexer.ts` exactly so the sandbox stays consistent with
 * what the indexer would have persisted; unlike the indexer, they apply
 * immediately instead of waiting for confirmations.
 *
 * Every step is exposed as its own function so the sandbox page can run them
 * one at a time and show the state between steps.
 */

export const SANDBOX_MATCH_EXTERNAL_ID = "sandbox:fixture";
export const SANDBOX_LEAGUE = "Sandbox League";
export const SANDBOX_HOME_TEAM = "Sandbox FC";
export const SANDBOX_AWAY_TEAM = "Fixture United";
export const SANDBOX_SEASON = 2026;

/** Expected, user-facing failure — surfaced verbatim by the server action. */
export class SandboxError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "SandboxError";
  }
}

// ── Serializable state for the page ─────────────────────────────────────────

export interface SandboxFixtureView {
  id: string;
  externalId: string;
  league: string;
  homeTeam: string;
  awayTeam: string;
  kickoffAtMs: number;
  status: MatchStatus;
}

export interface SandboxPoolView {
  id: string;
  onchainPoolId: string;
  status: PoolStatus;
  closesAtMs: number;
  createTxHash: string | null;
  resolvedTxHash: string | null;
  totalStake: string;
  stakeHome: string;
  stakeDraw: string;
  stakeAway: string;
  winningSelection: Selection | null;
  isExpired: boolean;
}

export interface SandboxBetView {
  id: string;
  address: string;
  selection: Selection;
  amount: string;
  payout: string;
  status: BetStatus;
  claimed: boolean;
  txHash: string;
  claimTxHash: string | null;
}

export interface SandboxState {
  /** True when `MARKET_ADDRESS` is configured for on-chain steps. */
  configured: boolean;
  operatorAddress: string | null;
  operatorBalance: string | null;
  fixture: SandboxFixtureView | null;
  pool: SandboxPoolView | null;
  bets: SandboxBetView[];
}

/** Snapshot the dummy fixture's DB state (plus a couple of on-chain reads). */
export async function getSandboxState(): Promise<SandboxState> {
  let operatorAddress: string | null = null;
  try {
    operatorAddress = getOperatorAccount().address;
  } catch {
    operatorAddress = null;
  }

  const match = await prisma.match.findUnique({
    where: { externalId: SANDBOX_MATCH_EXTERNAL_ID },
    include: {
      pools: {
        include: { bets: { orderBy: { createdAt: "asc" } } },
      },
    },
  });

  const pool = match?.pools[0] ?? null;
  const now = Date.now();

  let operatorBalance: string | null = null;
  if (MARKET_ADDRESS) {
    try {
      operatorBalance = (await readOperatorTokenBalance()).toString();
    } catch {
      operatorBalance = null;
    }
  }

  return {
    configured: Boolean(MARKET_ADDRESS),
    operatorAddress,
    operatorBalance,
    fixture: match
      ? {
          id: match.id,
          externalId: match.externalId,
          league: match.league,
          homeTeam: match.homeTeam,
          awayTeam: match.awayTeam,
          kickoffAtMs: match.kickoffAt.getTime(),
          status: match.status,
        }
      : null,
    pool: pool
      ? {
          id: pool.id,
          onchainPoolId: pool.onchainPoolId,
          status: pool.status,
          closesAtMs: pool.closesAt.getTime(),
          createTxHash: pool.createTxHash,
          resolvedTxHash: pool.resolvedTxHash,
          totalStake: pool.totalStake.toString(),
          stakeHome: pool.stakeHome.toString(),
          stakeDraw: pool.stakeDraw.toString(),
          stakeAway: pool.stakeAway.toString(),
          winningSelection: pool.winningSelection,
          isExpired: pool.closesAt.getTime() <= now,
        }
      : null,
    bets: (pool?.bets ?? []).map((bet) => ({
      id: bet.id,
      address: bet.address,
      selection: bet.selection,
      amount: bet.amount.toString(),
      payout: bet.payout.toString(),
      status: bet.status,
      claimed: bet.claimed,
      txHash: bet.txHash,
      claimTxHash: bet.claimTxHash,
    })),
  };
}

// ── Step 1: sync & populate the DB with a dummy fixture ─────────────────────

export async function syncDummyFixture(): Promise<string> {
  const existing = await prisma.match.findUnique({
    where: { externalId: SANDBOX_MATCH_EXTERNAL_ID },
    select: { id: true },
  });
  if (existing) return "Dummy fixture is already synced.";

  await prisma.match.create({
    data: {
      externalId: SANDBOX_MATCH_EXTERNAL_ID,
      league: SANDBOX_LEAGUE,
      season: SANDBOX_SEASON,
      homeTeam: SANDBOX_HOME_TEAM,
      awayTeam: SANDBOX_AWAY_TEAM,
      kickoffAt: new Date(Date.now() + 60 * 60 * 1000),
      status: MatchStatus.SCHEDULED,
    },
  });

  return "Dummy fixture synced to the database.";
}

// ── Step 2: simulate creating a dummy pool ──────────────────────────────────

export async function createDummyPool(input: {
  closesInSec: number;
}): Promise<string> {
  if (!MARKET_ADDRESS) {
    throw new SandboxError("MARKET_ADDRESS is not configured.");
  }

  const match = await prisma.match.findUnique({
    where: { externalId: SANDBOX_MATCH_EXTERNAL_ID },
    include: { pools: { select: { id: true } } },
  });
  if (!match) throw new SandboxError("Sync the dummy fixture first.");
  if (match.pools.length > 0) {
    throw new SandboxError("This fixture already has a pool.");
  }

  const closesInSec = Math.max(30, Math.trunc(input.closesInSec));
  const closesAtSec = Math.floor(Date.now() / 1000) + closesInSec;
  const onchainPoolId = computeOnchainPoolId(match.externalId);

  const pool = await prisma.pool.create({
    data: {
      matchId: match.id,
      onchainPoolId,
      type: PoolType.RESULT_1X2,
      status: PoolStatus.PENDING_ONCHAIN,
      closesAt: new Date(closesAtSec * 1000),
      rakeBps: await getGlobalRakeBps(),
    },
    select: { id: true },
  });

  try {
    const txHash = await launchPool(onchainPoolId, closesAtSec);
    await prisma.pool.update({
      where: { id: pool.id },
      data: { status: PoolStatus.OPEN, createTxHash: txHash },
    });
  } catch (err) {
    throw new SandboxError(
      `Pool row saved as PENDING_ONCHAIN, but launchPool failed: ${
        err instanceof Error ? err.message : "unknown error"
      }`,
    );
  }

  return `Dummy pool opened on-chain (closes in ${closesInSec}s).`;
}

// ── Step 3: simulate betting on the dummy pool ──────────────────────────────

export async function placeDummyBet(input: {
  selection: OnchainSelection;
  /** Decimal string, token units (e.g. "5"). */
  amount: string;
}): Promise<string> {
  const match = await prisma.match.findUnique({
    where: { externalId: SANDBOX_MATCH_EXTERNAL_ID },
    include: { pools: true },
  });
  const pool = match?.pools[0];
  if (!pool) throw new SandboxError("Create the dummy pool first.");
  if (pool.status !== PoolStatus.OPEN) {
    throw new SandboxError(`Pool is ${pool.status}, not open for betting.`);
  }
  if (pool.closesAt.getTime() <= Date.now()) {
    throw new SandboxError("The betting window has closed.");
  }

  const amount = parseToken(input.amount, TOKEN_DECIMALS);
  if (amount === null || amount <= 0n) {
    throw new SandboxError("Enter a valid stake amount.");
  }

  try {
    const balance = await readOperatorTokenBalance();
    if (balance < amount) {
      throw new SandboxError(
        `Operator wallet holds ${formatToken(balance, TOKEN_DECIMALS)} ${TOKEN_SYMBOL} — ` +
          `not enough for a ${input.amount} stake.`,
      );
    }
  } catch (err) {
    if (err instanceof SandboxError) throw err;
    // Balance read failed; let the transaction surface the real error.
  }

  const selection = input.selection;
  let receipt: Awaited<ReturnType<typeof operatorBet>>;
  try {
    receipt = await operatorBet(
      pool.onchainPoolId as `0x${string}`,
      selectionToCode(selection),
      amount,
    );
  } catch (err) {
    throw new SandboxError(
      `bet() failed: ${err instanceof Error ? err.message : "unknown error"}`,
    );
  }

  const operatorAddress = getOperatorAccount().address.toLowerCase();
  const user = await prisma.user.upsert({
    where: { address: operatorAddress },
    update: {},
    create: { address: operatorAddress },
    select: { id: true },
  });

  const existing = await prisma.bet.findUnique({
    where: { poolId_address: { poolId: pool.id, address: operatorAddress } },
    select: { id: true, status: true },
  });

  if (existing) {
    const restart = existing.status === BetStatus.WITHDRAWN;
    await prisma.bet.update({
      where: { id: existing.id },
      data: {
        amount: restart ? amount : { increment: amount },
        selection,
        status: BetStatus.PENDING,
        payout: 0n,
        claimed: false,
        txHash: receipt.hash,
        logIndex: receipt.logIndex,
        blockNumber: receipt.blockNumber,
      },
    });
  } else {
    await prisma.bet.create({
      data: {
        poolId: pool.id,
        userId: user.id,
        address: operatorAddress,
        selection,
        amount,
        status: BetStatus.PENDING,
        txHash: receipt.hash,
        logIndex: receipt.logIndex,
        blockNumber: receipt.blockNumber,
      },
    });
  }

  const stakeField =
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

  return `Staked ${formatToken(amount, TOKEN_DECIMALS)} ${TOKEN_SYMBOL} on ${selection}.`;
}

// ── Step 4: simulate resolving the dummy pool ───────────────────────────────

export async function resolveDummyPool(input: {
  outcome: OnchainOutcome;
}): Promise<string> {
  const match = await prisma.match.findUnique({
    where: { externalId: SANDBOX_MATCH_EXTERNAL_ID },
    include: { pools: true },
  });
  const pool = match?.pools[0];
  if (!pool) throw new SandboxError("Create the dummy pool first.");
  if (pool.status === PoolStatus.RESOLVED || pool.status === PoolStatus.VOID) {
    throw new SandboxError("Pool is already resolved.");
  }
  if (pool.closesAt.getTime() > Date.now()) {
    throw new SandboxError(
      "Pool has not expired yet — resolve after the betting window closes.",
    );
  }

  const code = outcomeToCode(input.outcome);
  let txHash: string;
  try {
    txHash = await resolvePool(pool.onchainPoolId as `0x${string}`, code);
  } catch (err) {
    throw new SandboxError(
      `resolve() failed: ${err instanceof Error ? err.message : "unknown error"}`,
    );
  }

  const selection = codeToSelection(code);
  const winningStake =
    selection === Selection.HOME
      ? pool.stakeHome
      : selection === Selection.DRAW
        ? pool.stakeDraw
        : selection === Selection.AWAY
          ? pool.stakeAway
          : 0n;
  const refundMode = selection === null || winningStake === 0n;
  const status =
    selection === null ? PoolStatus.VOID : PoolStatus.RESOLVED;

  await prisma.pool.update({
    where: { id: pool.id },
    data: {
      status,
      winningSelection: selection ?? undefined,
      resolvedTxHash: txHash,
      settledAt: new Date(),
    },
  });

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

  return refundMode
    ? "Pool resolved as VOID — all stakes refundable."
    : `Pool resolved as ${input.outcome}.`;
}

// ── Step 5: simulate claiming the dummy pool ────────────────────────────────

export async function claimDummyPool(): Promise<string> {
  const match = await prisma.match.findUnique({
    where: { externalId: SANDBOX_MATCH_EXTERNAL_ID },
    include: { pools: true },
  });
  const pool = match?.pools[0];
  if (!pool) throw new SandboxError("Create the dummy pool first.");
  if (pool.status !== PoolStatus.RESOLVED && pool.status !== PoolStatus.VOID) {
    throw new SandboxError("Pool is not resolved yet.");
  }

  const operatorAddress = getOperatorAccount().address.toLowerCase();
  const claimable = await prisma.bet.findUnique({
    where: { poolId_address: { poolId: pool.id, address: operatorAddress } },
    select: { id: true, status: true },
  });
  if (
    !claimable ||
    (claimable.status !== BetStatus.WON &&
      claimable.status !== BetStatus.VOID)
  ) {
    throw new SandboxError("No claimable bet for the operator wallet.");
  }

  let receipt: Awaited<ReturnType<typeof operatorClaim>>;
  try {
    receipt = await operatorClaim(pool.onchainPoolId as `0x${string}`);
  } catch (err) {
    throw new SandboxError(
      `claim() failed: ${err instanceof Error ? err.message : "unknown error"}`,
    );
  }

  await prisma.bet.update({
    where: { id: claimable.id },
    data: {
      claimed: true,
      status: BetStatus.CLAIMED,
      claimTxHash: receipt.hash,
    },
  });

  return `Claimed ${formatToken(receipt.amount, TOKEN_DECIMALS)} ${TOKEN_SYMBOL}.`;
}

// ── Step 6: delete the dummy fixture from the DB ────────────────────────────

export async function deleteDummyFixture(): Promise<string> {
  const match = await prisma.match.findUnique({
    where: { externalId: SANDBOX_MATCH_EXTERNAL_ID },
    include: { pools: { select: { onchainPoolId: true } } },
  });
  if (!match) return "No dummy fixture to delete.";

  const onchainPoolIds = match.pools.map((p) => p.onchainPoolId);

  // Cascades to the pool and its bets.
  await prisma.match.delete({ where: { id: match.id } });

  if (onchainPoolIds.length > 0) {
    await prisma.chainEvent.deleteMany({
      where: { poolId: { in: onchainPoolIds } },
    });
  }

  return "Dummy fixture, pool, and bets removed from the database.";
}
