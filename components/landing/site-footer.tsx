import Link from "next/link";

import { LogoLockup } from "@/components/brand/logo";

const LINKS = [
  { href: "/board", label: "Board" },
  { href: "/leaderboard", label: "Leaderboard" },
  { href: "/my-bets", label: "My bets" },
  { href: "/faqs", label: "FAQs" },
] as const;

export function SiteFooter() {
  return (
    <footer className="border-t border-border bg-background">
      <div className="mx-auto flex w-full max-w-6xl flex-col gap-8 px-4 py-12 sm:px-6 lg:px-8">
        <div className="flex flex-wrap items-start justify-between gap-6">
          <div>
            <LogoLockup
              className="text-foreground"
              markClassName="size-4"
              wordmarkClassName="text-sm"
            />
            <p className="mt-3 max-w-xs text-sm text-muted-foreground">
              Pari-mutuel football markets, staked in $SACH on Robinhood Chain.
            </p>
          </div>

          <nav className="flex flex-wrap gap-x-6 gap-y-2 text-sm">
            {LINKS.map((link) => (
              <Link
                key={link.href}
                href={link.href}
                className="text-muted-foreground transition-colors duration-100 ease-out hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-background"
              >
                {link.label}
              </Link>
            ))}
          </nav>
        </div>

        <div className="flex flex-wrap items-center justify-between gap-3 border-t border-border pt-6 font-mono text-[11px] tracking-[0.12em] text-muted-foreground uppercase">
          <span>Prediction markets involve risk. $SACH is a utility token.</span>
          <span>Unaudited · Testnet first</span>
        </div>
      </div>
    </footer>
  );
}
