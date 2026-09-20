import { describe, it, expect } from "vitest";
import {
  accuracyBps,
  rankLeaderboard,
  summarizeUser,
  type LeaderboardStatRow,
} from "./leaderboard-core";

function won(
  userId: string,
  count: number,
  stake: bigint,
  payout: bigint,
): LeaderboardStatRow {
  return { userId, status: "WON", count, stake, payout };
}
function lost(
  userId: string,
  count: number,
  stake: bigint,
): LeaderboardStatRow {
  return { userId, status: "LOST", count, stake, payout: 0n };
}

describe("accuracyBps", () => {
  it("is floored basis points of won/settled", () => {
    expect(accuracyBps(7, 10)).toBe(7000);
    expect(accuracyBps(1, 3)).toBe(3333); // floor(3333.33…)
    expect(accuracyBps(0, 5)).toBe(0);
    expect(accuracyBps(5, 5)).toBe(10_000);
  });

  it("guards divide-by-zero", () => {
    expect(accuracyBps(0, 0)).toBe(0);
  });
});

describe("summarizeUser", () => {
  it("buckets WON + LOST into one standing (netProfit = Σpayout − Σstake)", () => {
    const s = summarizeUser([won("a", 7, 700n, 1400n), lost("a", 3, 300n)]);
    expect(s).toEqual({
      won: 7,
      settled: 10,
      accuracyBps: 7000,
      netProfit: 400n, // 1400 payout − (700 + 300) staked
    });
  });

  it("is an all-zero standing for no rows", () => {
    expect(summarizeUser([])).toEqual({
      won: 0,
      settled: 0,
      accuracyBps: 0,
      netProfit: 0n,
    });
  });
});

describe("rankLeaderboard", () => {
  it("drops players below the settled-bets floor", () => {
    const rows = [
      won("a", 9, 900n, 1800n),
      lost("a", 1, 100n), // settled 10 → qualifies
      won("b", 3, 300n, 600n),
      lost("b", 1, 100n), // settled 4 → below floor
    ];
    const board = rankLeaderboard(rows, { minSettledBets: 10, limit: 10 });
    expect(board.map((e) => e.userId)).toEqual(["a"]);
    expect(board[0].rank).toBe(1);
  });

  it("ranks by accuracy → net profit → settled → userId", () => {
    const rows = [
      won("a", 8, 800n, 1300n),
      lost("a", 2, 200n), // acc 8000, profit 300, settled 10
      won("b", 8, 800n, 1900n),
      lost("b", 2, 200n), // acc 8000, profit 900, settled 10
      won("c", 4, 400n, 1400n),
      lost("c", 1, 100n), // acc 8000, profit 900, settled 5
      won("d", 9, 900n, 1000n),
      lost("d", 1, 100n), // acc 9000 → tops the board
    ];
    const board = rankLeaderboard(rows, { minSettledBets: 5, limit: 10 });
    // d (best accuracy), then the 8000 trio: b & c tie on profit → more settled
    // (b) first, then a on lower profit.
    expect(board.map((e) => e.userId)).toEqual(["d", "b", "c", "a"]);
    expect(board.map((e) => e.rank)).toEqual([1, 2, 3, 4]);
  });

  it("breaks a total tie deterministically by userId ascending", () => {
    const rows = [
      won("y", 8, 800n, 1600n),
      lost("y", 2, 200n),
      won("x", 8, 800n, 1600n),
      lost("x", 2, 200n),
    ];
    const board = rankLeaderboard(rows, { minSettledBets: 5, limit: 10 });
    expect(board.map((e) => e.userId)).toEqual(["x", "y"]);
  });

  it("respects the limit", () => {
    const rows = [
      won("a", 10, 1000n, 2000n), // acc 10000
      won("b", 9, 900n, 1800n),
      lost("b", 1, 100n), // acc 9000
      won("c", 8, 800n, 1600n),
      lost("c", 2, 200n), // acc 8000
    ];
    const board = rankLeaderboard(rows, { minSettledBets: 5, limit: 2 });
    expect(board).toHaveLength(2);
    expect(board.map((e) => e.userId)).toEqual(["a", "b"]);
  });
});
