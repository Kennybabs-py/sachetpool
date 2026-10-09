"use client";

import { useEffect } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { ConnectButton } from "@rainbow-me/rainbowkit";
import { LogoLockup } from "@/components/brand/logo";
import { NavLink } from "@/components/shared/nav-link";
import { MobileNav } from "@/components/shared/mobile-nav";
import { WalletMenu } from "@/components/wallet/wallet-menu";
import { ThemeToggle } from "@/components/shared/theme-toggle";
import { useSession } from "next-auth/react";

type Props = {
  address: string | null;
  admin: boolean;
};
/**
 * Top navigation. `address` is `null` for anonymous visitors, who can still
 * browse fixtures — the wallet controls become a connect prompt.
 * `admin` is the server-resolved flag controlling admin links. Refreshes the
 * current route when the session becomes authenticated, including on mount.
 */
export function Nav({ address, admin }: Props) {
  const router = useRouter();
  const { status } = useSession();

  useEffect(() => {
    if (status === "authenticated") router.refresh();
  }, [status, router]);

  const IS_DEVELOPMENT = process.env.NODE_ENV === "development";

  return (
    <header className="sticky top-0 z-10 flex items-center gap-4 border-b border-border bg-background/80 px-4 py-3 backdrop-blur">
      <Link
        href="/"
        className="grid place-items-center text-foreground transition-colors hover:text-muted-foreground"
      >
        <LogoLockup markClassName="size-4" wordmarkClassName="text-xs" />
      </Link>

      <nav className="hidden items-center gap-4 md:flex">
        <NavLink href="/board">Board</NavLink>
        <NavLink href="/my-bets">My bets</NavLink>
        <NavLink href="/leaderboard">Leaderboard</NavLink>
        {admin && IS_DEVELOPMENT && <NavLink href="/admin">Admin</NavLink>}
        {admin && IS_DEVELOPMENT && <NavLink href="/sandbox">Sandbox</NavLink>}
      </nav>

      <div className="ml-auto flex items-center gap-2">
        <div className="hidden md:flex">
          {address ? (
            <WalletMenu address={address} />
          ) : (
            <ConnectButton
              showBalance={false}
              accountStatus="address"
              chainStatus="icon"
            />
          )}
        </div>
        <ThemeToggle />
        <MobileNav address={address} isAdmin={admin} />
      </div>
    </header>
  );
}
