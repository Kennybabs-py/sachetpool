"use client";

import { useState } from "react";
import Link from "next/link";
import type { Selection } from "@/generated/prisma/client";
import type { PoolView } from "@/lib/pools";
import { TOKEN_DECIMALS, TOKEN_SYMBOL } from "@/config/chains";
import { formatToken } from "@/lib/format";
import { TeamLogo } from "./team-logo";
import { KickoffTime } from "./kickoff-time";
import { BetSheet } from "./bet-sheet";
import { formatMultiple } from "./format";
import { ArrowRight } from "lucide-react";

const OUTCOMES: { key: Selection; label: string }[] = [
  { key: "HOME", label: "Home" },
  { key: "DRAW", label: "Draw" },
  { key: "AWAY", label: "Away" },
];

/**
 * One pool: fixture, live kickoff countdown, pot, and three outcome buttons
 * showing current pari-mutuel odds. Tapping an outcome opens the bet sheet.
 */
export function PoolCard({
  pool,
  serverNowMs,
  showDetailLink = true,
}: {
  pool: PoolView;
  serverNowMs: number;
  showDetailLink?: boolean;
}) {
  const [selection, setSelection] = useState<Selection | null>(null);
  const locked = pool.status !== "OPEN";
  const lockedLabel =
    pool.status === "LOCKED"
      ? "Betting closed"
      : pool.status === "VOID"
        ? "Void"
        : pool.status === "RESOLVED"
          ? "Resolved"
          : pool.status === "PENDING_ONCHAIN"
            ? "Opening…"
            : "Betting closed";

  return (
    <div className="rounded-2xl border border-border bg-card p-4 text-card-foreground">
      <div className="mb-3 flex items-center justify-between gap-2">
        <span className="truncate text-xs font-medium text-muted-foreground">
          {pool.league}
        </span>
        {locked ? (
          <span className="shrink-0 rounded-full bg-muted px-2 py-0.5 text-xs font-medium text-muted-foreground">
            {lockedLabel}
          </span>
        ) : (
          <KickoffTime
            kickoffMs={pool.kickoffAt.getTime()}
            serverNowMs={serverNowMs}
            className="shrink-0"
          />
        )}
      </div>

      <div className="mb-4 grid grid-cols-[1fr_auto_1fr] items-center gap-2">
        <div className="flex min-w-0 items-center gap-2">
          <TeamLogo name={pool.homeTeam} src={pool.homeTeamLogo} />
          <span className="truncate text-sm font-medium">{pool.homeTeam}</span>
        </div>
        <span className="text-xs font-medium text-muted-foreground">vs</span>
        <div className="flex min-w-0 items-center justify-end gap-2">
          <span className="truncate text-right text-sm font-medium">
            {pool.awayTeam}
          </span>
          <TeamLogo name={pool.awayTeam} src={pool.awayTeamLogo} />
        </div>
      </div>

      <div className="grid grid-cols-3 gap-2">
        {OUTCOMES.map(({ key, label }) => (
          <button
            key={key}
            type="button"
            disabled={locked}
            onClick={() => setSelection(key)}
            className="flex flex-col items-center gap-0.5 rounded-2xl border border-border bg-background p-2.5 transition-colors hover:bg-muted active:translate-y-px disabled:cursor-not-allowed disabled:opacity-60"
          >
            <span className="text-xs text-muted-foreground">{label}</span>
            <span className="text-sm font-semibold tabular-nums">
              {formatMultiple(pool.oddsBySelection[key])}
            </span>
          </button>
        ))}
      </div>

      <div className="mt-3 flex items-center justify-between gap-2">
        <p className="text-xs text-primary  tabular-nums">
          Pot: {formatToken(pool.totalStake, TOKEN_DECIMALS)} {TOKEN_SYMBOL}
        </p>
        {showDetailLink && (
          <Link
            href={`/pools/${pool.poolId}`}
            className="flex items-center justify-start gap-1 shrink-0 text-xs font-medium text-primary transition-colors hover:text-primary"
          >
            Pool details <ArrowRight size={13} />
          </Link>
        )}
      </div>

      <BetSheet
        pool={pool}
        selection={selection}
        onSelectionChange={setSelection}
      />
    </div>
  );
}
