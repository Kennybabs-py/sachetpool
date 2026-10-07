import { assertCronAuthorized } from "@/lib/cron-auth";
import { runIndexer } from "@/lib/indexer";

/**
 * POST|GET /api/cron/index — mirror newly-finalized `SachetMarket` events into
 * Postgres for the board, history, and leaderboard. Protected by CRON_SECRET.
 *
 * Safe to run every 1–2 minutes: a no-op when there is nothing new, and
 * idempotent when replayed. GET is allowed so Vercel Cron can invoke it.
 */
async function handle(req: Request) {
  const denied = assertCronAuthorized(req);
  if (denied) return denied;

  try {
    const result = await runIndexer();
    return Response.json({ ok: true, ...result });
  } catch (err) {
    const message = err instanceof Error ? err.message : "Indexer failed";
    return Response.json({ error: message }, { status: 500 });
  }
}

// A run drains a bounded block budget; give it room above the platform default
// so a backlog catches up faster. Clamped by the host if the plan caps lower.
export const maxDuration = 60;

export const POST = handle;
export const GET = handle;
