import { PrimaryLink } from "@/components/common/primary-link";

import { MarketBoard } from "./market-board";
import GetSach from "../common/get-sach";

const TRUST = [
  "One pool per match",
  "Escrowed in $SACH",
  "Pull-payment claims",
];

/**
 * Landing hero. Copy on the left, an illustrative pool board on the right.
 *
 * Everything below the fold is optional; this section carries the page. Motion
 * is limited to a staggered entrance (`.reveal`) that collapses under
 * `prefers-reduced-motion`.
 */
export function Hero() {
  return (
    <section className="relative overflow-hidden">
      <div aria-hidden className="grid-lines absolute inset-0" />
      <div
        aria-hidden
        className="pointer-events-none absolute inset-x-0 bottom-0 h-40 bg-linear-to-b from-transparent to-background"
      />

      <div className="relative mx-auto grid w-full max-w-6xl items-center gap-14 px-4 py-16 sm:px-6 md:py-24 lg:grid-cols-[1.05fr_0.95fr] lg:gap-20 lg:px-8 lg:py-28">
        <div>
          <p className="reveal font-mono text-[11px] tracking-[0.22em] text-muted-foreground uppercase">
            Pari-mutuel · Robinhood Chain
          </p>

          <h1 className="reveal mt-6 text-[2.6rem] leading-[1.03] font-semibold tracking-[-0.035em] text-balance sm:text-6xl lg:text-[4.25rem] [animation-delay:60ms]">
            The crowd sets the odds.
            <span className="block text-muted-foreground">
              The chain settles the pot.
            </span>
          </h1>

          <p className="reveal mt-6 max-w-xl text-base leading-relaxed text-muted-foreground text-pretty [animation-delay:120ms]">
            Stake $SACH on a football result. Winners split the pool in
            proportion to their stake — no bookmaker, no spread, and every
            settlement verifiable on-chain.
          </p>

          <div className="reveal mt-9 flex flex-wrap items-center gap-x-6 gap-y-4 [animation-delay:200ms]">
            <PrimaryLink href="/board" size="lg">
              Enter the market
            </PrimaryLink>
            <a
              href="#how-it-works"
              className="group inline-flex h-11 items-center gap-2 text-sm font-medium text-muted-foreground transition-colors duration-100 ease-out hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-background"
            >
              How it works
              <span
                aria-hidden
                className="transition-transform duration-150 ease-out group-hover:translate-y-0.5 motion-reduce:transition-none"
              >
                ↓
              </span>
            </a>
          </div>

          <ul className="reveal mt-12 flex flex-wrap items-center gap-x-3 gap-y-2 font-mono text-[11px] tracking-[0.14em] text-muted-foreground uppercase [animation-delay:280ms]">
            {TRUST.map((item, index) => (
              <li key={item} className="flex items-center gap-3">
                {index > 0 && (
                  <span aria-hidden className="text-border">
                    /
                  </span>
                )}
                {item}
              </li>
            ))}
          </ul>

          <GetSach />
        </div>

        <MarketBoard />
      </div>
    </section>
  );
}
