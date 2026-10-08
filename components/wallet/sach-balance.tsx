"use client";

import { useSachBalance } from "@/hooks/use-sach-balance";
import { TOKEN_SYMBOL } from "@/config/chains";
import { cn } from "@/lib/utils";

/** Live `$SACH` balance row, shown inside the wallet menu. */
export function SachBalance({ className }: { className?: string }) {
  const { formatted, isConnected } = useSachBalance();

  return (
    <div
      className={cn(
        "flex items-center justify-between gap-4 px-2 py-1.5",
        className,
      )}
    >
      <span className="text-xs text-muted-foreground">Balance</span>
      <span className="font-mono text-xs font-medium tabular-nums text-foreground">
        {isConnected && formatted ? formatted : `— ${TOKEN_SYMBOL}`}
      </span>
    </div>
  );
}
