"use client";

import { type ReactNode, useMemo } from "react";
import { useTheme } from "next-themes";
import { WagmiProvider } from "wagmi";
import { SessionProvider } from "next-auth/react";
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
