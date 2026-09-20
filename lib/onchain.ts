import { keccak256, toBytes } from "viem";

/**
 * Pure on-chain vocabulary shared by the indexer, settlement, and the admin
 * dashboard. No `server-only` / Prisma imports so it stays unit-testable.
 *
 * Selection codes are 1-based on-chain (HOME=1, DRAW=2, AWAY=3); VOID=4 is a
 * resolution-only outcome.
 */

export const SELECTION_CODE = { HOME: 1, DRAW: 2, AWAY: 3 } as const;
export const OUTCOME_CODE = { HOME: 1, DRAW: 2, AWAY: 3, VOID: 4 } as const;

export type OnchainSelection = keyof typeof SELECTION_CODE;
export type OnchainOutcome = keyof typeof OUTCOME_CODE;

/**
 * Deterministic, idempotent pool id: one pool per match. Mirrors the plan's
 * `keccak256(utf8("sachet:1x2:" + match.externalId))`.
 */
export function computeOnchainPoolId(
  matchExternalId: string,
): `0x${string}` {
  return keccak256(toBytes(`sachet:1x2:${matchExternalId}`));
}

export function selectionToCode(selection: OnchainSelection): number {
  return SELECTION_CODE[selection];
}

export function codeToSelection(code: number): OnchainSelection | null {
  switch (code) {
    case 1:
      return "HOME";
    case 2:
      return "DRAW";
    case 3:
      return "AWAY";
    default:
      return null;
  }
}

export function outcomeToCode(outcome: OnchainOutcome): number {
  return OUTCOME_CODE[outcome];
}

/** Map a final score to the winning 1X2 outcome code, or VOID when no score. */
export function outcomeFromScore(
  homeScore: number | null,
  awayScore: number | null,
): number {
  if (homeScore === null || awayScore === null) return OUTCOME_CODE.VOID;
  if (homeScore > awayScore) return OUTCOME_CODE.HOME;
  if (homeScore < awayScore) return OUTCOME_CODE.AWAY;
  return OUTCOME_CODE.DRAW;
}
