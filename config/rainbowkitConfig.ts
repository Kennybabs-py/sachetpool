import { http, createConfig } from "wagmi";
import { chain, RPC_URL } from "./chains";
import { connectorsForWallets } from "@rainbow-me/rainbowkit";
import {
  rainbowWallet,
  walletConnectWallet,
  phantomWallet,
  zerionWallet,
  metaMaskWallet,
  base,
  binanceWallet,
  bitgetWallet,
  bitskiWallet,
  bitverseWallet,
  braveWallet,
  bybitWallet,
  krakenWallet,
  kresusWallet,
  ledgerWallet,
  magicEdenWallet,
  mewWallet,
  mecoWallet,
  nestWallet,
  novaWallet,
  oktoWallet,
  okxWallet,
  rabbyWallet,
  readyWallet,
  safeWallet,
  uniswapWallet,
  valoraWallet,
} from "@rainbow-me/rainbowkit/wallets";

const WALLET_CONNECT_PROJECT_ID = process.env
  .NEXT_PUBLIC_WALLET_CONNECT_PROJECT_ID as string;

const connectors = connectorsForWallets(
  [
    {
      groupName: "Recommended",
      wallets: [
        rainbowWallet,
        walletConnectWallet,
        phantomWallet,
        zerionWallet,
        metaMaskWallet,
        base,

        binanceWallet,
        bitgetWallet,
        bitskiWallet,
        bitverseWallet,
        braveWallet,
        bybitWallet,

        krakenWallet,
        kresusWallet,
        ledgerWallet,
        magicEdenWallet,
        metaMaskWallet,
        mewWallet,
        mecoWallet,
        nestWallet,
        novaWallet,
        oktoWallet,
        okxWallet,

        phantomWallet,
        rabbyWallet,
        rainbowWallet,
        readyWallet,

        safeWallet,

        uniswapWallet,
        valoraWallet,
        walletConnectWallet,

        zerionWallet,
      ],
    },
  ],
  {
    appName: "Sachet Pool",
    projectId: WALLET_CONNECT_PROJECT_ID,
  },
);

export const rainbowkitConfig = createConfig({
  connectors,
  chains: [chain],
  transports: {
    [chain.id]: http(RPC_URL),
  },
  ssr: true,
});
