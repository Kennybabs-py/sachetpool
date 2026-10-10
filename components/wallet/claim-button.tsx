"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import posthog from "posthog-js";
import { useAccount, usePublicClient, useWriteContract } from "wagmi";
import { useConnectModal } from "@rainbow-me/rainbowkit";
import { MARKET_ADDRESS } from "@/config/chains";
import { sachetMarketAbi } from "@/lib/contracts/sachet-market";
import { confirmClaimAction } from "@/app/(app)/my-bets/actions";
import { PrimaryButton } from "@/components/common/primary-button";
import { toast } from "sonner";

const isPostHogConfigured = Boolean(
  process.env.NEXT_PUBLIC_POSTHOG_PROJECT_TOKEN &&
  process.env.NEXT_PUBLIC_POSTHOG_HOST,
);

/**
 * Pull-payment trigger for a resolved bet. Winners (and void refundees) call
 * `claim(poolId)`; the contract is the only source of payout truth.
 */
export function ClaimButton({ onchainPoolId }: { onchainPoolId: string }) {
  const router = useRouter();
  const { isConnected } = useAccount();
  const { openConnectModal } = useConnectModal();
  const publicClient = usePublicClient();
  const { writeContractAsync } = useWriteContract();
  const [pending, setPending] = useState(false);
  const [done, setDone] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function claim() {
    if (!isConnected) {
      openConnectModal?.();
      return;
    }
    if (!MARKET_ADDRESS || !publicClient || pending) return;
    setPending(true);
    setError(null);
    try {
      const hash = await writeContractAsync({
        address: MARKET_ADDRESS,
        abi: sachetMarketAbi,
        functionName: "claim",
        args: [onchainPoolId as `0x${string}`],
      });
      await publicClient.waitForTransactionReceipt({ hash });
      // Flip the mirror now instead of waiting for the indexer, so the button
      // doesn't linger. The chain was already verified here via the receipt.
      await confirmClaimAction({ onchainPoolId, txHash: hash });
      if (isPostHogConfigured) {
        posthog.capture("payout_claimed");
      }
      setDone(true);
      toast.success("Success");
      router.refresh();
    } catch (err) {
      setError(
        (err instanceof Error ? err.message : String(err))
          .split("\n")[0]
          .slice(0, 140),
      );
      toast.error(err instanceof Error ? err.message : String(err));
    } finally {
      setPending(false);
    }
  }

  if (done) return null;

  return (
    <div className="flex flex-col items-end gap-1">
      <PrimaryButton type="button" size="sm" onClick={claim} disabled={pending}>
        {pending ? "Claiming…" : "Claim"}
      </PrimaryButton>
      {error && (
        <span className="text-xs text-destructive" role="alert">
          {error}
        </span>
      )}
    </div>
  );
}
