import "server-only";
import {
  type FixtureQuery,
  type FootballProvider,
  type NormalisedFixture,
  type ProviderId,
} from "./providers/football-provider";
import { ApiSportsProvider } from "./providers/api-sports.provider";
import { FootballDataProvider } from "./providers/football-data.provider";

/**
 * FootballService — polymorphic entry point for football data.
 *
 * Construct it with a provider type; it picks that provider's key from the
 * key registry and instantiates the matching implementation. Every provider
 * returns the same `NormalisedFixture`, so callers are provider-agnostic.
 *
 *   const svc = new FootballService("football-data");   // free-tier friendly
 *   const svc = new FootballService("api-sports");       // once you upgrade
 *   const svc = FootballService.fromEnv();               // default from env
 *
 * Add a provider:
 *   1. implement FootballProvider in providers/<name>.provider.ts
 *   2. add its id to ProviderId (football-provider.ts)
 *   3. add a keyReg entry + a factories entry below
 */

/** Env var holding each provider's API key. */
const KEY_ENV: Record<ProviderId, string> = {
  "api-sports": "API_FOOTBALL_API_KEY",
  "football-data": "FOOTBALL_DATA_API_KEY",
};

/** How to build each provider from its key. */
const FACTORIES: Record<ProviderId, (key: string) => FootballProvider> = {
  "api-sports": (key) => new ApiSportsProvider(key),
  "football-data": (key) => new FootballDataProvider(key),
};

export class FootballService {
  private readonly provider: FootballProvider;

  constructor(providerId: ProviderId, keyRegistry: Record<string, string> = process.env as Record<string, string>) {
    const envVar = KEY_ENV[providerId];
    const key = keyRegistry[envVar];
    if (!key) {
      throw new Error(
        `FootballService: no API key for "${providerId}" (expected env ${envVar})`,
      );
    }
    this.provider = FACTORIES[providerId](key);
  }

  /** Which provider is active. */
  get providerId(): ProviderId {
    return this.provider.id;
  }

  /**
   * Build from env: FOOTBALL_PROVIDER selects the active provider,
   * defaulting to football-data (free-tier reaches current seasons).
   */
  static fromEnv(): FootballService {
    const id = (process.env.FOOTBALL_PROVIDER as ProviderId) ?? "football-data";
    return new FootballService(id);
  }

  getFixturesByDate(query: FixtureQuery): Promise<NormalisedFixture[]> {
    return this.provider.getFixturesByDate(query);
  }

  getFixturesByIds(providerFixtureIds: string[]): Promise<NormalisedFixture[]> {
    return this.provider.getFixturesByIds(providerFixtureIds);
  }
}

// Re-export the shared vocabulary so callers import everything from the service.
export {
  type NormalisedFixture,
  type FixtureQuery,
  type ProviderId,
  FootballApiError,
  isFinished,
  isVoided,
} from "./providers/football-provider";
