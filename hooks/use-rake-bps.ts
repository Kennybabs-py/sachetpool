"use client";

import { useReadContract } from "wagmi";
import { MARKET_ADDRESS } from "@/config/chains";
import { sachetMarketAbi } from "@/lib/contracts/sachet-market";

/**
 * The protocol rake, read live from the on-chain market.
 *
 * The rake is a global value on `SachetMarket` (basis points, 1–10), not a
 * per-pool constant, so it must never be hardcoded in copy. This is the single
 * client-side source of truth for the rate; surfaces that mention the rake
 * render it through `RakeBps` (or this hook) instead of quoting a number.
 */

/** Basis points → percent string, e.g. `5` → `"0.05%"`, `10` → `"0.1%"`. */
export function formatRakeBps(bps: number | bigint): string {
  const value = typeof bps === "bigint" ? Number(bps) : bps;
  if (!Number.isFinite(value) || value < 0) return "—";
  const percent = value / 100;
  return `${percent.toFixed(2).replace(/\.?0+$/, "")}%`;
}

export function useRakeBps() {
  const configured = Boolean(MARKET_ADDRESS);

  const { data, isLoading, isError, refetch } = useReadContract({
    address: MARKET_ADDRESS,
    abi: sachetMarketAbi,
    functionName: "rakeBps",
    query: { enabled: configured },
  });

  return {
    /** Raw basis points, or `undefined` until the first read resolves. */
    bps: data,
    /** Display form, e.g. `0.05%`; `undefined` until loaded. */
    formatted: data !== undefined ? formatRakeBps(data) : undefined,
    configured,
    isLoading,
    isError,
    refetch,
  };
}
