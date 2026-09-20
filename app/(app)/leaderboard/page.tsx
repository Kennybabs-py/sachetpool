import { getSessionUser } from "@/lib/session";
import {
  getLeaderboard,
  getUserStanding,
  MIN_SETTLED_BETS,
} from "@/lib/leaderboard";
import { formatToken, shortAddress } from "@/lib/format";
import { TOKEN_DECIMALS, TOKEN_SYMBOL } from "@/config/chains";
import { cn } from "@/lib/utils";

export const dynamic = "force-dynamic";

function pct(bps: number): string {
  return `${(bps / 100).toFixed(2)}%`;
}

/** Accuracy leaderboard over mirrored settled bets. */
export default async function LeaderboardPage() {
  const user = await getSessionUser();
  const [board, standing] = await Promise.all([
    getLeaderboard(),
    user ? getUserStanding(user.address) : Promise.resolve(null),
  ]);

  return (
    <div className="flex flex-col gap-4">
      <div>
        <h1 className="text-xl font-semibold tracking-tight">Leaderboard</h1>
        <p className="text-sm text-muted-foreground">
          Ranked by prediction accuracy. At least {MIN_SETTLED_BETS} settled bets
          to qualify.
        </p>
      </div>

      {standing && (
        <div className="rounded-2xl border border-border bg-card p-4 text-sm">
          <p className="font-medium">Your standing</p>
          <p className="mt-1 text-muted-foreground tabular-nums">
            {standing.won}/{standing.settled} correct · {pct(standing.accuracyBps)}{" "}
            · net {formatToken(standing.netProfit, TOKEN_DECIMALS)}{" "}
            {TOKEN_SYMBOL}
            {!standing.qualified &&
              ` · ${Math.max(0, MIN_SETTLED_BETS - standing.settled)} more to qualify`}
          </p>
        </div>
      )}

      {board.length === 0 ? (
        <p className="rounded-2xl border border-dashed border-border p-8 text-center text-sm text-muted-foreground">
          No qualifying players yet.
        </p>
      ) : (
        <div className="overflow-hidden rounded-2xl border border-border">
          <table className="w-full text-sm">
            <thead className="bg-muted/50 text-xs text-muted-foreground">
              <tr>
                <th className="px-4 py-2 text-left font-medium">#</th>
                <th className="px-4 py-2 text-left font-medium">Player</th>
                <th className="px-4 py-2 text-right font-medium">Accuracy</th>
                <th className="px-4 py-2 text-right font-medium">Settled</th>
                <th className="px-4 py-2 text-right font-medium">Net</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-border">
              {board.map((entry) => {
                const isViewer =
                  user?.address.toLowerCase() === entry.address.toLowerCase();
                return (
                  <tr key={entry.userId} className={cn(isViewer && "bg-primary/5")}>
                    <td className="px-4 py-2 tabular-nums">{entry.rank}</td>
                    <td className="px-4 py-2 font-medium">
                      {shortAddress(entry.address)}
                    </td>
                    <td className="px-4 py-2 text-right tabular-nums">
                      {pct(entry.accuracyBps)}
                    </td>
                    <td className="px-4 py-2 text-right tabular-nums">
                      {entry.settled}
                    </td>
                    <td className="px-4 py-2 text-right tabular-nums">
                      {formatToken(entry.netProfit, TOKEN_DECIMALS)}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
