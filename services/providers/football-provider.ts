/**
 * Shared contract every football data provider implements.
 *
 * Providers (api-sports.io, football-data.org, …) differ in host, auth header,
 * response shape and status vocabulary — but they all return the SAME
 * `NormalisedFixture` so the rest of the app never knows which one is active.
 *
 * Add a new provider by implementing `FootballProvider` and registering it in
 * services/football.service.ts.
 */

export type ProviderId = "api-sports" | "football-data";

export type FixtureStatus =
  | "SCHEDULED"
  | "LIVE"
  | "FINISHED"
  | "POSTPONED"
  | "CANCELLED";

/** Normalised fixture — the single shape the whole app consumes. */
export interface NormalisedFixture {
  /**
   * Globally-unique id, namespaced by provider (e.g. "api-sports:868923").
   * Namespacing prevents id collisions if you switch/blend providers, since
   * each provider numbers fixtures independently.
   */
  externalId: string;
  /** Raw provider fixture id, un-namespaced (useful for batched refresh). */
  providerFixtureId: string;
  league: string;
  season: number;
  homeTeam: string;
  awayTeam: string;
  homeTeamLogo: string | null;
  awayTeamLogo: string | null;
  kickoffAt: Date;
  status: FixtureStatus;
  homeScore: number | null;
  awayScore: number | null;
}

/** Query for fetching a day's fixtures. `league`/`season` are provider codes. */
export interface FixtureQuery {
  date: string; // YYYY-MM-DD
  league: number | string;
  season: number;
}

export interface FootballProvider {
  readonly id: ProviderId;
  /** Fixtures for one league/season on a date. */
  getFixturesByDate(query: FixtureQuery): Promise<NormalisedFixture[]>;
  /**
   * Refresh specific fixtures by their un-namespaced provider ids.
   * Used by the settlement sweep.
   */
  getFixturesByIds(providerFixtureIds: string[]): Promise<NormalisedFixture[]>;
}

export class FootballApiError extends Error {
  constructor(
    message: string,
    readonly provider: ProviderId,
    readonly status?: number,
    readonly details?: unknown,
  ) {
    super(message);
    this.name = "FootballApiError";
  }
}

/** Terminal state — safe to settle. */
export function isFinished(status: FixtureStatus): boolean {
  return status === "FINISHED";
}

/** States that should void a pool (full refund). */
export function isVoided(status: FixtureStatus): boolean {
  return status === "POSTPONED" || status === "CANCELLED";
}

/** Build the namespaced external id stored on Match.externalId. */
export function makeExternalId(
  provider: ProviderId,
  providerFixtureId: string | number,
): string {
  return `${provider}:${providerFixtureId}`;
}
