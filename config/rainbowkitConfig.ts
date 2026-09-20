import { getDefaultConfig } from "@rainbow-me/rainbowkit";
import { http } from "wagmi";
import { chain, RPC_URL } from "./chains";

const WALLET_CONNECT_PROJECT_ID =
  process.env.NEXT_PUBLIC_WALLET_CONNECT_PROJECT_ID ??
  // Legacy typo kept so existing local envs keep working.
  process.env.NEXT_PUBIC_WALLET_CONNECT_PROJECT_ID ??
  "";

/** RainbowKit config bound to Robinhood Chain (mainnet/tests dropped). */
export const rainbowkitConfig = getDefaultConfig({
  appName: "Sachet",
  projectId: WALLET_CONNECT_PROJECT_ID,
  chains: [chain],
  transports: {
    [chain.id]: http(RPC_URL),
  },
  ssr: true,
});
