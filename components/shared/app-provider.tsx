"use client";

import { type ReactNode, useEffect, useMemo, useRef } from "react";
import { useTheme } from "next-themes";
import { WagmiProvider } from "wagmi";
import { SessionProvider, useSession } from "next-auth/react";
import posthog from "posthog-js";
import {
  darkTheme,
  lightTheme,
  RainbowKitProvider,
} from "@rainbow-me/rainbowkit";
import {
  RainbowKitSiweNextAuthProvider,
  type GetSiweMessageOptions,
} from "@rainbow-me/rainbowkit-siwe-next-auth";
import "@rainbow-me/rainbowkit/styles.css";

import { TooltipProvider } from "@/components/ui/tooltip";
import { QueryClient, QueryClientProvider } from "@/lib/tanstack";
import { rainbowkitConfig } from "@/config/rainbowkitConfig";

const getSiweMessageOptions: GetSiweMessageOptions = () => ({
  statement: "Sign in to Sachet Pool",
});

const queryClient = new QueryClient();
const isPostHogConfigured = Boolean(
  process.env.NEXT_PUBLIC_POSTHOG_PROJECT_TOKEN &&
    process.env.NEXT_PUBLIC_POSTHOG_HOST,
);

/**
 * Binds the browser PostHog client to the canonical SIWE wallet address once
 * the NextAuth session has resolved. The SDK persists this identity across
 * page navigation; reset clears it before a later wallet can use this browser.
 */
function PostHogIdentity() {
  const { data: session, status } = useSession();
  const identifiedAddress = useRef<string | null>(null);
  const address = session?.address?.toLowerCase();

  useEffect(() => {
    if (!isPostHogConfigured || status === "loading") return;

    const previousAddress = identifiedAddress.current;

    if (!address) {
      if (previousAddress) {
        if (posthog.get_distinct_id() === previousAddress) posthog.reset();
        identifiedAddress.current = null;
      }
      return;
    }

    if (previousAddress === address) return;

    if (previousAddress && posthog.get_distinct_id() === previousAddress) {
      posthog.reset();
    }
    posthog.identify(address);
    identifiedAddress.current = address;
  }, [address, status]);

  return null;
}

/**
 * Client providers: wagmi + RainbowKit, NextAuth session, and the SIWE
 * authentication adapter that ties the two together. Must wrap every route that
 * touches a wallet, so it lives in the root layout.
 */
export default function AppProvider({ children }: { children: ReactNode }) {
  const { resolvedTheme } = useTheme();
  const isDark = resolvedTheme !== "light";

  // RainbowKit ships its own styles, so mirror the app tokens here. Square
  // corners keep the wallet UI consistent with the landing buttons.
  const rainbowKitTheme = useMemo(
    () =>
      isDark
        ? darkTheme({
            accentColor: "#ffffff",
            accentColorForeground: "#121212",
            borderRadius: "none",
            overlayBlur: "small",
          })
        : lightTheme({
            accentColor: "#121212",
            accentColorForeground: "#ffffff",
            borderRadius: "none",
            overlayBlur: "small",
          }),
    [isDark],
  );

  return (
    <WagmiProvider config={rainbowkitConfig}>
      <QueryClientProvider client={queryClient}>
        <SessionProvider refetchInterval={0}>
          <PostHogIdentity />
          <RainbowKitSiweNextAuthProvider
            getSiweMessageOptions={getSiweMessageOptions}
          >
            <RainbowKitProvider theme={rainbowKitTheme}>
              <TooltipProvider>{children}</TooltipProvider>
            </RainbowKitProvider>
          </RainbowKitSiweNextAuthProvider>
        </SessionProvider>
      </QueryClientProvider>
    </WagmiProvider>
  );
}
