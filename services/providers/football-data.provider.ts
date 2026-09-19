import {
  type FixtureQuery,
  type FixtureStatus,
  type FootballProvider,
  type NormalisedFixture,
  FootballApiError,
  makeExternalId,
} from "./football-provider";

/**
 * football-data.org (v4) provider.
 *
 * Free tier reaches current seasons for the major competitions, which is why
 * we add it alongside api-sports. Auth via the `X-Auth-Token` header.
 *
 * Its model differs from api-sports:
 *  - fixtures are "matches"; leagues are "competitions" keyed by code (e.g.
 *    "PL", "CL", "BL1"), so `FixtureQuery.league` may be a string code here.
 *  - a single date is queried as dateFrom == dateTo.
 *  - refresh uses the bulk "/matches?ids=" filter (one request per ~20 ids).
 *
 * Docs: https://www.football-data.org/documentation/quickstart
 */

const BASE_URL = "https://api.football-data.org/v4";

// football-data status -> our FixtureStatus.
const STATUS_MAP: Record<string, FixtureStatus> = {
  SCHEDULED: "SCHEDULED",
  TIMED: "SCHEDULED",
  IN_PLAY: "LIVE",
  PAUSED: "LIVE",
  FINISHED: "FINISHED",
  SUSPENDED: "POSTPONED",
  POSTPONED: "POSTPONED",
  CANCELLED: "CANCELLED",
  AWARDED: "FINISHED",
};

interface RawMatch {
  id: number;
  utcDate: string;
  status: string;
  // Competition-scoped responses carry competition/season at the top level;
  // the generic /matches response repeats them per match. Treat as optional so
  // a missing block degrades gracefully instead of throwing.
  season?: { startDate?: string };
  competition?: { name?: string };
  homeTeam?: { name: string | null; crest: string | null };
  awayTeam?: { name: string | null; crest: string | null };
  score?: { fullTime?: { home: number | null; away: number | null } };
}

/** Split ids into fixed-size chunks so each request stays within URL/rate limits. */
function chunk<T>(items: T[], size: number): T[][] {
  const out: T[][] = [];
  for (let i = 0; i < items.length; i += size) {
    out.push(items.slice(i, i + size));
  }
  return out;
}

export class FootballDataProvider implements FootballProvider {
  readonly id = "football-data" as const;

  constructor(private readonly apiKey: string) {
    if (!apiKey) {
      throw new FootballApiError("football-data: missing API key", this.id);
    }
  }

  private async get<T>(
    path: string,
    params: Record<string, string | number> = {},
  ): Promise<T> {
    const url = new URL(`${BASE_URL}${path}`);
    for (const [k, v] of Object.entries(params)) {
      url.searchParams.set(k, String(v));
    }

    const res = await fetch(url, {
      headers: { "X-Auth-Token": this.apiKey },
      cache: "no-store",
    });

    if (!res.ok) {
      // football-data signals problems with real HTTP status codes + a JSON
      // { message, errorCode } body.
      let details: unknown;
      try {
        details = await res.json();
      } catch {
        details = undefined;
      }
      throw new FootballApiError(
        `football-data ${path} returned ${res.status}`,
        this.id,
        res.status,
        details,
      );
    }

    return (await res.json()) as T;
  }

  /**
   * football-data derives season by its start year. Falls back to the kickoff
   * year if the season block is absent or unparseable.
   */
  private seasonYear(match: RawMatch): number {
    const fromSeason = match.season?.startDate
      ? new Date(match.season.startDate).getUTCFullYear()
      : NaN;
    if (!Number.isNaN(fromSeason)) return fromSeason;
    return new Date(match.utcDate).getUTCFullYear();
  }

  private normalise(raw: RawMatch, fallbackLeague?: string): NormalisedFixture {
    const providerFixtureId = String(raw.id);
    return {
      externalId: makeExternalId(this.id, providerFixtureId),
      providerFixtureId,
      league: raw.competition?.name ?? fallbackLeague ?? "Unknown",
      season: this.seasonYear(raw),
      homeTeam: raw.homeTeam?.name ?? "TBD",
      awayTeam: raw.awayTeam?.name ?? "TBD",
      homeTeamLogo: raw.homeTeam?.crest ?? null,
      awayTeamLogo: raw.awayTeam?.crest ?? null,
      kickoffAt: new Date(raw.utcDate),
      status: STATUS_MAP[raw.status] ?? "SCHEDULED",
      homeScore: raw.score?.fullTime?.home ?? null,
      awayScore: raw.score?.fullTime?.away ?? null,
    };
  }

  async getFixturesByDate(query: FixtureQuery): Promise<NormalisedFixture[]> {
    // Competition-scoped for parity with api-sports' league filter. The
    // competition name lives at the top level here, so pass it as a fallback
    // for match objects that omit their own competition block.
    const data = await this.get<{
      competition?: { name?: string };
      matches?: RawMatch[];
    }>(`/competitions/${query.league}/matches`, {
      dateFrom: query.date,
      dateTo: query.date,
    });
    const fallbackLeague = data.competition?.name;
    return (data.matches ?? []).map((m) => this.normalise(m, fallbackLeague));
  }

  async getFixturesByIds(ids: string[]): Promise<NormalisedFixture[]> {
    if (ids.length === 0) return [];
    // Bulk "/matches?ids=" filter — one request per chunk keeps us well under
    // the free tier's 10 requests/minute cap even on a busy matchday.
    const out: NormalisedFixture[] = [];
    for (const batch of chunk(ids, 20)) {
      const { matches } = await this.get<{ matches?: RawMatch[] }>("/matches", {
        ids: batch.join(","),
      });
      out.push(...(matches ?? []).map((m) => this.normalise(m)));
    }
    return out;
  }
}
