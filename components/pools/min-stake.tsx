"use client";

import { useReadContract } from "wagmi";
import { MARKET_ADDRESS, TOKEN_DECIMALS, TOKEN_SYMBOL } from "@/config/chains";
import { sachetMarketAbi } from "@/lib/contracts/sachet-market";
import { formatToken } from "@/lib/format";
import { cn } from "@/lib/utils";

/**
 * The market's minimum stake, read live from the contract.
 *
 * Shown to end users wherever a stake can be entered, so the floor enforced by
 * `SachetMarket.bet` is visible before they try. Renders an em dash until the
 * read resolves (or when the market address is not configured).
 */
export function MinStake({ className }: { className?: string }) {
  const configured = Boolean(MARKET_ADDRESS);

  const { data, isError } = useReadContract({
    address: MARKET_ADDRESS,
    abi: sachetMarketAbi,
    functionName: "minStake",
    query: { enabled: configured },
  });

  const value =
    data !== undefined
      ? `${formatToken(data, TOKEN_DECIMALS)} ${TOKEN_SYMBOL}`
      : null;

  return (
    <div
      className={cn(
        "inline-flex items-center gap-3 rounded-2xl border border-border bg-card px-4 py-3",
        className,
      )}
    >
      <span className="text-xs font-medium tracking-wide text-muted-foreground uppercase">
        Minimum stake
      </span>
      <span className="text-xl leading-none font-semibold text-foreground tabular-nums">
        {!configured
          ? "—"
          : value
            ? `$SACH ${value}`
            : isError
              ? "unavailable"
              : "…"}
      </span>
      {configured && value && (
        <span className="text-xs text-muted-foreground">per bet</span>
      )}
    </div>
  );
}
