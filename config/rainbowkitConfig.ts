import { http, createConfig } from "wagmi";
import { chain, RPC_URL } from "./chains";
import { connectorsForWallets } from "@rainbow-me/rainbowkit";
import {
  rainbowWallet,
  walletConnectWallet,
  metaMaskWallet,
  zerionWallet,
} from "@rainbow-me/rainbowkit/wallets";
import { getDefaultConfig } from "@rainbow-me/rainbowkit";

const WALLET_CONNECT_PROJECT_ID = process.env
  .NEXT_PUBLIC_WALLET_CONNECT_PROJECT_ID as string;
// WalletConnect's metadata `url` is required for its mobile deep-link flow; fall
// back to the live origin so a deploy that forgets NEXT_PUBLIC_APP_URL still works.
const APP_URL =
  process.env.NEXT_PUBLIC_APP_URL ||
  (typeof window !== "undefined" ? window.location.origin : undefined);

/**
 * Kept deliberately short.
 *
 * RainbowKit's ConnectModal does not constrain a long wallet list on small
 * screens: past the viewport height the rows land in an `overflow-hidden`
 * ancestor with no scroll container, so on mobile the list is clipped and
 * un-scrollable — users tap and nothing happens. A short list always fits.
 * Add wallets sparingly and re-check the mobile modal when you do.
 */
const connectors = connectorsForWallets(
  [
    {
      groupName: "Recommended",
      wallets: [
        rainbowWallet,
        walletConnectWallet,
        metaMaskWallet,
        zerionWallet,
      ],
    },
  ],
  {
    appName: "Sachet Pool",
    projectId: WALLET_CONNECT_PROJECT_ID,
    appUrl: APP_URL,
  },
);

export const rainbowkitConfig_ = createConfig({
  connectors,
  chains: [chain],
  transports: {
    [chain.id]: http(RPC_URL),
  },
  ssr: true,
});

export const rainbowkitConfig = getDefaultConfig({
  appName: "Sachet Pool",
  projectId: WALLET_CONNECT_PROJECT_ID,
  appUrl: APP_URL,
  chains: [chain],
  transports: {
    [chain.id]: http(RPC_URL),
  },
  wallets: [
    {
      groupName: "Recommended",
      wallets: [
        rainbowWallet,
        walletConnectWallet,
        metaMaskWallet,
        zerionWallet,
      ],
    },
  ],
});
