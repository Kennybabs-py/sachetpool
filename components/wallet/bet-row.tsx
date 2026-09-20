import type { BetStatus, Selection } from "@/generated/prisma/client";
import { cn } from "@/lib/utils";
import { formatToken } from "@/lib/format";
import { TOKEN_DECIMALS, TOKEN_SYMBOL } from "@/config/chains";
import { ClaimButton } from "./claim-button";

/**
 * One of the user's bets in the history list. Presentational (no client
 * directive), rendered by the RSC my-bets page. Shows the fixture, the pick,
 * the stake, and — once resolved — the outcome and a claim action.
 */

interface BetRowData {
  id: string;
  selection: Selection;
  amount: string;
  status: BetStatus;
  payout: string;
  claimable: boolean;
  onchainPoolId: string;
  pool: {
    match: {
      homeTeam: string;
      awayTeam: string;
    };
  };
}

const STATUS: Record<BetStatus, { label: string; className: string }> = {
  PENDING: {
    label: "Open",
    className: "bg-secondary text-secondary-foreground",
  },
  WON: { label: "Won", className: "bg-primary/15 text-primary" },
  LOST: { label: "Lost", className: "bg-muted text-muted-foreground" },
  VOID: { label: "Void", className: "bg-muted text-muted-foreground" },
  CLAIMED: { label: "Claimed", className: "bg-primary/10 text-primary" },
};

export function BetRow({ bet }: { bet: BetRowData }) {
  const { match } = bet.pool;
  const picked =
    bet.selection === "HOME"
      ? match.homeTeam
      : bet.selection === "AWAY"
        ? match.awayTeam
        : "Draw";
  const status = STATUS[bet.status];

  return (
    <li className="flex flex-col gap-1 py-3">
      <div className="flex items-center justify-between gap-2">
        <p className="min-w-0 truncate text-sm font-medium">
          {match.homeTeam} <span className="text-muted-foreground">vs</span>{" "}
          {match.awayTeam}
        </p>
        <span
          className={cn(
            "shrink-0 rounded-full px-2 py-0.5 text-xs font-medium",
            status.className,
          )}
        >
          {status.label}
        </span>
      </div>
      <div className="flex items-center justify-between gap-2 text-xs text-muted-foreground">
        <span className="min-w-0 truncate">
          Picked <span className="text-foreground">{picked}</span> ·{" "}
          {formatToken(bet.amount, TOKEN_DECIMALS)} {TOKEN_SYMBOL}
        </span>
        {bet.status === "WON" && (
          <span className="shrink-0 text-sm font-semibold tabular-nums text-foreground">
            +{formatToken(bet.payout, TOKEN_DECIMALS)}
          </span>
        )}
        {bet.status === "CLAIMED" && (
          <span className="shrink-0 tabular-nums">
            +{formatToken(bet.payout, TOKEN_DECIMALS)}
          </span>
        )}
        {bet.status === "LOST" && (
          <span className="shrink-0 tabular-nums">
            −{formatToken(bet.amount, TOKEN_DECIMALS)}
          </span>
        )}
        {bet.status === "VOID" && !bet.claimable && (
          <span className="shrink-0">Refunded</span>
        )}
      </div>
      {bet.claimable && (
        <div className="mt-1 flex justify-end">
          <ClaimButton onchainPoolId={bet.onchainPoolId} />
        </div>
      )}
    </li>
  );
}
