import "server-only";
import { parseEventLogs, type Address, type Hash } from "viem";
import { MARKET_ADDRESS, TOKEN_ADDRESS } from "@/config/chains";
import {
  getOperatorAccount,
  getOperatorWalletClient,
  publicClient,
} from "./chain/server-client";
import { sachetMarketAbi } from "./contracts/sachet-market";
import { erc20Abi } from "./contracts/erc20";

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
    readonly code:
      | "MARKET_ADDRESS_MISSING"
      | "TOKEN_ADDRESS_MISSING"
      | "TX_FAILED",
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

function tokenAddress(): Address {
  if (!TOKEN_ADDRESS) {
    throw new MarketError(
      "TOKEN_ADDRESS is not configured",
      "TOKEN_ADDRESS_MISSING",
    );
  }
  return TOKEN_ADDRESS;
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

// ── Sandbox helpers (operator acts as the dummy bettor) ─────────────────────

export interface OperatorBetReceipt {
  hash: Hash;
  blockNumber: bigint;
  logIndex: number;
}

export interface OperatorClaimReceipt {
  hash: Hash;
  blockNumber: bigint;
  logIndex: number;
  amount: bigint;
}

/** The operator wallet's `$SACH` balance, in token base units. */
export async function readOperatorTokenBalance(): Promise<bigint> {
  const account = getOperatorAccount();
  return publicClient.readContract({
    address: tokenAddress(),
    abi: erc20Abi,
    functionName: "balanceOf",
    args: [account.address],
  });
}

/** The market's configured minimum stake, in token base units. */
export async function readMarketMinStake(): Promise<bigint> {
  return publicClient.readContract({
    address: marketAddress(),
    abi: sachetMarketAbi,
    functionName: "minStake",
  });
}

/**
 * Approve (only when short) and stake `amount` from the operator wallet.
 *
 * Betting pulls tokens with `transferFrom`, so the operator must first grant
 * allowance to the market. Returns the confirmed bet transaction plus the
 * decoded `BetPlaced` log position, so callers can mirror it idempotently.
 */
export async function operatorBet(
  poolId: `0x${string}`,
  selection: number,
  amount: bigint,
): Promise<OperatorBetReceipt> {
  const wallet = getOperatorWalletClient();
  const market = marketAddress();
  const token = tokenAddress();

  const allowance = await publicClient.readContract({
    address: token,
    abi: erc20Abi,
    functionName: "allowance",
    args: [wallet.account.address, market],
  });

  if (allowance < amount) {
    const approveHash = await wallet.writeContract({
      address: token,
      abi: erc20Abi,
      functionName: "approve",
      args: [market, amount],
      account: wallet.account,
      chain: wallet.chain,
    });
    await wait(approveHash);
  }

  const hash = await wallet.writeContract({
    address: market,
    abi: sachetMarketAbi,
    functionName: "bet",
    args: [poolId, selection, amount],
    account: wallet.account,
    chain: wallet.chain,
  });

  const receipt = await publicClient.waitForTransactionReceipt({ hash });
  if (receipt.status !== "success") {
    throw new MarketError(`Transaction reverted: ${hash}`, "TX_FAILED");
  }

  const [event] = parseEventLogs({
    abi: sachetMarketAbi,
    logs: receipt.logs,
    eventName: "BetPlaced",
  });

  return {
    hash,
    blockNumber: receipt.blockNumber,
    logIndex: event?.logIndex ?? 0,
  };
}

/** Pull the operator's payout from a resolved pool, returning the amount paid. */
export async function operatorClaim(
  poolId: `0x${string}`,
): Promise<OperatorClaimReceipt> {
  const wallet = getOperatorWalletClient();
  const hash = await wallet.writeContract({
    address: marketAddress(),
    abi: sachetMarketAbi,
    functionName: "claim",
    args: [poolId],
    account: wallet.account,
    chain: wallet.chain,
  });

  const receipt = await publicClient.waitForTransactionReceipt({ hash });
  if (receipt.status !== "success") {
    throw new MarketError(`Transaction reverted: ${hash}`, "TX_FAILED");
  }

  const [event] = parseEventLogs({
    abi: sachetMarketAbi,
    logs: receipt.logs,
    eventName: "Claimed",
  });

  return {
    hash,
    blockNumber: receipt.blockNumber,
    logIndex: event?.logIndex ?? 0,
    amount: event ? event.args.amount : 0n,
  };
}
