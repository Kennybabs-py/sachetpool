import "server-only";

/**
 * Shared guard for internal sync/cron endpoints.
 *
 * Protects write-heavy, quota-consuming routes (API-Football calls, pool
 * settlement) so only a trusted caller — your scheduler, or you with the
 * secret — can trigger them. Set CRON_SECRET in the environment.
 *
 * Accepts either:
 *   - `Authorization: Bearer <CRON_SECRET>`  (Vercel Cron sends this)
 *   - `?secret=<CRON_SECRET>`                (convenient for manual curl)
 */
export function assertCronAuthorized(req: Request): Response | null {
  const secret = process.env.CRON_SECRET;

  if (!secret) {
    return Response.json(
      { error: "CRON_SECRET is not configured on the server" },
      { status: 500 },
    );
  }

  const auth = req.headers.get("authorization");
  const bearer = auth?.startsWith("Bearer ") ? auth.slice(7) : null;
  const fromQuery = new URL(req.url).searchParams.get("secret");
  const provided = bearer ?? fromQuery;

  if (provided !== secret) {
    return Response.json({ error: "Unauthorized" }, { status: 401 });
  }
  return null;
}
