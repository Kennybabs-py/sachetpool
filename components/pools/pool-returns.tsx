"use client";

import { useState } from "react";
import type { Selection } from "@/generated/prisma/client";
import type { PoolView } from "@/lib/pools";
import { projectPayout } from "@/lib/odds";
import { formatToken, formatTokenInput, parseToken } from "@/lib/format";
import { TOKEN_DECIMALS, TOKEN_SYMBOL } from "@/config/chains";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";

const OUTCOMES: { key: Selection; label: string }[] = [
  { key: "HOME", label: "Home" },
  { key: "DRAW", label: "Draw" },
  { key: "AWAY", label: "Away" },
];

const QUICK_STAKES = ["100", "500", "10000", "25000"];

/**
 * On-page returns projection for the pool detail page.
 *
 * The bet sheet shows potential win / projected profit only after a selection
 * is made; this surfaces both for *every* outcome against a stake the viewer
 * types, using the same integer math as the contract (`projectPayout`).
 */
export function PoolReturns({
  pool,
  defaultStake,
}: {
  pool: PoolView;
  /** The viewer's live stake in this pool, in base units, when they have one. */
  defaultStake?: string | null;
}) {
  const [stakeStr, setStakeStr] = useState(() =>
    defaultStake ? formatTokenInput(defaultStake, TOKEN_DECIMALS) : "1",
  );

  const parsed = parseToken(stakeStr, TOKEN_DECIMALS);
  const amount = parsed ?? 0n;
  const valid = parsed !== null && amount > 0n;
  const totalStake = BigInt(pool.totalStake);

  return (
    <section className="rounded-2xl border border-border bg-card p-4 text-card-foreground">
      <div className="flex flex-wrap items-baseline justify-between gap-x-2 gap-y-1">
        <h2 className="text-sm font-semibold">Potential returns</h2>
        <span className="text-xs text-muted-foreground tabular-nums">
          {valid
            ? `If you stake ${formatToken(amount, TOKEN_DECIMALS)} ${TOKEN_SYMBOL} now`
            : `Stake in ${TOKEN_SYMBOL}`}
        </span>
      </div>

      <div className="mt-3">
        <label
          htmlFor="returns-stake"
          className="mb-1 block text-xs font-medium text-muted-foreground"
        >
          Stake ({TOKEN_SYMBOL})
        </label>
        <input
          id="returns-stake"
          inputMode="decimal"
          placeholder="0"
          value={stakeStr}
          onChange={(e) => setStakeStr(e.target.value.replace(/[^0-9.]/g, ""))}
          className={cn(
            "w-full rounded-2xl border border-border bg-background px-4 py-3 text-lg font-semibold",
            "tabular-nums outline-none focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/30",
          )}
        />
        <div className="mt-2 flex flex-wrap items-center gap-2">
          {QUICK_STAKES.map((quick) => (
            <Button
              key={quick}
              type="button"
              variant="secondary"
              size="sm"
              onClick={() => setStakeStr(quick)}
            >
              {quick}
            </Button>
          ))}
        </div>
      </div>

      <div className="mt-4 grid grid-cols-3 gap-2">
        {OUTCOMES.map(({ key, label }) => {
          const selectionStake = BigInt(pool.stakeBySelection[key]);
          const payout = valid
            ? projectPayout(totalStake, selectionStake, amount, pool.rakeBps)
            : 0n;
          const profit = payout > amount ? payout - amount : 0n;
          const team =
            key === "HOME"
              ? pool.homeTeam
              : key === "AWAY"
                ? pool.awayTeam
                : "Draw";

          return (
            <div
              key={key}
              className="flex flex-col gap-2 rounded-2xl border border-border bg-background p-3"
            >
              <div className="min-w-0">
                <p className="text-xs text-muted-foreground">{label}</p>
                <p className="truncate text-xs font-medium" title={team}>
                  {team}
                </p>
              </div>

              <div>
                <p className="text-[11px] tracking-wide text-muted-foreground uppercase">
                  Potential win
                </p>
                <p className="text-sm font-semibold tabular-nums">
                  {valid
                    ? `${formatToken(payout, TOKEN_DECIMALS)} ${TOKEN_SYMBOL}`
                    : "—"}
                </p>
              </div>

              <div>
                <p className="text-[11px] tracking-wide text-muted-foreground uppercase">
                  Projected profit
                </p>
                <p className="text-sm font-semibold tabular-nums">
                  {valid && profit > 0n
                    ? `+${formatToken(profit, TOKEN_DECIMALS)}`
                    : "—"}
                </p>
              </div>
            </div>
          );
        })}
      </div>

      <p className="mt-3 text-xs text-muted-foreground">
        Pari-mutuel — the final payout depends on the whole pool at kickoff.
      </p>
    </section>
  );
}
