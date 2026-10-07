import "server-only";
import { prisma } from "./prisma";
import { toBigInt } from "./amounts";
import { BetStatus } from "@/generated/prisma/client";
import {
  rankLeaderboard,
  summarizeUser,
  type LeaderboardEntry,
  type LeaderboardStatRow,
  type UserStanding,
} from "./leaderboard-core";

/**
 * Server-side read layer for the accuracy leaderboard.
 *
 * Reads the mirrored settled bets. `CLAIMED` counts as a win (the bet won but
 * has since been withdrawn); `VOID`/refunded bets never touched a real outcome
 * and are excluded so they don't dilute accuracy.
 */

/** Anti-noise floor — players below this many settled bets don't qualify. */
export const MIN_SETTLED_BETS = 10;

/** How many ranked places the board shows. */
export const LEADERBOARD_SIZE = 25;

const SETTLED = [BetStatus.WON, BetStatus.CLAIMED, BetStatus.LOST];

export interface RankedPlayer extends LeaderboardEntry {
  address: string;
}

export interface ViewerStanding extends UserStanding {
  qualified: boolean;
}

export async function getLeaderboard(
  opts: {
    minSettledBets?: number;
    limit?: number;
  } = {},
): Promise<RankedPlayer[]> {
  const minSettledBets = opts.minSettledBets ?? MIN_SETTLED_BETS;
  const limit = opts.limit ?? LEADERBOARD_SIZE;

  const rows = await prisma.bet.groupBy({
    by: ["userId", "status"],
    where: { status: { in: SETTLED } },
    _count: true,
    _sum: { amount: true, payout: true },
  });

  const statRows: LeaderboardStatRow[] = rows.map((r) => ({
    userId: r.userId,
    status: r.status === BetStatus.LOST ? "LOST" : "WON",
    count: r._count,
    stake: toBigInt(r._sum.amount),
    payout: toBigInt(r._sum.payout),
  }));

  const ranked = rankLeaderboard(statRows, { minSettledBets, limit });
  if (ranked.length === 0) return [];

  const users = await prisma.user.findMany({
    where: { id: { in: ranked.map((e) => e.userId) } },
    select: { id: true, address: true },
  });
  const addressById = new Map(users.map((u) => [u.id, u.address]));

  return ranked.map((e) => ({
    ...e,
    address: addressById.get(e.userId) ?? "unknown",
  }));
}

export async function getUserStanding(
  address: string,
  minSettledBets: number = MIN_SETTLED_BETS,
): Promise<ViewerStanding> {
  const rows = await prisma.bet.groupBy({
    by: ["status"],
    where: {
      address: address.toLowerCase(),
      status: { in: SETTLED },
    },
    _count: true,
    _sum: { amount: true, payout: true },
  });

  const statRows: LeaderboardStatRow[] = rows.map((r) => ({
    userId: address.toLowerCase(),
    status: r.status === BetStatus.LOST ? "LOST" : "WON",
    count: r._count,
    stake: toBigInt(r._sum.amount),
    payout: toBigInt(r._sum.payout),
  }));

  const summary = summarizeUser(statRows);
  return { ...summary, qualified: summary.settled >= minSettledBets };
}
