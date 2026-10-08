import Link from "next/link";
import { notFound } from "next/navigation";
import { getPoolDetailData } from "@/lib/pools";
import { getUserPoolStake } from "@/lib/bets";
import { getSessionUser } from "@/lib/session";
import { PoolCard } from "@/components/pools/pool-card";
import { PoolReturns } from "@/components/pools/pool-returns";
import { formatToken } from "@/lib/format";
import { TOKEN_DECIMALS, TOKEN_SYMBOL } from "@/config/chains";
import { ArrowLeft } from "lucide-react";

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

  const user = await getSessionUser();
  const userStake = user
    ? await getUserPoolStake(user.address, pool.poolId)
    : null;

  return (
    <div className="flex flex-col gap-4">
      <Link
        href="/board"
        className="flex items-center justify-start gap-2 text-[1rem] text-foreground transition-colors hover:text-foreground"
      >
        <ArrowLeft /> Board
      </Link>

      <PoolCard pool={pool} serverNowMs={serverNowMs} showDetailLink={false} />

      {pool.status === "OPEN" && (
        <PoolReturns pool={pool} defaultStake={userStake} />
      )}

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
