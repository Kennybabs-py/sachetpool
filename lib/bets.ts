import "server-only";
import { prisma } from "./prisma";
import { toAmountString, toBigInt } from "./amounts";
import {
  BetStatus,
  PoolStatus,
  Selection,
} from "@/generated/prisma/client";

/**
 * Server-side read layer for a wallet's bet history.
 *
 * Amounts are stringified so they survive the RSC boundary. Claiming is a
 * client-side on-chain call keyed on `onchainPoolId`.
 */

export interface UserBetView {
  id: string;
  poolId: string;
  onchainPoolId: string;
  selection: Selection;
  amount: string;
  status: BetStatus;
  payout: string;
  claimed: boolean;
  txHash: string;
  claimTxHash: string | null;
  createdAt: Date;
  homeTeam: string;
  awayTeam: string;
  homeTeamLogo: string | null;
  awayTeamLogo: string | null;
  kickoffAt: Date;
  poolStatus: PoolStatus;
  /** True when the bet can be claimed on-chain. */
  claimable: boolean;
}

/**
 * The wallet's current live stake in one pool, as base-unit string, or `null`
 * when they have no (non-zero) stake there.
 */
export async function getUserPoolStake(
  address: string,
  poolId: string,
): Promise<string | null> {
  const bet = await prisma.bet.findUnique({
    where: { poolId_address: { poolId, address: address.toLowerCase() } },
    select: { amount: true },
  });
  if (!bet) return null;
  return toBigInt(bet.amount) > 0n ? toAmountString(bet.amount) : null;
}

export async function listUserBets(address: string): Promise<UserBetView[]> {
  const bets = await prisma.bet.findMany({
    where: { address: address.toLowerCase() },
    orderBy: { updatedAt: "desc" },
    take: 200,
    include: { pool: { include: { match: true } } },
  });

  return bets.map((bet) => ({
    id: bet.id,
    poolId: bet.poolId,
    onchainPoolId: bet.pool.onchainPoolId,
    selection: bet.selection,
    amount: toAmountString(bet.amount),
    status: bet.status,
    payout: toAmountString(bet.payout),
    claimed: bet.claimed,
    txHash: bet.txHash,
    claimTxHash: bet.claimTxHash,
    createdAt: bet.createdAt,
    homeTeam: bet.pool.match.homeTeam,
    awayTeam: bet.pool.match.awayTeam,
    homeTeamLogo: bet.pool.match.homeTeamLogo,
    awayTeamLogo: bet.pool.match.awayTeamLogo,
    kickoffAt: bet.pool.match.kickoffAt,
    poolStatus: bet.pool.status,
    claimable:
      (bet.status === BetStatus.WON || bet.status === BetStatus.VOID) &&
      !bet.claimed,
  }));
}
