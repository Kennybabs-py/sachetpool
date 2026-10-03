import Link from "next/link";
import { isAdmin } from "@/lib/admin";
import { LogoLockup } from "@/components/brand/logo";
import { NavLink } from "@/components/shared/nav-link";
import { WalletMenu } from "@/components/wallet/wallet-menu";
import { ThemeToggle } from "@/components/shared/theme-toggle";

/** Top navigation for the authenticated app. */
export function Nav({ address }: { address: string }) {
  return (
    <header className="sticky top-0 z-10 flex items-center gap-4 border-b border-border bg-background/80 px-4 py-3 backdrop-blur">
      <Link
        href="/"
        className="grid place-items-center text-foreground transition-colors hover:text-muted-foreground"
      >
        <LogoLockup markClassName="size-4" wordmarkClassName="text-xs" />
      </Link>

      <nav className="flex items-center gap-4">
        <NavLink href="/board">Board</NavLink>
        <NavLink href="/my-bets">My bets</NavLink>
        <NavLink href="/leaderboard">Leaderboard</NavLink>
        {isAdmin(address) && <NavLink href="/admin">Admin</NavLink>}
      </nav>
      <div className="ml-auto flex items-center gap-2">
        <WalletMenu address={address} />
        <ThemeToggle />
      </div>
    </header>
  );
}
