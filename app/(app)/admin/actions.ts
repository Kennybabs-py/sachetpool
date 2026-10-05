"use server";

import { revalidatePath } from "next/cache";
import { prisma } from "@/lib/prisma";
import { requireUser } from "@/lib/session";
import { isAdmin } from "@/lib/admin";
import { PoolStatus, PoolType, Selection } from "@/generated/prisma/client";
import {
  computeOnchainPoolId,
  outcomeToCode,
  type OnchainOutcome,
} from "@/lib/onchain";
import { launchPool, resolvePool } from "@/lib/market";

/**
 * Admin dashboard server actions.
 *
 * Both actions re-check the allowlist (never trust the page gate) and execute
 * through the server operator key. A failed on-chain call leaves the DB row in
 * `PENDING_ONCHAIN` so it can be retried rather than silently lost.
 */

export type ActionResult =
  | { ok: true; message: string }
  | { ok: false; error: string };

async function assertAdmin() {
  const user = await requireUser();
  if (!isAdmin(user.address)) throw new Error("FORBIDDEN");
  return user;
}

export async function openPoolAction(input: {
  matchId: string;
  /** Unix seconds; selection expiry (defaults to kickoff in the UI). */
  closesAt: number;
}): Promise<ActionResult> {
  let address: string;
  try {
    address = (await assertAdmin()).address;
  } catch {
    return { ok: false, error: "Not authorized." };
  }

  const match = await prisma.match.findUnique({
    where: { id: input.matchId },
    include: { pools: { select: { id: true } } },
  });
  if (!match) return { ok: false, error: "Match not found." };
  if (match.pools.length > 0) {
    return { ok: false, error: "This match already has a pool." };
  }

  const nowSec = Math.floor(Date.now() / 1000);
  const closesAt = Math.trunc(input.closesAt);
  if (!Number.isFinite(closesAt) || closesAt <= nowSec) {
    return { ok: false, error: "Expiry must be in the future." };
  }

  const onchainPoolId = computeOnchainPoolId(match.externalId);

  const pool = await prisma.pool.create({
    data: {
      matchId: match.id,
      onchainPoolId,
      type: PoolType.RESULT_1X2,
      status: PoolStatus.PENDING_ONCHAIN,
      closesAt: new Date(closesAt * 1000),
      createdBy: address,
    },
    select: { id: true },
  });

  try {
    const txHash = await launchPool(onchainPoolId, closesAt);
    await prisma.pool.update({
      where: { id: pool.id },
      data: { status: PoolStatus.OPEN, createTxHash: txHash },
    });
  } catch (err) {
    return {
      ok: false,
      error: `Pool row saved as PENDING_ONCHAIN, but createPool failed: ${
        err instanceof Error ? err.message : "unknown error"
      }`,
    };
  }

  revalidatePath("/admin");
  revalidatePath("/");
  return { ok: true, message: "Pool opened on-chain." };
}

export async function resolvePoolAction(input: {
  poolId: string;
  outcome: OnchainOutcome;
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
    select: { id: true, onchainPoolId: true, status: true, closesAt: true },
  });
  if (!pool) return { ok: false, error: "Pool not found." };
  if (pool.status === PoolStatus.RESOLVED || pool.status === PoolStatus.VOID) {
    return { ok: false, error: "Pool is already resolved." };
  }

  const code = outcomeToCode(input.outcome);

  let txHash: string;
  try {
    txHash = await resolvePool(pool.onchainPoolId as `0x${string}`, code);
  } catch (err) {
    return {
      ok: false,
      error: `resolve() failed: ${
        err instanceof Error ? err.message : "unknown error"
      }`,
    };
  }

  const selection =
    input.outcome === "VOID" ? null : (input.outcome as Selection);

  await prisma.pool.update({
    where: { id: pool.id },
    data: {
      status: selection ? PoolStatus.RESOLVED : PoolStatus.VOID,
      winningSelection: selection ?? undefined,
      resolvedTxHash: txHash,
      settledAt: new Date(),
    },
  });

  revalidatePath("/admin");
  revalidatePath("/");
  return { ok: true, message: `Pool resolved as ${input.outcome}.` };
}
