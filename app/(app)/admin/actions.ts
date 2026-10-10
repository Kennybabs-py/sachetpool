"use server";

import { revalidatePath } from "next/cache";
import { prisma } from "@/lib/prisma";
import { requireUser } from "@/lib/session";
import { isAdmin } from "@/lib/admin";
import { PoolStatus, PoolType } from "@/generated/prisma/client";
import {
  computeOnchainPoolId,
  outcomeToCode,
  type OnchainOutcome,
} from "@/lib/onchain";
import { getGlobalRakeBps } from "@/lib/pools";
import { applyPoolResolution } from "@/lib/settlement";

/**
 * Admin dashboard server actions.
 *
 * On-chain writes are signed by the admin's own connected wallet (see
 * `components/admin/admin-panel.tsx`), so these actions only touch Postgres and
 * re-check the allowlist. The flow per pool is:
 *
 *   prepare*  → validate + persist the row (PENDING_ONCHAIN)
 *   <wallet>  → the admin signs launchPool / resolvePool client-side
 *   confirm*  → mark the row OPEN / RESOLVED with the confirmed tx hash
 *
 * A failed wallet signature leaves the row PENDING_ONCHAIN, and `prepare*`
 * reuses that row, so the attempt can simply be retried.
 */

export type ActionResult =
  | { ok: true; message: string }
  | { ok: false; error: string };

export type PreparePoolResult =
  | { ok: true; poolId: string; onchainPoolId: string }
  | { ok: false; error: string };

async function assertAdmin() {
  const user = await requireUser();
  if (!isAdmin(user.address)) throw new Error("FORBIDDEN");
  return user;
}

/** Persist (or re-use) a PENDING_ONCHAIN row and hand back the ids to launch. */
export async function preparePoolAction(input: {
  matchId: string;
  /** Unix seconds; the expiry the admin will sign on-chain. */
  closesAt: number;
}): Promise<PreparePoolResult> {
  let address: string;
  try {
    address = (await assertAdmin()).address;
  } catch {
    return { ok: false, error: "Not authorized." };
  }

  const match = await prisma.match.findUnique({
    where: { id: input.matchId },
    include: { pools: true },
  });
  if (!match) return { ok: false, error: "Match not found." };

  // Only a not-yet-launched pool is replaceable; anything else is final.
  const launched = match.pools.find(
    (p) => p.status !== PoolStatus.PENDING_ONCHAIN,
  );
  if (launched) return { ok: false, error: "This match already has a pool." };

  const nowSec = Math.floor(Date.now() / 1000);
  const closesAt = Math.trunc(input.closesAt);
  if (!Number.isFinite(closesAt) || closesAt <= nowSec) {
    return { ok: false, error: "Expiry must be in the future." };
  }

  const onchainPoolId = computeOnchainPoolId(match.externalId);
  const rakeBps = await getGlobalRakeBps();
  const pending = match.pools.find(
    (p) => p.status === PoolStatus.PENDING_ONCHAIN,
  );

  const pool = pending
    ? await prisma.pool.update({
        where: { id: pending.id },
        data: {
          closesAt: new Date(closesAt * 1000),
          rakeBps,
          createdBy: address,
        },
        select: { id: true },
      })
    : await prisma.pool.create({
        data: {
          matchId: match.id,
          onchainPoolId,
          type: PoolType.RESULT_1X2,
          status: PoolStatus.PENDING_ONCHAIN,
          closesAt: new Date(closesAt * 1000),
          rakeBps,
          createdBy: address,
        },
        select: { id: true },
      });

  return { ok: true, poolId: pool.id, onchainPoolId };
}

/** Mark a pool OPEN once the admin's `launchPool` tx has confirmed. */
export async function confirmPoolAction(input: {
  poolId: string;
  txHash: string;
}): Promise<ActionResult> {
  try {
    await assertAdmin();
  } catch {
    return { ok: false, error: "Not authorized." };
  }

  const pool = await prisma.pool.findUnique({
    where: { id: input.poolId },
    select: { id: true },
  });
  if (!pool) return { ok: false, error: "Pool not found." };

  await prisma.pool.update({
    where: { id: pool.id },
    data: { status: PoolStatus.OPEN, createTxHash: input.txHash },
  });

  revalidatePath("/admin");
  revalidatePath("/");
  return { ok: true, message: "Pool opened on-chain." };
}

/** Mark a pool settled once the admin's `resolvePool` tx has confirmed. */
export async function confirmResolveAction(input: {
  poolId: string;
  outcome: OnchainOutcome;
  txHash: string;
}): Promise<ActionResult> {
  try {
    await assertAdmin();
  } catch {
    return { ok: false, error: "Not authorized." };
  }

  if (!["HOME", "DRAW", "AWAY", "VOID"].includes(input.outcome)) {
    return { ok: false, error: "Invalid outcome." };
  }

  const pool = await prisma.pool.findUnique({
    where: { id: input.poolId },
    select: { id: true, status: true },
  });
  if (!pool) return { ok: false, error: "Pool not found." };
  if (pool.status === PoolStatus.RESOLVED || pool.status === PoolStatus.VOID) {
    return { ok: false, error: "Pool is already resolved." };
  }

  // Flip the pool *and* settle its bets (WON/LOST/VOID + payout) so `claimable`
  // turns true immediately — matching what the indexer does when it mirrors the
  // on-chain `PoolResolved` event. Without this the pool reads resolved while
  // every bet stays PENDING and winners can never claim.
  await applyPoolResolution(
    pool.id,
    outcomeToCode(input.outcome),
    input.txHash,
  );

  revalidatePath("/admin");
  revalidatePath("/");
  revalidatePath("/my-bets");
  revalidatePath("/board");
  return { ok: true, message: `Pool resolved as ${input.outcome}.` };
}
