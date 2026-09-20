import { createConfig, http } from "wagmi";
import { chain, RPC_URL } from "./chains";

/** Wagmi config for the single Robinhood Chain. */
export const wagmiConfig = createConfig({
  chains: [chain],
  transports: {
    [chain.id]: http(RPC_URL),
  },
  ssr: true,
});
