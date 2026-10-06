import { assertCronAuthorized } from "@/lib/cron-auth";
import { syncFixtures } from "@/lib/football-sync";
import { logPostHog } from "@/lib/posthog-logs";
import {
  FootballService,
  FootballApiError,
  type ProviderId,
} from "@/services/football.service";

/**
 * POST /api/sync/fixtures — pull fixtures for a date/league/season and upsert
 * matches + pools. Protected by CRON_SECRET.
 *
 * Body (JSON): {
 *   date?: "YYYY-MM-DD",           // defaults to today (UTC)
 *   league: number | string,       // provider league id / competition code
 *   season: number,
 *   provider?: "api-sports" | "football-data"  // defaults to env
 * }
 *
 * football-data uses competition codes (e.g. "PL"); api-sports uses numeric
 * league ids (e.g. 39).
 */
export async function POST(req: Request) {
  const denied = assertCronAuthorized(req);
  if (denied) return denied;

  let body: {
    date?: string;
    league?: number | string;
    season?: number;
    provider?: ProviderId;
  };
  try {
    body = await req.json();
  } catch {
    return Response.json({ error: "Invalid JSON body" }, { status: 400 });
  }

  const date = body.date ?? new Date().toISOString().slice(0, 10);
  const { league, season, provider } = body;

  if (league === undefined || league === null || league === "") {
    return Response.json({ error: "`league` is required" }, { status: 400 });
  }
  if (typeof season !== "number") {
    return Response.json(
      { error: "`season` is required (number)" },
      { status: 400 },
    );
  }
  if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) {
    return Response.json(
      { error: "`date` must be YYYY-MM-DD" },
      { status: 400 },
    );
  }

  try {
    const service = provider
      ? new FootballService(provider)
      : FootballService.fromEnv();
    const result = await syncFixtures(service, { date, league, season });
    await logPostHog("fixture_sync_completed", {
      provider: result.provider,
      fetched: result.fetched,
      upserted: result.upserted,
    });
    return Response.json({ ok: true, date, league, season, ...result });
  } catch (err) {
    if (err instanceof FootballApiError) {
      return Response.json(
        { error: err.message, provider: err.provider, details: err.details },
        { status: 502 },
      );
    }
    // Config errors (missing key / unknown provider) -> 400.
    if (err instanceof Error && err.message.startsWith("FootballService:")) {
      return Response.json({ error: err.message }, { status: 400 });
    }
    throw err;
  }
}
