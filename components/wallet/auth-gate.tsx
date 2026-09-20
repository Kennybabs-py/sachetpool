"use client";

import { useEffect } from "react";
import { useRouter } from "next/navigation";
import { useSession } from "next-auth/react";
import { ConnectButton } from "@rainbow-me/rainbowkit";

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

  useEffect(() => {
    if (status === "authenticated") router.refresh();
  }, [status, router]);

  return (
    <div className="flex flex-1 flex-col items-center justify-center gap-6 px-6 text-center">
      <div className="max-w-sm">
        <h1 className="text-2xl font-semibold tracking-tight">Sachet</h1>
        <p className="mt-2 text-sm text-muted-foreground">
          Connect your wallet and sign in to predict football results. Stakes are
          escrowed in $SACH on Robinhood Chain.
        </p>
      </div>
      <ConnectButton showBalance={false} />
      {status === "authenticated" && (
        <p className="text-xs text-muted-foreground">Signing you in…</p>
      )}
    </div>
  );
}
