import { prisma } from "./prisma";
import { MatchStatus, PoolStatus } from "@/generated/prisma/client";
import {
  FootballService,
  isFinished,
  isVoided,
  type NormalisedFixture,
} from "@/services/football.service";
import { resolvePool } from "./market";
import { OUTCOME_CODE, outcomeFromScore } from "./onchain";

/**
 * Ingestion + settlement sync.
 *
 *  - `syncFixtures`          pulls fixtures for a date/league/season and upserts
 *                            each `Match`. Pools are **not** created here —
 *                            an admin opens them explicitly (Phase 6).
 *  - `settleFinishedMatches` finds pools still OPEN/LOCKED whose kickoff has
 *                            passed, refreshes the fixture, and calls the
 *                            operator key to `resolve()` on-chain. The indexer
 *                            mirrors the resulting events back into Postgres.
 *
 * The provider is injected as a `FootballService`, so these functions are
 * provider-agnostic and easy to test with a fake.
 */

/**
 * Max unresolved matches refreshed per run.
 *
 * Settlement has no lower time bound: any past match whose pool is still
 * OPEN/LOCKED is a candidate, so a pool missed during cron downtime (or one
 * whose result arrived late) is picked up on a later run instead of being
 * skipped forever. This cap only bounds provider load; resolved pools drop out
 * of the candidate set on their own.
 */
const SETTLE_MAX_CANDIDATES = 100;

function toMatchStatus(s: NormalisedFixture["status"]): MatchStatus {
  return MatchStatus[s];
}

/** Strip the "provider:" namespace to get the provider's own fixture id. */
function providerFixtureId(externalId: string): string {
  const i = externalId.indexOf(":");
  return i === -1 ? externalId : externalId.slice(i + 1);
}

export interface SyncFixturesResult {
  provider: string;
  fetched: number;
  upserted: number;
}

/** Pull fixtures for one date/league/season and upsert the matches. */
export async function syncFixtures(
  service: FootballService,
  opts: {
    date: string; // YYYY-MM-DD
    league: number | string;
    season: number;
  },
): Promise<SyncFixturesResult> {
  const fixtures = await service.getFixturesByDate(opts);
  let upserted = 0;
  for (const fx of fixtures) {
    await prisma.match.upsert({
      where: { externalId: fx.externalId },
      create: {
        externalId: fx.externalId,
        league: fx.league,
        season: fx.season,
        homeTeam: fx.homeTeam,
        awayTeam: fx.awayTeam,
        homeTeamLogo: fx.homeTeamLogo,
        awayTeamLogo: fx.awayTeamLogo,
        kickoffAt: fx.kickoffAt,
        status: toMatchStatus(fx.status),
        homeScore: fx.homeScore,
        awayScore: fx.awayScore,
      },
      update: {
        status: toMatchStatus(fx.status),
        kickoffAt: fx.kickoffAt,
        homeScore: fx.homeScore,
        awayScore: fx.awayScore,
      },
    });
    upserted++;
  }
  return {
    provider: service.providerId,
    fetched: fixtures.length,
    upserted,
  };
}

export interface SettleResult {
  provider: string;
  checked: number;
  settled: number;
  voided: number;
  stillPending: number;
}

/**
 * Refresh just-kicked-off matches and resolve their on-chain pools.
 *
 * Only matches whose `externalId` belongs to the active provider are refreshed
 * (their namespace matches), so mixing providers over time stays safe.
 */
export async function settleFinishedMatches(
  service: FootballService,
  now: Date = new Date(),
): Promise<SettleResult> {
  const candidates = await prisma.match.findMany({
    where: {
      kickoffAt: { lte: now },
      externalId: { startsWith: `${service.providerId}:` },
      pools: { some: { status: { in: [PoolStatus.OPEN, PoolStatus.LOCKED] } } },
    },
    // Recent first so live settlement is never starved by an old stuck pool.
    orderBy: { kickoffAt: "desc" },
    take: SETTLE_MAX_CANDIDATES,
    select: {
      externalId: true,
      pools: {
        where: { status: { in: [PoolStatus.OPEN, PoolStatus.LOCKED] } },
        select: { id: true, onchainPoolId: true },
      },
    },
  });

  if (candidates.length === 0) {
    return {
      provider: service.providerId,
      checked: 0,
      settled: 0,
      voided: 0,
      stillPending: 0,
    };
  }

  const fresh = await service.getFixturesByIds(
    candidates.map((c) => providerFixtureId(c.externalId)),
  );
  const byId = new Map(fresh.map((f) => [f.externalId, f]));

  let settled = 0;
  let voided = 0;
  let stillPending = 0;

  for (const candidate of candidates) {
    const fx = byId.get(candidate.externalId);
    if (!fx) {
      stillPending++;
      continue;
    }

    if (isVoided(fx.status)) {
      await prisma.match.update({
        where: { externalId: fx.externalId },
        data: { status: toMatchStatus(fx.status), settledAt: now },
      });
      for (const pool of candidate.pools) {
        try {
          await resolvePool(
            pool.onchainPoolId as `0x${string}`,
            OUTCOME_CODE.VOID,
          );
          voided++;
        } catch (err) {
          console.error(`Failed to void pool ${pool.id}:`, err);
          stillPending++;
        }
      }
      continue;
    }

    if (isFinished(fx.status)) {
      const outcome = outcomeFromScore(fx.homeScore, fx.awayScore);
      await prisma.match.update({
        where: { externalId: fx.externalId },
        data: {
          status: MatchStatus.FINISHED,
          homeScore: fx.homeScore,
          awayScore: fx.awayScore,
          settledAt: now,
        },
      });
      for (const pool of candidate.pools) {
        try {
          await resolvePool(pool.onchainPoolId as `0x${string}`, outcome);
          settled++;
        } catch (err) {
          console.error(`Failed to resolve pool ${pool.id}:`, err);
          stillPending++;
        }
      }
      continue;
    }

    // Still live / not final yet — persist status, leave pools for next run.
    await prisma.match.update({
      where: { externalId: fx.externalId },
      data: { status: toMatchStatus(fx.status) },
    });
    stillPending++;
  }

  return {
    provider: service.providerId,
    checked: candidates.length,
    settled,
    voided,
    stillPending,
  };
}
