const STEPS = [
  {
    number: "01",
    title: "A pool opens",
    body: "One pool per fixture, opened before kickoff. The contract escrows every stake — nothing sits with a bookmaker.",
  },
  {
    number: "02",
    title: "You pick a side",
    body: "Back home, draw, or away with $SACH. Odds move with the crowd, not with a house margin.",
  },
  {
    number: "03",
    title: "Winners claim",
    body: "When the result lands, the pot splits by stake. Cancelled matches refund everyone in full — no rake.",
  },
] as const;

const FORMULAS = [
  "rake = floor(pot × rakeBps / 10000)",
  "payout = floor((pot − rake) × yourStake / winningStake)",
];

/** Supporting section: how a pool resolves, plus the payout math in the open. */
export function HowItWorks() {
  return (
    <section
      id="how-it-works"
      className="scroll-mt-20 border-t border-border bg-background"
    >
      <div className="mx-auto w-full max-w-6xl px-4 py-20 sm:px-6 lg:px-8 lg:py-28">
        <p className="font-mono text-[11px] tracking-[0.22em] text-muted-foreground uppercase">
          How it works
        </p>
        <h2 className="mt-5 max-w-2xl text-3xl font-semibold tracking-[-0.03em] text-balance sm:text-4xl">
          Three steps, one pool, no bookmaker.
        </h2>

        <ol className="mt-12 grid gap-4 md:grid-cols-3">
          {STEPS.map((step) => (
            <li
              key={step.number}
              className="rounded-none border border-border bg-card p-6"
            >
              <span className="font-mono text-xs tracking-[0.18em] text-muted-foreground">
                {step.number}
              </span>
              <h3 className="mt-4 text-base font-medium">{step.title}</h3>
              <p className="mt-2 text-sm leading-relaxed text-muted-foreground">
                {step.body}
              </p>
            </li>
          ))}
        </ol>

        <div className="mt-4 flex flex-wrap gap-x-8 gap-y-2 rounded-none border border-border bg-muted/40 px-6 py-5 font-mono text-xs text-muted-foreground">
          {FORMULAS.map((formula) => (
            <span key={formula}>{formula}</span>
          ))}
        </div>
      </div>
    </section>
  );
}
