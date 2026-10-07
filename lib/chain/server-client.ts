import "server-only";
import { createPublicClient, createWalletClient, http } from "viem";
import { privateKeyToAccount, type PrivateKeyAccount } from "viem/accounts";
import { chain, INDEXER_RPC_URL, RPC_URL } from "@/config/chains";

/**
 * Server-side viem clients bound to Robinhood Chain.
 *
 * `publicClient` is used for reads, receipts, and SIWE signature verification.
 * The operator wallet client signs pool creation, resolution, and rake
 * withdrawal — the key is a server secret and never reaches the client.
 */

export const publicClient = createPublicClient({
  chain,
  transport: http(RPC_URL),
});

/**
 * Indexer reads (`eth_getLogs`, block number, market `getPool`) go through a
 * dedicated transport that can point at a wider-range provider, isolated from
 * the app's read path. Retries are generous because backfills are long.
 */
export const indexerClient = createPublicClient({
  chain,
  transport: http(INDEXER_RPC_URL, {
    retryCount: 5,
    retryDelay: 500,
    timeout: 60_000,
  }),
});

function normaliseKey(key: string): `0x${string}` {
  return (key.startsWith("0x") ? key : `0x${key}`) as `0x${string}`;
}

export function getOperatorAccount(): PrivateKeyAccount {
  const key = process.env.OPERATOR_PRIVATE_KEY;
  if (!key) throw new Error("OPERATOR_PRIVATE_KEY is not set");
  return privateKeyToAccount(normaliseKey(key));
}

export function getOperatorWalletClient() {
  return createWalletClient({
    account: getOperatorAccount(),
    chain,
    transport: http(RPC_URL),
  });
}
