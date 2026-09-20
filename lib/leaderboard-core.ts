/**
 * Leaderboard ranking — pure core, no Prisma / `server-only`.
 *
 * Kept dependency-free so it's unit-testable offline (importing anything that
 * pulls `lib/prisma.ts` instantiates a real PrismaClient and blows up under
 * Vitest). The DB read layer that feeds these functions lives in
 * `lib/leaderboard.ts`.
 *
 * Ranking is by prediction *skill*: accuracy = won / settled. Money (net
 * profit) is only a tie-break, so a whale can't buy the top spot. Accuracy is
 * expressed in integer basis points to keep the sort deterministic. Amounts are
 * `bigint` token base units.
 */

export interface LeaderboardStatRow {
  userId: string;
  status: "WON" | "LOST";
  /** Number of bets in this (user, status) group. */
  count: number;
  /** Total tokens staked across the group. */
  stake: bigint;
  /** Total tokens paid out across the group (0 for LOST). */
  payout: bigint;
}

export interface UserStanding {
  won: number;
  settled: number;
  /** floor(won · 10000 / settled); 8000 = 80.00%. 0 when nothing settled. */
  accuracyBps: number;
  /** Σpayout − Σstake across settled bets; may be negative (the rake bites). */
  netProfit: bigint;
}

export interface LeaderboardEntry extends UserStanding {
  userId: string;
  /** 1-based position on the board. */
  rank: number;
}

export interface RankOptions {
  /** Players below this many settled bets don't qualify (anti-noise floor). */
  minSettledBets: number;
  /** Keep at most this many ranked entries. */
  limit: number;
}

/** floor(won · 10000 / settled), guarding settled == 0. */
export function accuracyBps(won: number, settled: number): number {
  if (settled <= 0) return 0;
  return Math.floor((won * 10_000) / settled);
}

interface Bucket {
  won: number;
  settled: number;
  stake: bigint;
  payout: bigint;
}

function bucketByUser(rows: LeaderboardStatRow[]): Map<string, Bucket> {
  const byUser = new Map<string, Bucket>();
  for (const r of rows) {
    let b = byUser.get(r.userId);
    if (!b) {
      b = { won: 0, settled: 0, stake: 0n, payout: 0n };
      byUser.set(r.userId, b);
    }
    b.settled += r.count;
    if (r.status === "WON") b.won += r.count;
    b.stake += r.stake;
    b.payout += r.payout;
  }
  return byUser;
}

function toStanding(b: Bucket): UserStanding {
  return {
    won: b.won,
    settled: b.settled,
    accuracyBps: accuracyBps(b.won, b.settled),
    netProfit: b.payout - b.stake,
  };
}

/**
 * Collapse one player's rows into a standing. Pass only rows for that user
 * (extra users are silently folded in, so don't). Empty input → an all-zero,
 * unqualified standing.
 */
export function summarizeUser(rows: LeaderboardStatRow[]): UserStanding {
  const buckets = bucketByUser(rows);
  const merged: Bucket = { won: 0, settled: 0, stake: 0n, payout: 0n };
  for (const b of buckets.values()) {
    merged.won += b.won;
    merged.settled += b.settled;
    merged.stake += b.stake;
    merged.payout += b.payout;
  }
  return toStanding(merged);
}

/**
 * Rank qualifying players. Sort order is
 *   accuracyBps desc → netProfit desc → settled desc → userId asc,
 * where the final key makes ties fully deterministic.
 */
export function rankLeaderboard(
  rows: LeaderboardStatRow[],
  { minSettledBets, limit }: RankOptions,
): LeaderboardEntry[] {
  const byUser = bucketByUser(rows);

  return [...byUser.entries()]
    .map(([userId, b]) => ({ userId, ...toStanding(b) }))
    .filter((e) => e.settled >= minSettledBets)
    .sort((a, b) => {
      if (b.accuracyBps !== a.accuracyBps) return b.accuracyBps - a.accuracyBps;
      if (b.netProfit !== a.netProfit) return b.netProfit > a.netProfit ? 1 : -1;
      if (b.settled !== a.settled) return b.settled - a.settled;
      return a.userId < b.userId ? -1 : a.userId > b.userId ? 1 : 0;
    })
    .slice(0, limit)
    .map((e, i) => ({ rank: i + 1, ...e }));
}
