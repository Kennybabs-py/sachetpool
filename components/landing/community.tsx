import Link from "next/link";

import { PrimaryLink } from "@/components/common/primary-link";

const PILLARS = [
  {
    title: "Community-led growth",
    body: "$SACH grows through its players, not a central marketing budget. Every stake, shared fixture and invited friend is part of the effort.",
  },
  {
    title: "Climb the leaderboard",
    body: "Sharp picks and consistency move you up the public board — the standing record of who is helping the pool grow.",
  },
  {
    title: "Creator-fee share",
    body: "As the market grows, the top users on the leaderboard have a chance to share in creator fees.",
  },
] as const;

/**
 * Landing teaser for the community/rewards story. The full detail lives in the
 * "Community and engagement" FAQ group, which this section links to.
 */
export function Community() {
  return (
    <section
      id="community"
      className="scroll-mt-20 border-t border-border bg-background"
    >
      <div className="mx-auto w-full max-w-6xl px-4 py-20 sm:px-6 lg:px-8 lg:py-28">
        <p className="font-mono text-[11px] tracking-[0.22em] text-muted-foreground uppercase">
          Community
        </p>
        <h2 className="mt-5 max-w-2xl text-3xl font-semibold tracking-[-0.03em] text-balance sm:text-4xl">
          Built by the crowd, rewarded for it.
        </h2>
        <p className="mt-5 max-w-xl text-base leading-relaxed text-muted-foreground text-pretty">
          The growth of $SACH is a community effort. The sharper your calls, the
          higher you climb — and top users have a chance to earn a share of
          creator fees as the market grows.
        </p>

        <div className="mt-12 grid gap-4 md:grid-cols-3">
          {PILLARS.map((pillar) => (
            <div
              key={pillar.title}
              className="rounded-none border border-border bg-card p-6"
            >
              <h3 className="text-base font-medium">{pillar.title}</h3>
              <p className="mt-2 text-sm leading-relaxed text-muted-foreground">
                {pillar.body}
              </p>
            </div>
          ))}
        </div>

        <div className="mt-8 flex flex-wrap items-center gap-x-6 gap-y-4">
          <PrimaryLink href="/leaderboard" size="lg">
            View the leaderboard
          </PrimaryLink>
          <Link
            href="/faqs#community-and-engagement"
            className="group inline-flex h-11 items-center gap-2 text-sm font-medium text-muted-foreground transition-colors duration-100 ease-out hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-background"
          >
            How rewards work
            <span
              aria-hidden
              className="transition-transform duration-150 ease-out group-hover:translate-x-0.5 motion-reduce:transition-none"
            >
              →
            </span>
          </Link>
        </div>
      </div>
    </section>
  );
}
