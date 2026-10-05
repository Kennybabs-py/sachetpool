"use client";

import { useState } from "react";
import { LogOut, Menu } from "lucide-react";

import { NavLink } from "@/components/shared/nav-link";
import { SachBalance } from "@/components/wallet/sach-balance";
import {
  Sheet,
  SheetContent,
  SheetFooter,
  SheetHeader,
  SheetTitle,
  SheetTrigger,
} from "@/components/ui/sheet";
import { useDisconnectWallet } from "@/hooks/use-disconnect-wallet";

const LINKS = [
  { href: "/board", label: "Board" },
  { href: "/my-bets", label: "My bets" },
  { href: "/leaderboard", label: "Leaderboard" },
] as const;

/**
 * Mobile navigation for the authenticated app.
 *
 * The inline links collapse into a sheet behind a hamburger, and the wallet
 * section moves down here so the balance, address and Disconnect stay reachable
 * without a desktop-width header. `isAdmin` is resolved on the server and passed
 * in, so the server-only admin list never reaches the client bundle.
 */
export function MobileNav({
  address,
  isAdmin,
}: {
  address: string;
  isAdmin: boolean;
}) {
  const [open, setOpen] = useState(false);
  const disconnectWallet = useDisconnectWallet();

  return (
    <div className="md:hidden">
      <Sheet open={open} onOpenChange={setOpen}>
        <SheetTrigger
          aria-label="Open menu"
          className="inline-flex size-10 shrink-0 items-center justify-center rounded-none border border-border text-foreground transition-colors duration-100 ease-out hover:bg-muted focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-background"
        >
          <Menu className="size-4" aria-hidden />
        </SheetTrigger>

        <SheetContent side="right" className="w-4/5 max-w-xs">
          <SheetHeader>
            <SheetTitle>Menu</SheetTitle>
          </SheetHeader>

          <nav className="flex flex-col gap-2 px-4">
            {LINKS.map((link) => (
              <NavLink
                key={link.href}
                href={link.href}
                onClick={() => setOpen(false)}
                className="py-2 text-base"
              >
                {link.label}
              </NavLink>
            ))}
            {isAdmin && (
              <NavLink
                href="/admin"
                onClick={() => setOpen(false)}
                className="py-2 text-base"
              >
                Admin
              </NavLink>
            )}
            {isAdmin && (
              <NavLink
                href="/sandbox"
                onClick={() => setOpen(false)}
                className="py-2 text-base"
              >
                Sandbox
              </NavLink>
            )}
          </nav>

          <SheetFooter className="gap-3 border-t border-border">
            <div>
              <p className="font-mono text-[11px] tracking-[0.14em] text-muted-foreground uppercase">
                Wallet
              </p>
              <p className="mt-1 font-mono text-xs break-all text-foreground">
                {address}
              </p>
            </div>

            <SachBalance className="px-0" />

            <button
              type="button"
              onClick={disconnectWallet}
              className="inline-flex h-10 shrink-0 items-center justify-center gap-2 rounded-none border border-destructive/40 px-4 text-sm font-medium text-destructive transition-colors duration-100 ease-out hover:bg-destructive/10 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-background"
            >
              <LogOut className="size-4" aria-hidden />
              Disconnect
            </button>
          </SheetFooter>
        </SheetContent>
      </Sheet>
    </div>
  );
}
