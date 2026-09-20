/**
 * Pari-mutuel math — the read-side mirror of `SachetMarket.sol`.
 *
 * Deliberately dependency-free (no Prisma, no `server-only`) so it runs in
 * client components *and* is unit-testable offline. The numbers a player sees
 * before betting must match what the contract pays, so this file reproduces the
 * contract's integer-floor arithmetic exactly:
 *
 *   rake          = floor(totalStake · rakeBps / 10000)
 *   distributable = totalStake − rake
 *   payout        = floor(distributable · stake / winningStake)
 *
 * All amounts are `bigint` token base units. `impliedMultiple` returns a number
 * for display only. See `lib/odds.test.ts` for the parity proof.
 */

const BPS_DENOMINATOR = 10_000n;
const DISPLAY_SCALE = 1_000_000n;

/** House rake, floored, in token base units. */
export function rakeAmount(totalStake: bigint, rakeBps: number): bigint {
  if (totalStake <= 0n || rakeBps <= 0) return 0n;
  return (totalStake * BigInt(rakeBps)) / BPS_DENOMINATOR;
}

/** The pot paid to winners: total minus rake. */
export function distributablePot(totalStake: bigint, rakeBps: number): bigint {
  return totalStake - rakeAmount(totalStake, rakeBps);
}

/**
 * Tokens a bettor would be credited if their selection wins, assuming the pool
 * closed with these totals *after* their stake is added (gross return, stake
 * included). Returns 0 for a non-positive stake.
 */
export function projectPayout(
  totalStake: bigint,
  selectionStake: bigint,
  stake: bigint,
  rakeBps: number,
): bigint {
  if (stake <= 0n) return 0n;
  const newTotal = totalStake + stake;
  const winningStakeAfter = selectionStake + stake;
  return (distributablePot(newTotal, rakeBps) * stake) / winningStakeAfter;
}

/**
 * A settled winner's proportional share of the distributable pot. Matches the
 * contract's `claim` exactly; used by the indexer to seed mirrored payouts.
 */
export function winnerPayout(
  totalStake: bigint,
  userStakeOnWinner: bigint,
  winningStake: bigint,
  rakeBps: number,
): bigint {
  if (userStakeOnWinner <= 0n || winningStake <= 0n) return 0n;
  return (
    (distributablePot(totalStake, rakeBps) * userStakeOnWinner) / winningStake
  );
}

/**
 * Current display multiple for a selection: gross return per token already
 * staked on it if the pool closed now. `null` when nothing is staked there.
 */
export function impliedMultiple(
  totalStake: bigint,
  selectionStake: bigint,
  rakeBps: number,
): number | null {
  if (selectionStake <= 0n) return null;
  const dist = distributablePot(totalStake, rakeBps);
  return Number((dist * DISPLAY_SCALE) / selectionStake) / Number(DISPLAY_SCALE);
}
