import { ThemeToggle } from "@/components/shared/theme-toggle";
import { PrimaryLink } from "@/components/common/primary-link";
import Link from "next/link";

/**
 * Marketing header. Deliberately separate from the authenticated `Nav`: this
 * one is not wallet-aware and its primary action is the sharp, inverted CTA.
 */
export function SiteHeader() {
  return (
    <header className="sticky top-0 z-50 border-b border-border bg-background/80 backdrop-blur">
      <div className="mx-auto flex h-16 w-full max-w-6xl items-center gap-4 px-4 sm:px-6 lg:px-8">
        <Link
          href="/"
          className="flex items-center gap-2.5 text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-background"
        >
          <span aria-hidden className="size-2.5 bg-foreground" />
          <span className="font-mono text-sm font-medium tracking-[0.2em] uppercase">
            Sachet
          </span>
        </Link>

        <nav className="ml-2 hidden items-center gap-6 text-sm text-muted-foreground sm:flex">
          <a
            href="#how-it-works"
            className="py-2 transition-colors duration-100 ease-out hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-background"
          >
            How it works
          </a>
          <Link
            href="/leaderboard"
            className="py-2 transition-colors duration-100 ease-out hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-background"
          >
            Leaderboard
          </Link>
        </nav>

        <div className="ml-auto flex items-center gap-2">
          <ThemeToggle />
          <PrimaryLink href="/board">Enter market</PrimaryLink>
        </div>
      </div>
    </header>
  );
}
