import "server-only";
import type { Address, Hash } from "viem";
import { MARKET_ADDRESS } from "@/config/chains";
import { getOperatorWalletClient, publicClient } from "./chain/server-client";
import { sachetMarketAbi } from "./contracts/sachet-market";

/**
 * Operator-signed `SachetMarket` writes.
 *
 * Every call waits for a receipt so callers can persist the tx hash only once
 * the state change is confirmed. The operator key lives on the server; these
 * helpers are never imported from client code.
 */

export class MarketError extends Error {
  constructor(
    message: string,
    readonly code: "MARKET_ADDRESS_MISSING" | "TX_FAILED",
  ) {
    super(message);
    this.name = "MarketError";
  }
}

function marketAddress(): Address {
  if (!MARKET_ADDRESS) {
    throw new MarketError(
      "MARKET_ADDRESS is not configured",
      "MARKET_ADDRESS_MISSING",
    );
  }
  return MARKET_ADDRESS;
}

async function wait(hash: Hash): Promise<Hash> {
  const receipt = await publicClient.waitForTransactionReceipt({ hash });
  if (receipt.status !== "success") {
    throw new MarketError(`Transaction reverted: ${hash}`, "TX_FAILED");
  }
  return hash;
}

/** Open a pool on-chain. `expiresAt` is a unix timestamp in seconds. */
export async function operatorCreatePool(
  poolId: `0x${string}`,
  expiresAt: number,
  rakeBps: number,
): Promise<Hash> {
  const wallet = getOperatorWalletClient();
  const hash = await wallet.writeContract({
    address: marketAddress(),
    abi: sachetMarketAbi,
    functionName: "createPool",
    args: [poolId, BigInt(expiresAt), rakeBps],
    account: wallet.account,
    chain: wallet.chain,
  });
  return wait(hash);
}

/** Resolve a pool with outcome 1/2/3 (HOME/DRAW/AWAY) or 4 (VOID). */
export async function operatorResolvePool(
  poolId: `0x${string}`,
  outcome: number,
): Promise<Hash> {
  const wallet = getOperatorWalletClient();
  const hash = await wallet.writeContract({
    address: marketAddress(),
    abi: sachetMarketAbi,
    functionName: "resolve",
    args: [poolId, outcome],
    account: wallet.account,
    chain: wallet.chain,
  });
  return wait(hash);
}

/** Sweep accrued rake to `to`. */
export async function operatorWithdrawTreasury(to: Address): Promise<Hash> {
  const wallet = getOperatorWalletClient();
  const hash = await wallet.writeContract({
    address: marketAddress(),
    abi: sachetMarketAbi,
    functionName: "withdrawTreasury",
    args: [to],
    account: wallet.account,
    chain: wallet.chain,
  });
  return wait(hash);
}
