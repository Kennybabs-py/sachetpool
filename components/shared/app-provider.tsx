"use client";

import { type ReactNode } from "react";
import { WagmiProvider } from "wagmi";
import { SessionProvider } from "next-auth/react";
import { RainbowKitProvider } from "@rainbow-me/rainbowkit";
import {
  RainbowKitSiweNextAuthProvider,
  type GetSiweMessageOptions,
} from "@rainbow-me/rainbowkit-siwe-next-auth";
import "@rainbow-me/rainbowkit/styles.css";

import { TooltipProvider } from "@/components/ui/tooltip";
import { QueryClient, QueryClientProvider } from "@/lib/tanstack";
import { rainbowkitConfig } from "@/config/rainbowkitConfig";

const getSiweMessageOptions: GetSiweMessageOptions = () => ({
  statement: "Sign in to Sachet",
});

const queryClient = new QueryClient();

/**
 * Client providers: wagmi + RainbowKit, NextAuth session, and the SIWE
 * authentication adapter that ties the two together. Must wrap every route that
 * touches a wallet, so it lives in the root layout.
 */
export default function AppProvider({ children }: { children: ReactNode }) {
  return (
    <WagmiProvider config={rainbowkitConfig}>
      <QueryClientProvider client={queryClient}>
        <SessionProvider refetchInterval={0}>
          <RainbowKitSiweNextAuthProvider
            getSiweMessageOptions={getSiweMessageOptions}
          >
            <RainbowKitProvider>
              <TooltipProvider>{children}</TooltipProvider>
            </RainbowKitProvider>
          </RainbowKitSiweNextAuthProvider>
        </SessionProvider>
      </QueryClientProvider>
    </WagmiProvider>
  );
}
