import { assertCronAuthorized } from "@/lib/cron-auth";
import { settleFinishedMatches } from "@/lib/football-sync";
import {
  FootballService,
  FootballApiError,
  type ProviderId,
} from "@/services/football.service";

/**
 * POST|GET /api/cron/settle — refresh recently-kicked-off matches from the API
 * and settle (or void) their pools. Protected by CRON_SECRET.
 *
 * Idempotent: pools already SETTLED/VOID are skipped, so it's safe to run on a
 * frequent schedule (e.g. every 10 minutes). GET is allowed so Vercel Cron
 * (which issues GET) can invoke it.
 *
 * Provider comes from env (FOOTBALL_PROVIDER), or `?provider=` for manual runs.
 * Only matches ingested by the active provider are settled in a given run.
 */
async function handle(req: Request) {
  const denied = assertCronAuthorized(req);
  if (denied) return denied;

  const provider = new URL(req.url).searchParams.get("provider") as
    | ProviderId
    | null;

  try {
    const service = provider
      ? new FootballService(provider)
      : FootballService.fromEnv();
    const result = await settleFinishedMatches(service);
    return Response.json({ ok: true, ...result });
  } catch (err) {
    if (err instanceof FootballApiError) {
      return Response.json(
        { error: err.message, provider: err.provider, details: err.details },
        { status: 502 },
      );
    }
    if (err instanceof Error && err.message.startsWith("FootballService:")) {
      return Response.json({ error: err.message }, { status: 400 });
    }
    throw err;
  }
}

export const POST = handle;
export const GET = handle;
