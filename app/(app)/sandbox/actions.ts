"use server";

import { revalidatePath } from "next/cache";
import { requireUser } from "@/lib/session";
import { isAdmin } from "@/lib/admin";
import type { OnchainOutcome, OnchainSelection } from "@/lib/onchain";
import {
  claimDummyPool,
  createDummyPool,
  deleteDummyFixture,
  placeDummyBet,
  resolveDummyPool,
  syncDummyFixture,
} from "@/lib/sandbox";

/**
 * Sandbox server actions.
 *
 * Each action re-checks the admin allowlist (never trust the page gate) and
 * runs one lifecycle step through the server operator key. Expected failures
 * come back as `{ ok: false, error }` so the panel can show them inline.
 */

export type SandboxActionResult =
  | { ok: true; message: string }
  | { ok: false; error: string };

const SELECTIONS: OnchainSelection[] = ["HOME", "DRAW", "AWAY"];
const OUTCOMES: OnchainOutcome[] = ["HOME", "DRAW", "AWAY", "VOID"];

async function assertAdmin() {
  const user = await requireUser();
  if (!isAdmin(user.address)) throw new Error("FORBIDDEN");
}

function fail(err: unknown): SandboxActionResult {
  return {
    ok: false,
    error: err instanceof Error ? err.message : "Something went wrong.",
  };
}

function revalidate() {
  revalidatePath("/sandbox");
  revalidatePath("/board");
  revalidatePath("/admin");
  revalidatePath("/");
}

export async function syncFixtureAction(): Promise<SandboxActionResult> {
  try {
    await assertAdmin();
    const message = await syncDummyFixture();
    revalidate();
    return { ok: true, message };
  } catch (err) {
    return fail(err);
  }
}

export async function createPoolAction(input: {
  closesInSec: number;
  rakeBps: number;
}): Promise<SandboxActionResult> {
  try {
    await assertAdmin();
    const message = await createDummyPool({
      closesInSec: Number(input.closesInSec),
      rakeBps: Number(input.rakeBps),
    });
    revalidate();
    return { ok: true, message };
  } catch (err) {
    return fail(err);
  }
}

export async function placeBetAction(input: {
  selection: OnchainSelection;
  amount: string;
}): Promise<SandboxActionResult> {
  try {
    await assertAdmin();
    if (!SELECTIONS.includes(input.selection)) {
      return { ok: false, error: "Invalid selection." };
    }
    const message = await placeDummyBet({
      selection: input.selection,
      amount: input.amount,
    });
    revalidate();
    return { ok: true, message };
  } catch (err) {
    return fail(err);
  }
}

export async function resolvePoolAction(input: {
  outcome: OnchainOutcome;
}): Promise<SandboxActionResult> {
  try {
    await assertAdmin();
    if (!OUTCOMES.includes(input.outcome)) {
      return { ok: false, error: "Invalid outcome." };
    }
    const message = await resolveDummyPool({ outcome: input.outcome });
    revalidate();
    return { ok: true, message };
  } catch (err) {
    return fail(err);
  }
}

export async function claimPoolAction(): Promise<SandboxActionResult> {
  try {
    await assertAdmin();
    const message = await claimDummyPool();
    revalidate();
    return { ok: true, message };
  } catch (err) {
    return fail(err);
  }
}

export async function deleteFixtureAction(): Promise<SandboxActionResult> {
  try {
    await assertAdmin();
    const message = await deleteDummyFixture();
    revalidate();
    return { ok: true, message };
  } catch (err) {
    return fail(err);
  }
}
