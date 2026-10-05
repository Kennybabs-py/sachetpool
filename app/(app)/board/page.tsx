import { getBoard } from "@/lib/pools";
import { PoolCard } from "@/components/pools/pool-card";
import { MinStake } from "@/components/pools/min-stake";

export const dynamic = "force-dynamic";

/** The betting board: upcoming pools, soonest close first. */
export default async function BoardPage() {
  const { pools, serverNowMs } = await getBoard();

  return (
    <div className="flex flex-col gap-4">
      <div>
        <h1 className="text-xl font-semibold tracking-tight">Open pools</h1>
        <p className="text-sm text-muted-foreground">
          Stake $SACH on the match result. Winners split the pot.
        </p>
        <MinStake className="mt-1" />
      </div>

      {pools.length === 0 ? (
        <p className="rounded-2xl border border-dashed border-border p-8 text-center text-sm text-muted-foreground">
          No pools are open right now. Check back soon.
        </p>
      ) : (
        <div className="grid gap-4 sm:grid-cols-2">
          {pools.map((pool) => (
            <PoolCard key={pool.poolId} pool={pool} serverNowMs={serverNowMs} />
          ))}
        </div>
      )}
    </div>
  );
}
