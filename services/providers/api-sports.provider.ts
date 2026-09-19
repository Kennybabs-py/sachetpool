import {
  type FixtureQuery,
  type FixtureStatus,
  type FootballProvider,
  type NormalisedFixture,
  FootballApiError,
  makeExternalId,
} from "./football-provider";

/**
 * api-sports.io (API-Football v3) provider.
 *
 * Direct host, auth via the `x-apisports-key` header. Ported verbatim from the
 * original lib/football.ts so no behaviour is lost — now behind the shared
 * contract and taking its key by constructor.
 *
 * Docs: https://www.api-football.com/documentation-v3
 */

const BASE_URL = "https://v3.football.api-sports.io";

interface ApiEnvelope<T> {
  get: string;
  errors: unknown; // [] on success, or an object/array on quota/param problems
  results: number;
  paging: { current: number; total: number };
  response: T;
}

interface RawFixture {
  fixture: {
    id: number;
    date: string;
    status: { short: string; long: string };
  };
  league: { id: number; name: string; season: number };
  teams: {
    home: { id: number; name: string; logo: string | null };
    away: { id: number; name: string; logo: string | null };
  };
  goals: { home: number | null; away: number | null };
}

// api-sports status short codes -> our FixtureStatus.
const STATUS_MAP: Record<string, FixtureStatus> = {
  TBD: "SCHEDULED",
  NS: "SCHEDULED",
  "1H": "LIVE",
  HT: "LIVE",
  "2H": "LIVE",
  ET: "LIVE",
  BT: "LIVE",
  P: "LIVE",
  LIVE: "LIVE",
  INT: "LIVE",
  FT: "FINISHED",
  AET: "FINISHED",
  PEN: "FINISHED",
  PST: "POSTPONED",
  SUSP: "POSTPONED",
  CANC: "CANCELLED",
  ABD: "CANCELLED",
  AWD: "FINISHED",
  WO: "FINISHED",
};

export class ApiSportsProvider implements FootballProvider {
  readonly id = "api-sports" as const;

  constructor(private readonly apiKey: string) {
    if (!apiKey) {
      throw new FootballApiError("api-sports: missing API key", this.id);
    }
  }

  private async get<T>(
    path: string,
    params: Record<string, string | number>,
  ): Promise<T> {
    const url = new URL(`${BASE_URL}${path}`);
    for (const [k, v] of Object.entries(params)) {
      url.searchParams.set(k, String(v));
    }

    const res = await fetch(url, {
      headers: { "x-apisports-key": this.apiKey },
      cache: "no-store",
    });

    if (!res.ok) {
      throw new FootballApiError(
        `api-sports ${path} returned ${res.status}`,
        this.id,
        res.status,
      );
    }

    const body = (await res.json()) as ApiEnvelope<T>;

    // v3 returns HTTP 200 with a populated `errors` field on quota/param issues.
    const hasErrors =
      body.errors &&
      (Array.isArray(body.errors)
        ? body.errors.length > 0
        : Object.keys(body.errors as object).length > 0);
    if (hasErrors) {
      throw new FootballApiError(
        `api-sports ${path} returned errors`,
        this.id,
        res.status,
        body.errors,
      );
    }

    return body.response;
  }

  private normalise(raw: RawFixture): NormalisedFixture {
    const providerFixtureId = String(raw.fixture.id);
    return {
      externalId: makeExternalId(this.id, providerFixtureId),
      providerFixtureId,
      league: raw.league.name,
      season: raw.league.season,
      homeTeam: raw.teams.home.name,
      awayTeam: raw.teams.away.name,
      homeTeamLogo: raw.teams.home.logo,
      awayTeamLogo: raw.teams.away.logo,
      kickoffAt: new Date(raw.fixture.date),
      status: STATUS_MAP[raw.fixture.status.short] ?? "SCHEDULED",
      homeScore: raw.goals.home,
      awayScore: raw.goals.away,
    };
  }

  async getFixturesByDate(query: FixtureQuery): Promise<NormalisedFixture[]> {
    const raw = await this.get<RawFixture[]>("/fixtures", {
      date: query.date,
      league: query.league,
      season: query.season,
    });
    return raw.map((r) => this.normalise(r));
  }

  async getFixturesByIds(ids: string[]): Promise<NormalisedFixture[]> {
    if (ids.length === 0) return [];
    // api-sports accepts up to 20 dash-joined ids.
    const raw = await this.get<RawFixture[]>("/fixtures", {
      ids: ids.join("-"),
    });
    return raw.map((r) => this.normalise(r));
  }
}
