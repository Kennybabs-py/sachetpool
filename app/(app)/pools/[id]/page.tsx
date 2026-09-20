import Link from "next/link";
import { notFound } from "next/navigation";
import { getPoolDetailData } from "@/lib/pools";
import { PoolCard } from "@/components/pools/pool-card";
import { formatToken } from "@/lib/format";
import { TOKEN_DECIMALS, TOKEN_SYMBOL } from "@/config/chains";

export const dynamic = "force-dynamic";

/** Pool detail: fixture, live odds, and the bet sheet. */
export default async function PoolDetailPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const { pool, serverNowMs } = await getPoolDetailData(id);
  if (!pool) notFound();

  const resolved = pool.status === "RESOLVED" || pool.status === "VOID";

  return (
    <div className="flex flex-col gap-4">
      <Link
        href="/"
        className="text-xs text-muted-foreground transition-colors hover:text-foreground"
      >
        ← Board
      </Link>

      <PoolCard pool={pool} serverNowMs={serverNowMs} />

      {resolved && (
        <div className="rounded-2xl border border-border bg-card p-4 text-sm">
          <p className="font-medium">
            {pool.status === "VOID"
              ? "Void — all stakes refunded"
              : `Result: ${
                  pool.winningSelection === "HOME"
                    ? pool.homeTeam
                    : pool.winningSelection === "AWAY"
                      ? pool.awayTeam
                      : "Draw"
                }`}
          </p>
          {(pool.homeScore !== null || pool.awayScore !== null) && (
            <p className="mt-1 text-muted-foreground tabular-nums">
              {pool.homeTeam} {pool.homeScore ?? "–"} – {pool.awayScore ?? "–"}{" "}
              {pool.awayTeam}
            </p>
          )}
          <p className="mt-1 text-xs text-muted-foreground tabular-nums">
            Final pot {formatToken(pool.totalStake, TOKEN_DECIMALS)}{" "}
            {TOKEN_SYMBOL}. Winners claim from My bets.
          </p>
        </div>
      )}
    </div>
  );
}
