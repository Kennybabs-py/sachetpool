"use server";

import { revalidatePath } from "next/cache";
import { prisma } from "@/lib/prisma";
import { requireUser } from "@/lib/session";
import { publicClient } from "@/lib/chain/server-client";
import { sachetMarketAbi } from "@/lib/contracts/sachet-market";
import { MARKET_ADDRESS } from "@/config/chains";
import { BetStatus } from "@/generated/prisma/client";

/**
 * Mark a bet claimed in the mirror right after the on-chain `claim` confirms.
 *
 * Without this the claim button lingers until the indexer mirrors the `Claimed`
 * event. We verify against the contract's `bets(poolId, address)` getter rather
 * than trusting the client, so the mirror only flips once the chain agrees.
 * Idempotent with `lib/indexer.ts::handleClaimed`.
 */

export type ClaimResult = { ok: true } | { ok: false; error: string };

export async function confirmClaimAction(input: {
  onchainPoolId: string;
  txHash?: string;
}): Promise<ClaimResult> {
  let address: string;
  try {
    address = (await requireUser()).address;
  } catch {
    return { ok: false, error: "Not signed in." };
  }

  if (!MARKET_ADDRESS) {
    return { ok: false, error: "Market is not configured." };
  }

  try {
    const [, , claimed] = await publicClient.readContract({
      address: MARKET_ADDRESS,
      abi: sachetMarketAbi,
      functionName: "bets",
      args: [
        input.onchainPoolId as `0x${string}`,
        address as `0x${string}`,
      ],
    });
    if (!claimed) return { ok: false, error: "Not claimed on-chain yet." };
  } catch {
    return { ok: false, error: "Could not verify the claim on-chain." };
  }

  const pool = await prisma.pool.findUnique({
    where: { onchainPoolId: input.onchainPoolId },
    select: { id: true },
  });
  if (!pool) return { ok: false, error: "Pool not found." };

  const bet = await prisma.bet.findUnique({
    where: { poolId_address: { poolId: pool.id, address } },
    select: { id: true, status: true },
  });
  if (!bet) return { ok: false, error: "Bet not found." };

  await prisma.bet.update({
    where: { id: bet.id },
    data: {
      claimed: true,
      ...(input.txHash ? { claimTxHash: input.txHash } : {}),
      // The contract marks losers claimed too; keep their LOST status.
      status:
        bet.status === BetStatus.LOST ? BetStatus.LOST : BetStatus.CLAIMED,
    },
  });

  revalidatePath("/my-bets");
  return { ok: true };
}
