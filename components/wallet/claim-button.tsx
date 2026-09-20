"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { useAccount, usePublicClient, useWriteContract } from "wagmi";
import { useConnectModal } from "@rainbow-me/rainbowkit";
import { MARKET_ADDRESS } from "@/config/chains";
import { sachetMarketAbi } from "@/lib/contracts/sachet-market";
import { Button } from "@/components/ui/button";

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
      router.refresh();
    } catch (err) {
      setError(
        (err instanceof Error ? err.message : String(err))
          .split("\n")[0]
          .slice(0, 140),
      );
    } finally {
      setPending(false);
    }
  }

  return (
    <div className="flex flex-col items-end gap-1">
      <Button type="button" size="sm" onClick={claim} disabled={pending}>
        {pending ? "Claiming…" : "Claim"}
      </Button>
      {error && (
        <span className="text-xs text-destructive" role="alert">
          {error}
        </span>
      )}
    </div>
  );
}
