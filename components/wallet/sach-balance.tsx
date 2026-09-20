"use client";

import { useAccount, useReadContract } from "wagmi";
import { erc20Abi } from "@/lib/contracts/erc20";
import { TOKEN_ADDRESS, TOKEN_DECIMALS, TOKEN_SYMBOL } from "@/config/chains";
import { formatToken } from "@/lib/format";

/** Live `$SACH` balance for the connected wallet. */
export function SachBalance() {
  const { address, isConnected } = useAccount();

  const { data } = useReadContract({
    address: TOKEN_ADDRESS,
    abi: erc20Abi,
    functionName: "balanceOf",
    args: address ? [address] : undefined,
    query: { enabled: Boolean(address && TOKEN_ADDRESS) },
  });

  if (!isConnected) return null;

  return (
    <span className="rounded-full bg-muted px-3 py-1 text-xs font-medium tabular-nums text-muted-foreground">
      {data !== undefined
        ? `${formatToken(data, TOKEN_DECIMALS)} ${TOKEN_SYMBOL}`
        : `— ${TOKEN_SYMBOL}`}
    </span>
  );
}
