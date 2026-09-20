import { describe, it, expect } from "vitest";
import { projectPayout, impliedMultiple, winnerPayout } from "./odds";

/**
 * Reference implementation of the payout arithmetic in `SachetMarket.sol`
 * (`resolve` / `claim`), replicated here on purpose.
 *
 * The contract is the authority; this test proves `projectPayout` /
 * `winnerPayout` agree with it bet-for-bet. If the Solidity changes, this
 * reference must change with it and this test will flag the drift.
 */
type Bet = { id: string; selection: "HOME" | "DRAW" | "AWAY"; stake: bigint };

const BPS = 10_000n;

function referenceCredited(
  bets: Bet[],
  winning: "HOME" | "DRAW" | "AWAY",
  rakeBps: number,
): Map<string, bigint> {
  const totalStake = bets.reduce((s, b) => s + b.stake, 0n);
  const winners = bets.filter((b) => b.selection === winning);
  const totalWinningStake = winners.reduce((s, b) => s + b.stake, 0n);
  const credited = new Map<string, bigint>();

  // No winners → full refund (not the branch projectPayout models).
  if (winners.length === 0) {
    for (const b of bets) credited.set(b.id, b.stake);
    return credited;
  }

  const rake = (totalStake * BigInt(rakeBps)) / BPS;
  const distributable = totalStake - rake;
  for (const b of bets) {
    credited.set(
      b.id,
      b.selection === winning
        ? (distributable * b.stake) / totalWinningStake
        : 0n,
    );
  }
  return credited;
}

/**
 * For a winning bet `b` inside `bets`, `projectPayout` fed the totals *before*
 * `b` was placed must reproduce what the contract credits `b` *after* the whole
 * pool is in. That's the contract: the payout shown at bet time == the payout
 * paid at claim time.
 */
function assertParity(
  bets: Bet[],
  winning: "HOME" | "DRAW" | "AWAY",
  rakeBps: number,
) {
  const credited = referenceCredited(bets, winning, rakeBps);
  const total = bets.reduce((s, b) => s + b.stake, 0n);
  const winStake = bets
    .filter((b) => b.selection === winning)
    .reduce((s, b) => s + b.stake, 0n);

  for (const b of bets.filter((x) => x.selection === winning)) {
    const projected = projectPayout(
      total - b.stake, // pot before this bet
      winStake - b.stake, // stake on the selection before this bet
      b.stake,
      rakeBps,
    );
    expect(projected).toBe(credited.get(b.id));

    // And the settled-winner helper agrees with the whole-pool view.
    const settled = winnerPayout(total, b.stake, winStake, rakeBps);
    expect(settled).toBe(credited.get(b.id));
  }
}

describe("projectPayout", () => {
  it("returns the exact contract credit for every winner in a mixed pool", () => {
    const bets: Bet[] = [
      { id: "a", selection: "HOME", stake: 100n },
      { id: "b", selection: "HOME", stake: 50n },
      { id: "c", selection: "AWAY", stake: 30n },
      { id: "d", selection: "DRAW", stake: 20n },
    ];
    assertParity(bets, "HOME", 500);

    // Lock the concrete arithmetic so a future refactor can't drift silently:
    // total=200, rake=floor(200*5%)=10, distributable=190, winningStake=150.
    // a: floor(190*100/150)=126, b: floor(190*50/150)=63.
    expect(projectPayout(100n, 50n, 100n, 500)).toBe(126n);
    expect(projectPayout(150n, 100n, 50n, 500)).toBe(63n);
  });

  it("prices a bet on a previously-empty selection", () => {
    const bets: Bet[] = [
      { id: "home", selection: "HOME", stake: 100n },
      { id: "away", selection: "AWAY", stake: 50n },
    ];
    assertParity(bets, "AWAY", 500);
    expect(projectPayout(100n, 0n, 50n, 500)).toBe(143n);
  });

  it("gives a sole bettor the whole pot back minus rake", () => {
    assertParity([{ id: "solo", selection: "HOME", stake: 100n }], "HOME", 500);
    expect(projectPayout(0n, 0n, 100n, 500)).toBe(95n);
  });

  it("returns exactly the stake when rake is zero and there are no losers", () => {
    expect(projectPayout(0n, 0n, 100n, 0)).toBe(100n);
    expect(projectPayout(400n, 400n, 100n, 0)).toBe(100n);
  });

  it("hands the loser pool to the winners when rake is zero", () => {
    expect(projectPayout(400n, 100n, 100n, 0)).toBe(250n);
  });

  it("returns 0 for a non-positive stake", () => {
    expect(projectPayout(200n, 50n, 0n, 500)).toBe(0n);
  });

  it("holds parity across a spread of pools and rakes", () => {
    const pools: Bet[][] = [
      [
        { id: "1", selection: "HOME", stake: 1n },
        { id: "2", selection: "AWAY", stake: 999n },
      ],
      [
        { id: "1", selection: "DRAW", stake: 333n },
        { id: "2", selection: "DRAW", stake: 333n },
        { id: "3", selection: "HOME", stake: 334n },
      ],
      [
        { id: "1", selection: "HOME", stake: 7n },
        { id: "2", selection: "HOME", stake: 11n },
        { id: "3", selection: "HOME", stake: 13n },
        { id: "4", selection: "AWAY", stake: 17n },
        { id: "5", selection: "DRAW", stake: 19n },
      ],
    ];
    for (const bets of pools) {
      for (const winning of ["HOME", "DRAW", "AWAY"] as const) {
        for (const rakeBps of [0, 250, 500, 1000]) {
          if (bets.some((b) => b.selection === winning)) {
            assertParity(bets, winning, rakeBps);
          }
        }
      }
    }
  });
});

describe("impliedMultiple", () => {
  it("computes gross return per staked token after rake", () => {
    // total=200, rake=floor(200*5%)=10, distributable=190, 190/40 = 4.75.
    expect(impliedMultiple(200n, 40n, 500)).toBeCloseTo(4.75, 6);
  });

  it("is null when nothing is staked on the selection", () => {
    expect(impliedMultiple(200n, 0n, 500)).toBeNull();
    expect(impliedMultiple(0n, 0n, 500)).toBeNull();
  });

  it("drops below 1 when the whole pot is on one side (rake-only loss)", () => {
    const m = impliedMultiple(100n, 100n, 500);
    expect(m).not.toBeNull();
    expect(m!).toBeCloseTo(0.95, 6);
  });

  it("shortens as more money piles onto a selection", () => {
    const thin = impliedMultiple(1000n, 100n, 500)!;
    const heavy = impliedMultiple(1000n, 400n, 500)!;
    expect(heavy).toBeLessThan(thin);
  });
});
