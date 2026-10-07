import { getBoard } from "@/lib/pools";
import { PoolCard } from "@/components/pools/pool-card";
import GetSach from "@/components/common/get-sach";

export const dynamic = "force-dynamic";

/** The betting board: upcoming pools grouped by competition, soonest close first. */
export default async function BoardPage() {
  const { pools, serverNowMs } = await getBoard();

  // Group by league, preserving the soonest-close-first order within each.
  const groups = new Map<string, typeof pools>();
  for (const pool of pools) {
    const list = groups.get(pool.league);
    if (list) list.push(pool);
    else groups.set(pool.league, [pool]);
  }

  return (
    <div className="flex flex-col gap-4">
      <div>
        <h1 className="text-xl font-semibold tracking-tight">Open pools</h1>
        <p className="text-sm text-muted-foreground">
          Stake $SACH on the match result. Winners split the pot.
        </p>

        <GetSach />
      </div>

      {pools.length === 0 ? (
        <p className="rounded-2xl border border-dashed border-border p-8 text-center text-sm text-muted-foreground">
          No pools are open right now. Check back soon.
        </p>
      ) : (
        <div className="flex flex-col gap-8">
          {[...groups.entries()].map(([league, leaguePools]) => (
            <section key={league} className="flex flex-col gap-3">
              <div className="flex items-center gap-3">
                <h2 className="text-sm font-semibold tracking-tight text-foreground">
                  {league}
                </h2>
                <span className="rounded-full bg-muted px-2 py-0.5 text-[11px] font-medium text-muted-foreground tabular-nums">
                  {leaguePools.length}
                </span>
                <span aria-hidden className="h-px flex-1 bg-border" />
              </div>

              <div className="grid gap-4 sm:grid-cols-2">
                {leaguePools.map((pool) => (
                  <PoolCard
                    key={pool.poolId}
                    pool={pool}
                    serverNowMs={serverNowMs}
                  />
                ))}
              </div>
            </section>
          ))}
        </div>
      )}
    </div>
  );
}
