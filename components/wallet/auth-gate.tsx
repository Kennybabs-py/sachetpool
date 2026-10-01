"use client";

import { useEffect } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useSession } from "next-auth/react";
import { ConnectButton } from "@rainbow-me/rainbowkit";

import { LogoLockup } from "@/components/brand/logo";
import { ThemeToggle } from "@/components/shared/theme-toggle";

const TRUST = [
  "One pool per match",
  "Escrowed in $SACH",
  "Pull-payment claims",
];

/**
 * Sign-in wall for `(app)`.
 *
 * Connecting a wallet triggers the RainbowKit SIWE prompt (via the
 * authentication adapter in `AppProvider`). Once the session is authenticated
 * we refresh so the server layout re-renders into the app.
 */
export function AuthGate() {
  const router = useRouter();
  const { status } = useSession();
  const signingIn = status === "authenticated";

  useEffect(() => {
    if (status === "authenticated") router.refresh();
  }, [status, router]);

  return (
    <section className="relative flex flex-1 items-center justify-center overflow-hidden px-4 py-16 sm:py-24">
      <div aria-hidden className="grid-lines absolute inset-0" />
      <div
        aria-hidden
        className="pointer-events-none absolute inset-0 bg-linear-to-b from-background/70 via-transparent to-background"
      />

      <div className="absolute top-4 right-4 z-10">
        <ThemeToggle />
      </div>

      <div className="relative w-full max-w-md">
        <div className="rounded-2xl border border-border bg-card p-8 text-card-foreground sm:p-10">
          <LogoLockup
            className="reveal mb-6"
            markClassName="size-5"
            wordmarkClassName="text-xs"
          />

          <p className="reveal font-mono text-[11px] tracking-[0.22em] text-muted-foreground uppercase">
            Sign in · Robinhood Chain
          </p>

          <h1 className="reveal mt-5 text-3xl leading-tight font-semibold tracking-[-0.03em] text-balance sm:text-4xl [animation-delay:60ms]">
            The crowd sets the odds.
            <span className="block text-muted-foreground">
              Sign in to take your side.
            </span>
          </h1>

          <p className="reveal mt-4 text-sm leading-relaxed text-muted-foreground text-pretty [animation-delay:120ms]">
            Connect a wallet and sign a one-time message to enter. Winners split
            the pool in proportion to their stake, settled on-chain in $SACH.
          </p>

          <div className="reveal mt-8 flex flex-wrap items-center gap-3 [animation-delay:180ms]">
            <ConnectButton
              showBalance={false}
              accountStatus="address"
              chainStatus="icon"
            />
            {signingIn && (
              <span className="inline-flex items-center gap-2 font-mono text-[11px] tracking-[0.14em] text-muted-foreground uppercase">
                <span
                  aria-hidden
                  className="live-dot size-1.5 rounded-full bg-emerald-500"
                />
                Signing you in
              </span>
            )}
          </div>

          <p className="reveal mt-6 text-xs leading-relaxed text-muted-foreground [animation-delay:240ms]">
            Signing is free and proves you own the wallet. No funds move until
            you place a bet.
          </p>
        </div>

        <ul className="reveal mt-6 flex flex-wrap items-center justify-center gap-x-3 gap-y-2 font-mono text-[11px] tracking-[0.14em] text-muted-foreground uppercase [animation-delay:300ms]">
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

        <p className="reveal mt-6 text-center text-xs text-muted-foreground [animation-delay:360ms]">
          <Link
            href="/"
            className="transition-colors duration-100 ease-out hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-background"
          >
            ← Back to home
          </Link>
        </p>
      </div>
    </section>
  );
}
