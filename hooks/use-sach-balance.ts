"use client";
import { useConnection, useReadContract } from "wagmi";

import { TOKEN_ADDRESS, TOKEN_DECIMALS, TOKEN_SYMBOL } from "@/config/chains";
import { erc20Abi } from "@/lib/contracts/erc20";
import { formatToken } from "@/lib/format";

/**
 * The connected wallet's `$SACH` balance.
 *
 * The single source of truth for this read: every surface that needs the
 * balance (wallet menu, bet sheet, …) calls this instead of issuing its own
 * `useReadContract`. wagmi/React Query share the cache, so multiple consumers
 * still produce one on-chain call.
 *
 * `balance` stays `undefined` until the first read resolves, so callers can
 * tell "not loaded" apart from a genuine zero balance.
 */
export function useSachBalance() {
  const { address, isConnected } = useConnection();

  const { data, refetch, isLoading, isError } = useReadContract({
    abi: erc20Abi,
    address: TOKEN_ADDRESS,
    functionName: "balanceOf",
    args: [address!],
    query: { enabled: Boolean(address && TOKEN_ADDRESS) },
  });

  return {
    /** Balance in base units, or `undefined` before the first read. */
    balance: data,
    /** Display form, e.g. `12480 SACH`; `undefined` until loaded. */
    formatted:
      data !== undefined
        ? `${formatToken(data, TOKEN_DECIMALS)} ${TOKEN_SYMBOL}`
        : undefined,
    refetch,
    isConnected,
    isLoading,
    isError,
  };
}
