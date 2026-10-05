/**
 * Illustrative pool board for the hero.
 *
 * The numbers are a static example, so the whole figure is `aria-hidden` and a
 * screen-reader description is supplied instead — nobody should hear a fake
 * pot read aloud as if it were live data.
 */

const OUTCOMES = [
  { label: "Home", width: "61%", multiple: "2.14×" },
  { label: "Draw", width: "25%", multiple: "4.80×" },
  { label: "Away", width: "14%", multiple: "6.32×" },
] as const;

export function MarketBoard() {
  return (
    <figure className="relative">
      <p className="sr-only">
        Example pool: Arsenal versus Chelsea, with live odds of 2.14, 4.80 and
        6.32 for home, draw and away, and a pot of 12,480 SACH.
      </p>

      <div
        aria-hidden
        className="pointer-events-none absolute -inset-x-10 -top-10 bottom-0 bg-[radial-gradient(ellipse_at_top,var(--foreground),transparent_65%)] opacity-[0.07]"
      />

      <div className="reveal relative overflow-hidden rounded-none border border-border bg-card [animation-delay:160ms]">
        <div className="flex items-center justify-between gap-3 border-b border-border px-5 py-3.5">
          <span className="truncate font-mono text-[11px] tracking-[0.18em] text-muted-foreground uppercase">
            Premier League · MD 05
          </span>
          <span className="inline-flex shrink-0 items-center gap-1.5 font-mono text-[11px] tracking-[0.18em] text-muted-foreground uppercase">
            <span className="live-dot size-1.5 rounded-full bg-foreground" />
            Live odds
          </span>
        </div>

        <div className="px-5 pt-6 pb-5">
          <div className="grid grid-cols-[1fr_auto_1fr] items-center gap-3">
            <span className="truncate text-base font-medium">Arsenal</span>
            <span className="font-mono text-[11px] tracking-[0.18em] text-muted-foreground uppercase">
              vs
            </span>
            <span className="truncate text-right text-base font-medium">
              Chelsea
            </span>
          </div>

          <div className="mt-7 space-y-4">
            {OUTCOMES.map((outcome, index) => (
              <div
                key={outcome.label}
                className="grid grid-cols-[2.75rem_1fr_3.5rem] items-center gap-3"
              >
                <span className="font-mono text-[11px] tracking-[0.14em] text-muted-foreground uppercase">
                  {outcome.label}
                </span>
                <span className="relative block h-[3px] w-full overflow-hidden bg-muted">
                  <span
                    className="bar-fill absolute inset-y-0 left-0 block bg-foreground"
                    style={{
                      width: outcome.width,
                      animationDelay: `${240 + index * 110}ms`,
                    }}
                  />
                </span>
                <span className="text-right font-mono text-sm tabular-nums">
                  {outcome.multiple}
                </span>
              </div>
            ))}
          </div>
        </div>

        <div className="flex items-baseline justify-between gap-3 border-t border-border px-5 py-4">
          <span className="font-mono text-[11px] tracking-[0.18em] text-muted-foreground uppercase">
            Pot
          </span>
          <span className="font-mono text-lg tabular-nums">
            12,480.00
            <span className="ml-1.5 text-xs text-muted-foreground">SACH</span>
          </span>
        </div>

        <div className="flex flex-wrap gap-2 px-5 pb-5">
          <span className="border border-border px-2.5 py-1 font-mono text-[10px] tracking-[0.14em] text-muted-foreground uppercase">
            Void → full refund
          </span>
          <span className="border border-border px-2.5 py-1 font-mono text-[10px] tracking-[0.14em] text-muted-foreground uppercase">
            Rake on-chain
          </span>
          <span className="border border-border px-2.5 py-1 font-mono text-[10px] tracking-[0.14em] text-muted-foreground uppercase">
            Claim anytime
          </span>
        </div>
      </div>
    </figure>
  );
}
