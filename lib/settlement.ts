import "server-only";
import { prisma } from "./prisma";
import { toAmountString, toBigInt } from "./amounts";
import { winnerPayout } from "./odds";
import { OUTCOME_CODE, codeToSelection, selectionToCode } from "./onchain";
import { BetStatus, PoolStatus, Selection } from "@/generated/prisma/client";

/**
 * Apply a resolved pool outcome to the mirror.
 *
 * Flips the pool to `RESOLVED`/`VOID` and settles its still-`PENDING` bets
 * (`WON`/`LOST`/`VOID` with the computed payout). This is the single source of
 * truth for settlement mirroring, shared by:
 *
 *  - `confirmResolveAction` (admin `/admin` resolve, applies immediately), and
 *  - `lib/indexer.ts` (mirrors the on-chain `PoolResolved` event).
 *
 * Idempotent: only `PENDING` bets are touched and the pool update is a plain
 * set, so calling it twice (admin then indexer, or vice versa) is a no-op the
 * second time. Crucially it must NOT rely on the pool still being `OPEN` — the
 * admin path marks the pool resolved first, so the indexer still has to settle
 * the bets when it replays the event.
 *
 * `outcome` is the on-chain code: `HOME=1`, `DRAW=2`, `AWAY=3`, `VOID=4`.
 */
export async function applyPoolResolution(
  poolId: string,
  outcome: number,
  txHash: string | null = null,
  now: Date = new Date(),
): Promise<void> {
  const pool = await prisma.pool.findUnique({ where: { id: poolId } });
  if (!pool) return;

  const selection = codeToSelection(outcome);
  const refundMode = outcome === 4 || !selection;
  const status = refundMode ? PoolStatus.VOID : PoolStatus.RESOLVED;

  await prisma.pool.update({
    where: { id: pool.id },
    data: {
      status,
      winningSelection: selection ?? null,
      ...(txHash ? { resolvedTxHash: txHash } : {}),
      // Preserve the first settle time when the other path already set it.
      settledAt: pool.settledAt ?? now,
    },
  });

  const winningStake =
    selection === Selection.HOME
      ? toBigInt(pool.stakeHome)
      : selection === Selection.DRAW
        ? toBigInt(pool.stakeDraw)
        : toBigInt(pool.stakeAway);

  const pending = await prisma.bet.findMany({
    where: { poolId: pool.id, status: BetStatus.PENDING },
    select: { id: true, amount: true, selection: true },
  });

  for (const bet of pending) {
    if (refundMode) {
      await prisma.bet.update({
        where: { id: bet.id },
        data: { status: BetStatus.VOID, payout: toAmountString(bet.amount) },
      });
      continue;
    }
    if (bet.selection === selection) {
      const payout = winnerPayout(
        toBigInt(pool.totalStake),
        toBigInt(bet.amount),
        winningStake,
        pool.rakeBps,
      );
      await prisma.bet.update({
        where: { id: bet.id },
        data: { status: BetStatus.WON, payout: payout.toString() },
      });
    } else {
      await prisma.bet.update({
        where: { id: bet.id },
        data: { status: BetStatus.LOST, payout: "0" },
      });
    }
  }
}

/**
 * Repair pools that are already `RESOLVED`/`VOID` but still have `PENDING` bets.
 *
 * These are pools resolved through the admin path before it settled bets (or any
 * other partial write). The indexer cannot fix them by replaying the
 * `PoolResolved` event, because that log was already consumed and recorded in
 * `ChainEvent`. This walks the affected pools and re-applies the resolution.
 *
 * Safe to run often: it only touches pools that still have pending bets, and
 * `applyPoolResolution` is idempotent. Returns the number of pools reconciled.
 */
export async function reconcileSettledPools(limit = 50): Promise<number> {
  const pools = await prisma.pool.findMany({
    where: {
      status: { in: [PoolStatus.RESOLVED, PoolStatus.VOID] },
      bets: { some: { status: BetStatus.PENDING } },
    },
    orderBy: { settledAt: "asc" },
    take: limit,
    select: { id: true, status: true, winningSelection: true, settledAt: true },
  });

  let reconciled = 0;
  for (const pool of pools) {
    const outcome =
      pool.status === PoolStatus.VOID
        ? OUTCOME_CODE.VOID
        : pool.winningSelection
          ? selectionToCode(pool.winningSelection)
          : null;
    // A RESOLVED pool with no winning selection is a data anomaly — leave it
    // for a human rather than guessing an outcome (and mis-refunding).
    if (outcome === null) continue;

    await applyPoolResolution(
      pool.id,
      outcome,
      null,
      pool.settledAt ?? new Date(),
    );
    reconciled++;
  }
  return reconciled;
}
