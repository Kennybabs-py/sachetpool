import { defineChain, type Address } from "viem";

const envMap: Record<string, string> = {
  NEXT_PUBLIC_CHAIN_ID: process.env.NEXT_PUBLIC_CHAIN_ID as string,
  CHAIN_ID: process.env.CHAIN_ID as string,
  NEXT_PUBLIC_CHAIN_NAME: process.env.NEXT_PUBLIC_CHAIN_NAME as string,
  CHAIN_NAME: process.env.CHAIN_NAME as string,

  NEXT_PUBLIC_RPC_URL: process.env.NEXT_PUBLIC_RPC_URL as string,
  RPC_URL: process.env.RPC_URL as string,
  INDEXER_RPC_URL: process.env.INDEXER_RPC_URL as string,

  NEXT_PUBLIC_EXPLORER_URL: process.env.NEXT_PUBLIC_EXPLORER_URL as string,
  EXPLORER_URL: process.env.EXPLORER_URL as string,

  NEXT_PUBLIC_SACH_TOKEN_ADDRESS: process.env
    .NEXT_PUBLIC_SACH_TOKEN_ADDRESS as string,
  SACH_TOKEN_ADDRESS: process.env.SACH_TOKEN_ADDRESS as string,

  NEXT_PUBLIC_SACH_TOKEN_DECIMALS: process.env
    .NEXT_PUBLIC_SACH_TOKEN_DECIMALS as string,
  SACH_TOKEN_DECIMALS: process.env.SACH_TOKEN_DECIMALS as string,

  NEXT_PUBLIC_MARKET_ADDRESS: process.env.NEXT_PUBLIC_MARKET_ADDRESS as string,
  MARKET_ADDRESS: process.env.MARKET_ADDRESS as string,

  MARKET_DEPLOY_BLOCK: process.env.MARKET_DEPLOY_BLOCK as string,
  NEXT_PUBLIC_MARKET_DEPLOY_BLOCK: process.env
    .NEXT_PUBLIC_MARKET_DEPLOY_BLOCK as string,
};

/**
 * Robinhood Chain configuration.
 *
 * One chain, driven entirely by env so testnet → mainnet is a config flip. The
 * `NEXT_PUBLIC_*` variants are read first because this module is imported by the
 * client-side wagmi/RainbowKit config; the bare names are the server fallback.
 *
 * Sensible local defaults (anvil, id 31337) keep `next build` working before the
 * deploy-time inputs exist. Server-side money paths validate the real values at
 * runtime.
 */

function firstEnv(...keys: string[]): string | undefined {
  // Hardcode the lookups so Next.js compiler can see them

  for (const key of keys) {
    const value = envMap[key];
    // console.log(`Key: ${key}, Value: ${value}`);
    if (value && value.trim() !== "") return value.trim();
  }
  return undefined;
}

function intEnv(fallback: number, ...keys: string[]): number {
  const raw = firstEnv(...keys);
  if (!raw) return fallback;
  const parsed = Number(raw);
  return Number.isFinite(parsed) ? parsed : fallback;
}

export const chainId = intEnv(4663, "NEXT_PUBLIC_CHAIN_ID", "CHAIN_ID");

export const CHAIN_NAME =
  firstEnv("NEXT_PUBLIC_CHAIN_NAME", "CHAIN_NAME") ?? "Robinhood Chain";

export const RPC_URL =
  firstEnv("NEXT_PUBLIC_RPC_URL", "RPC_URL") ?? "http://127.0.0.1:8545";

/**
 * RPC used by the server-side indexer. Defaults to `RPC_URL`, but a provider
 * with a wider `eth_getLogs` block span (and no per-request cap) can be set
 * here so a backfill needs far fewer calls than a throttled free tier allows.
 */
export const INDEXER_RPC_URL = firstEnv("INDEXER_RPC_URL") ?? RPC_URL;

export const EXPLORER_URL = firstEnv(
  "NEXT_PUBLIC_EXPLORER_URL",
  "EXPLORER_URL",
);

/** Native gas currency for the escrow chain. */
const NATIVE = { name: "Ether", symbol: "ETH", decimals: 18 } as const;

export const chain = defineChain({
  id: chainId,
  name: CHAIN_NAME,
  nativeCurrency: NATIVE,
  rpcUrls: {
    default: { http: [RPC_URL] },
    public: { http: [RPC_URL] },
  },
  blockExplorers: EXPLORER_URL
    ? { default: { name: `${CHAIN_NAME} Explorer`, url: EXPLORER_URL } }
    : undefined,
  // testnet: true,
});

/** `$SACH` token the market escrows. */
export const TOKEN_ADDRESS = firstEnv(
  "NEXT_PUBLIC_SACH_TOKEN_ADDRESS",
  "SACH_TOKEN_ADDRESS",
) as Address | undefined;

export const TOKEN_DECIMALS = intEnv(
  18,
  "NEXT_PUBLIC_SACH_TOKEN_DECIMALS",
  "SACH_TOKEN_DECIMALS",
);

export const TOKEN_SYMBOL =
  firstEnv("NEXT_PUBLIC_SACH_TOKEN_SYMBOL", "SACH_TOKEN_SYMBOL") ?? "$SACH";

/** Deployed `SachetMarket` address. Filled after deploy. */
export const MARKET_ADDRESS = firstEnv(
  "NEXT_PUBLIC_MARKET_ADDRESS",
  "MARKET_ADDRESS",
) as Address | undefined;

/** Block the market was deployed at — the indexer's start point. */
export const MARKET_DEPLOY_BLOCK = intEnv(
  0,
  "MARKET_DEPLOY_BLOCK",
  "NEXT_PUBLIC_MARKET_DEPLOY_BLOCK",
);

export function explorerTxUrl(hash: string): string | null {
  return EXPLORER_URL ? `${EXPLORER_URL.replace(/\/$/, "")}/tx/${hash}` : null;
}

export function explorerAddressUrl(address: string): string | null {
  return EXPLORER_URL
    ? `${EXPLORER_URL.replace(/\/$/, "")}/address/${address}`
    : null;
}
