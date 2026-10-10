import { getSessionUser } from "@/lib/session";
import { listUserBets } from "@/lib/bets";
import { BetRow } from "@/components/wallet/bet-row";
import { AuthGate } from "@/components/wallet/auth-gate";

export const dynamic = "force-dynamic";

/**
 * The signed-in wallet's bet history and claimable winnings, or a sign-in prompt
 * without a session. Shows an empty state when no bets are found; session and
 * bet-read errors propagate.
 */
export default async function MyBetsPage() {
  const user = await getSessionUser();
  if (!user) return <AuthGate />;

  const bets = await listUserBets(user.address);
  const claimable = bets.filter((b) => b.claimable);

  return (
    <div className="flex flex-col gap-4">
      <div>
        <h1 className="text-xl font-semibold tracking-tight">My bets</h1>
        <p className="text-sm text-muted-foreground">
          {claimable.length > 0
            ? `${claimable.length} bet${claimable.length === 1 ? "" : "s"} ready to claim.`
            : "Settled bets appear here once the match is resolved."}
        </p>
      </div>

      {bets.length === 0 ? (
        <p className="rounded-2xl border border-dashed border-border p-8 text-center text-sm text-muted-foreground">
          No bets yet.
        </p>
      ) : (
        <ul className="flex flex-col divide-y divide-border rounded-2xl border border-border px-4">
          {bets.map((bet) => (
            <BetRow
              key={bet.id}
              bet={{
                id: bet.id,
                selection: bet.selection,
                amount: bet.amount,
                status: bet.status,
                payout: bet.payout,
                claimable: bet.claimable,
                onchainPoolId: bet.onchainPoolId,
                pool: {
                  match: {
                    homeTeam: bet.homeTeam,
                    awayTeam: bet.awayTeam,
                  },
                },
              }}
            />
          ))}
        </ul>
      )}
    </div>
  );
}
