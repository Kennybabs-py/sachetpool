import Link from "next/link";
import { isAdmin } from "@/lib/admin";
import { LogoLockup } from "@/components/brand/logo";
import { SachBalance } from "@/components/wallet/sach-balance";
import { ThemeToggle } from "@/components/shared/theme-toggle";
import { shortAddress } from "@/lib/format";

/** Top navigation for the authenticated app. */
export function Nav({ address }: { address: string }) {
  return (
    <header className="sticky top-0 z-10 flex items-center gap-4 border-b border-border bg-background/80 px-4 py-3 backdrop-blur">
      <Link
        href="/board"
        className="grid place-items-center text-foreground transition-colors hover:text-muted-foreground"
      >
        <LogoLockup markClassName="size-4" wordmarkClassName="text-xs" />
      </Link>

      <nav className="flex items-center gap-3 text-sm text-muted-foreground">
        <Link href="/board" className="transition-colors hover:text-foreground">
          Board
        </Link>
        <Link
          href="/my-bets"
          className="transition-colors hover:text-foreground"
        >
          My bets
        </Link>
        <Link
          href="/leaderboard"
          className="transition-colors hover:text-foreground"
        >
          Leaderboard
        </Link>
        {isAdmin(address) && (
          <Link
            href="/admin"
            className="transition-colors hover:text-foreground"
          >
            Admin
          </Link>
        )}
      </nav>
      <div className="ml-auto flex items-center gap-2">
        <SachBalance />
        <span className="hidden text-xs text-muted-foreground sm:inline">
          {shortAddress(address)}
        </span>
        <ThemeToggle />
      </div>
    </header>
  );
}
