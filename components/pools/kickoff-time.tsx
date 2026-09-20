"use client";

import { useEffect, useState } from "react";
import { Clock } from "lucide-react";
import { cn } from "@/lib/utils";

/**
 * Live "kicks off in …" countdown. Seeded with the server's clock
 * (`serverNowMs`) so the first client render matches SSR exactly — avoiding a
 * hydration mismatch — then ticks on the client every 30s. At/after kickoff it
 * reads "kicking off".
 */
export function KickoffTime({
  kickoffMs,
  serverNowMs,
  className,
}: {
  kickoffMs: number;
  serverNowMs: number;
  className?: string;
}) {
  const [nowMs, setNowMs] = useState(serverNowMs);

  useEffect(() => {
    const tick = () => setNowMs(Date.now());
    // Defer the first client tick out of the effect body so hydration settles
    // before the clock advances past the server value.
    const timeout = setTimeout(tick, 0);
    const id = setInterval(tick, 30_000);
    return () => {
      clearTimeout(timeout);
      clearInterval(id);
    };
  }, []);

  return (
    <span
      className={cn(
        "inline-flex items-center gap-1 text-xs text-muted-foreground tabular-nums",
        className,
      )}
    >
      <Clock className="size-3.5" aria-hidden />
      {formatCountdown(kickoffMs - nowMs)}
    </span>
  );
}

function formatCountdown(ms: number): string {
  if (ms <= 0) return "kicking off";
  const totalMin = Math.floor(ms / 60_000);
  const days = Math.floor(totalMin / (60 * 24));
  const hours = Math.floor((totalMin % (60 * 24)) / 60);
  const mins = totalMin % 60;
  if (days > 0) return `in ${days}d ${hours}h`;
  if (hours > 0) return `in ${hours}h ${mins}m`;
  if (mins > 0) return `in ${mins}m`;
  return "in <1m";
}
