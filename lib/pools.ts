import "server-only";
import { prisma } from "./prisma";
import { PoolStatus, Selection } from "@/generated/prisma/client";
import { impliedMultiple } from "./odds";

/**
 * Server-side read layer for the board and pool detail.
 *
 * Reads the Postgres mirror (filled by the indexer) and folds the per-selection
 * stake split into display odds. Every `BigInt` is serialised to a string here
 * so RSC payloads can cross the server/client boundary.
 *
 * `LOCKED` is derived from `closesAt` at read time — no cron flips it.
 */

export { PoolStatus, Selection };

function effectiveStatus(
  status: PoolStatus,
  closesAt: Date,
  now: Date = new Date(),
): PoolStatus {
  if (status === PoolStatus.OPEN && closesAt.getTime() <= now.getTime()) {
    return PoolStatus.LOCKED;
  }
  return status;
}

export interface PoolView {
  poolId: string;
  matchId: string;
  onchainPoolId: string;
  league: string;
  homeTeam: string;
  awayTeam: string;
  homeTeamLogo: string | null;
  awayTeamLogo: string | null;
  kickoffAt: Date;
  closesAt: Date;
  status: PoolStatus;
  rakeBps: number;
  totalStake: string;
  stakeBySelection: Record<Selection, string>;
  oddsBySelection: Record<Selection, number | null>;
  winningSelection: Selection | null;
  homeScore: number | null;
  awayScore: number | null;
  createTxHash: string | null;
  resolvedTxHash: string | null;
}

type PoolRow = {
  id: string;
  matchId: string;
  onchainPoolId: string;
  status: PoolStatus;
  rakeBps: number;
  closesAt: Date;
  totalStake: bigint;
  stakeHome: bigint;
  stakeDraw: bigint;
  stakeAway: bigint;
  winningSelection: Selection | null;
  createTxHash: string | null;
  resolvedTxHash: string | null;
  match: {
    league: string;
    homeTeam: string;
    awayTeam: string;
    homeTeamLogo: string | null;
    awayTeamLogo: string | null;
    kickoffAt: Date;
    homeScore: number | null;
    awayScore: number | null;
  };
};

function toView(pool: PoolRow, now: Date = new Date()): PoolView {
  const stakes: Record<Selection, bigint> = {
    HOME: pool.stakeHome,
    DRAW: pool.stakeDraw,
    AWAY: pool.stakeAway,
  };
  return {
    poolId: pool.id,
    matchId: pool.matchId,
    onchainPoolId: pool.onchainPoolId,
    league: pool.match.league,
    homeTeam: pool.match.homeTeam,
    awayTeam: pool.match.awayTeam,
    homeTeamLogo: pool.match.homeTeamLogo,
    awayTeamLogo: pool.match.awayTeamLogo,
    kickoffAt: pool.match.kickoffAt,
    closesAt: pool.closesAt,
    status: effectiveStatus(pool.status, pool.closesAt, now),
    rakeBps: pool.rakeBps,
    totalStake: pool.totalStake.toString(),
    stakeBySelection: {
      HOME: stakes.HOME.toString(),
      DRAW: stakes.DRAW.toString(),
      AWAY: stakes.AWAY.toString(),
    },
    oddsBySelection: {
      HOME: impliedMultiple(pool.totalStake, stakes.HOME, pool.rakeBps),
      DRAW: impliedMultiple(pool.totalStake, stakes.DRAW, pool.rakeBps),
      AWAY: impliedMultiple(pool.totalStake, stakes.AWAY, pool.rakeBps),
    },
    winningSelection: pool.winningSelection,
    homeScore: pool.match.homeScore,
    awayScore: pool.match.awayScore,
    createTxHash: pool.createTxHash,
    resolvedTxHash: pool.resolvedTxHash,
  };
}

/** Upcoming, bettable pools — soonest close first. */
export async function listOpenPools(
  now: Date = new Date(),
): Promise<PoolView[]> {
  const pools = await prisma.pool.findMany({
    where: {
      status: { in: [PoolStatus.OPEN, PoolStatus.LOCKED] },
      closesAt: { gt: now },
    },
    orderBy: { closesAt: "asc" },
    include: { match: true },
    take: 100,
  });
  return pools.map((p) => toView(p, now));
}

/** One pool with its match, or `null`. */
export async function getPoolDetail(
  poolId: string,
  now: Date = new Date(),
): Promise<PoolView | null> {
  const pool = await prisma.pool.findUnique({
    where: { id: poolId },
    include: { match: true },
  });
  return pool ? toView(pool, now) : null;
}

/**
 * The board snapshot: open pools plus the single clock reading used to filter
 * them. Returning the timestamp keeps the countdown consistent with the
 * open/locked filter and keeps the RSC body free of wall-clock reads.
 */
export interface BoardData {
  serverNowMs: number;
  pools: PoolView[];
}

export async function getBoard(now: Date = new Date()): Promise<BoardData> {
  const pools = await listOpenPools(now);
  return { serverNowMs: now.getTime(), pools };
}

/** A pool-detail snapshot with the same clock reading used to render it. */
export interface PoolDetailData {
  serverNowMs: number;
  pool: PoolView | null;
}

export async function getPoolDetailData(
  poolId: string,
  now: Date = new Date(),
): Promise<PoolDetailData> {
  const pool = await getPoolDetail(poolId, now);
  return { serverNowMs: now.getTime(), pool };
}

/** The match behind a pool, for the detail header. */
export async function getPoolMatch(poolId: string) {
  return prisma.pool.findUnique({
    where: { id: poolId },
    select: {
      match: {
        select: {
          homeTeam: true,
          awayTeam: true,
          homeTeamLogo: true,
          awayTeamLogo: true,
          league: true,
          kickoffAt: true,
        },
      },
    },
  });
}

// ── Admin reads ─────────────────────────────────────────────────────────────

export interface MatchCandidate {
  id: string;
  externalId: string;
  league: string;
  homeTeam: string;
  awayTeam: string;
  kickoffAt: Date;
}

/** Scheduled matches with no pool yet — openable from the admin dashboard. */
export async function listPoolCandidates(): Promise<MatchCandidate[]> {
  return prisma.match.findMany({
    where: {
      kickoffAt: { gt: new Date() },
      status: "SCHEDULED",
      pools: { none: {} },
    },
    orderBy: { kickoffAt: "asc" },
    select: {
      id: true,
      externalId: true,
      league: true,
      homeTeam: true,
      awayTeam: true,
      kickoffAt: true,
    },
    take: 100,
  });
}

export interface AdminPool {
  poolId: string;
  onchainPoolId: string;
  status: PoolStatus;
  rakeBps: number;
  closesAt: Date;
  homeTeam: string;
  awayTeam: string;
  league: string;
  totalStake: string;
  isExpired: boolean;
}

/** Pools that are on-chain and awaiting resolution — the admin work queue. */
export async function listAdminPools(
  now: Date = new Date(),
): Promise<AdminPool[]> {
  const pools = await prisma.pool.findMany({
    where: {
      status: {
        in: [PoolStatus.PENDING_ONCHAIN, PoolStatus.OPEN, PoolStatus.LOCKED],
      },
    },
    orderBy: { closesAt: "asc" },
    include: { match: true },
    take: 200,
  });

  return pools.map((p) => ({
    poolId: p.id,
    onchainPoolId: p.onchainPoolId,
    status: effectiveStatus(p.status, p.closesAt, now),
    rakeBps: p.rakeBps,
    closesAt: p.closesAt,
    homeTeam: p.match.homeTeam,
    awayTeam: p.match.awayTeam,
    league: p.match.league,
    totalStake: p.totalStake.toString(),
    isExpired: p.closesAt.getTime() <= now.getTime(),
  }));
}
