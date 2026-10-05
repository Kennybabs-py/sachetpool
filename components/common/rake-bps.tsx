"use client";

import { cn } from "@/lib/utils";
import { useRakeBps } from "@/hooks/use-rake-bps";

/**
 * The live protocol rake, sourced from the contract.
 *
 * Use wherever copy would otherwise quote a fixed rake. Renders an em dash
 * until the on-chain read resolves, and "unavailable" if the read fails, so the
 * UI never shows a stale or invented number.
 */
export function RakeBps({
  className,
  label = "Current rake",
}: {
  className?: string;
  label?: string;
}) {
  const { formatted, configured, isError } = useRakeBps();

  const value = !configured
    ? "—"
    : (formatted ?? (isError ? "unavailable" : "…"));

  return (
    <span
      className={cn(
        "inline-flex items-center gap-2 rounded-full border border-border px-3 py-1 text-xs",
        className,
      )}
    >
      <span className="text-muted-foreground">{label}</span>
      <span className="font-medium text-foreground tabular-nums">{value}</span>
    </span>
  );
}
