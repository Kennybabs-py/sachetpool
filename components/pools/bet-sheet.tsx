"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import posthog from "posthog-js";
import type { Selection } from "@/generated/prisma/client";
import type { PoolView } from "@/lib/pools";
import { projectPayout } from "@/lib/odds";
import { SELECTION_CODE } from "@/lib/onchain";
import { formatToken, formatTokenInput, parseToken } from "@/lib/format";
import {
  MARKET_ADDRESS,
  TOKEN_ADDRESS,
  TOKEN_DECIMALS,
  TOKEN_SYMBOL,
} from "@/config/chains";
import { erc20Abi } from "@/lib/contracts/erc20";
import { sachetMarketAbi } from "@/lib/contracts/sachet-market";
import { useSachBalance } from "@/hooks/use-sach-balance";
import {
  useAccount,
  usePublicClient,
  useReadContract,
  useWriteContract,
} from "wagmi";
import { useConnectModal } from "@rainbow-me/rainbowkit";
import { Button } from "@/components/ui/button";
import { PrimaryButton } from "@/components/common/primary-button";
import {
  Drawer,
  DrawerContent,
  DrawerHeader,
  DrawerTitle,
  DrawerDescription,
  DrawerFooter,
} from "@/components/ui/drawer";
import { cn } from "@/lib/utils";
import { formatMultiple } from "./format";
import { toast } from "sonner";

const OUTCOMES: { key: Selection; label: string }[] = [
  { key: "HOME", label: "Home" },
  { key: "DRAW", label: "Draw" },
  { key: "AWAY", label: "Away" },
];

const QUICK_STAKES = ["100", "500", "10000", "25000"];
const isPostHogConfigured = Boolean(
  process.env.NEXT_PUBLIC_POSTHOG_PROJECT_TOKEN &&
  process.env.NEXT_PUBLIC_POSTHOG_HOST,
);

type Phase = "idle" | "approving" | "betting" | "done";

/**
 * Bottom-sheet bet ticket.
 *
 * The stake is escrowed by `SachetMarket.placeBet`, which pulls `$SACH` with
 * `transferFrom` — so the flow is: check allowance, `approve` if short, then
 * `placeBet`. Staking again on the same outcome tops up the existing bet. Both
 * transactions are surfaced in the button label. The projected payout uses the
 * same integer math as the contract.
 */
export function BetSheet({
  pool,
  selection,
  onSelectionChange,
}: {
  pool: PoolView;
  selection: Selection | null;
  onSelectionChange: (selection: Selection | null) => void;
}) {
  const router = useRouter();
  const open = selection !== null;
  const [lastSelection, setLastSelection] = useState<Selection>("HOME");
  const [stakeStr, setStakeStr] = useState("");
  const [phase, setPhase] = useState<Phase>("idle");
  const [error, setError] = useState<string | null>(null);

  const { address, isConnected } = useAccount();
  const { openConnectModal } = useConnectModal();
  const publicClient = usePublicClient();
  const { writeContractAsync: mutateAsync } = useWriteContract();

  const { balance, refetch: refetchBalance } = useSachBalance();

  const { data: allowance, refetch: refetchAllowance } = useReadContract({
    address: TOKEN_ADDRESS,
    abi: erc20Abi,
    functionName: "allowance",
    args: address && MARKET_ADDRESS ? [address, MARKET_ADDRESS] : undefined,
    query: { enabled: Boolean(address && TOKEN_ADDRESS && MARKET_ADDRESS) },
  });

  // Keep the last real selection so the sheet still shows content while it
  // animates closed (selection becomes null the moment we start closing).
  function choose(next: Selection | null) {
    if (next) {
      setLastSelection(next);
      setError(null);
    }
    onSelectionChange(next);
  }

  const active = selection ?? lastSelection;
  const activeLabel = OUTCOMES.find((o) => o.key === active)!.label;
  const activeTeam =
    active === "HOME"
      ? pool.homeTeam
      : active === "AWAY"
        ? pool.awayTeam
        : "the draw";

  const parsedAmount = parseToken(stakeStr, TOKEN_DECIMALS);
  const amount = parsedAmount ?? 0n;
  const overBalance = balance !== undefined && amount > balance;
  const valid = parsedAmount !== null && amount > 0n && !overBalance;

  const payout = valid
    ? projectPayout(
        BigInt(pool.totalStake),
        BigInt(pool.stakeBySelection[active]),
        amount,
        pool.rakeBps,
      )
    : 0n;
  const profit = payout > amount ? payout - amount : 0n;
  const needsApproval = (allowance ?? 0n) < amount && amount > 0n;

  function shortError(err: unknown): string {
    const message = err instanceof Error ? err.message : String(err);
    return message.split("\n")[0].slice(0, 160);
  }

  async function submit() {
    if (phase === "approving" || phase === "betting") return;
    if (!isConnected) {
      openConnectModal?.();
      return;
    }
    if (!MARKET_ADDRESS || !TOKEN_ADDRESS || !address) {
      setError("Market is not configured.");
      return;
    }
    if (!valid || amount <= 0n || !publicClient) return;

    setError(null);
    try {
      if (needsApproval) {
        setPhase("approving");
        const approveHash = await mutateAsync({
          address: TOKEN_ADDRESS,
          abi: erc20Abi,
          functionName: "approve",
          args: [MARKET_ADDRESS, amount],
        });
        await publicClient.waitForTransactionReceipt({ hash: approveHash });
        await refetchAllowance();
      }

      setPhase("betting");
      const betHash = await mutateAsync({
        address: MARKET_ADDRESS,
        abi: sachetMarketAbi,
        functionName: "placeBet",
        args: [
          pool.onchainPoolId as `0x${string}`,
          SELECTION_CODE[active],
          amount,
        ],
      });
      await publicClient.waitForTransactionReceipt({ hash: betHash });

      if (isPostHogConfigured) {
        posthog.capture("bet_placed", {
          selection: active,
          stake_amount: formatTokenInput(amount, TOKEN_DECIMALS),
          token_symbol: TOKEN_SYMBOL,
          required_token_approval: needsApproval,
        });
      }

      await Promise.all([refetchBalance(), refetchAllowance()]);
      setPhase("done");
      setStakeStr("");
      choose(null);
      toast.success("Success");
      router.refresh();
    } catch (err) {
      setPhase("idle");
      setError(shortError(err));
      toast.error(shortError(err));
    }
  }

  const busy = phase === "approving" || phase === "betting";

  return (
    <Drawer
      open={open}
      onOpenChange={(next) => {
        if (!next && !busy) onSelectionChange(null);
      }}
      showSwipeHandle
    >
      <DrawerContent>
        <DrawerHeader>
          <DrawerTitle>Place your bet</DrawerTitle>
          <DrawerDescription>
            {pool.homeTeam} vs {pool.awayTeam}
          </DrawerDescription>
        </DrawerHeader>

        <div className="flex min-h-0 flex-1 flex-col gap-4 overflow-y-auto px-4 py-2">
          <div className="grid grid-cols-3 gap-2">
            {OUTCOMES.map(({ key, label }) => {
              const isActive = key === active;
              return (
                <button
                  key={key}
                  type="button"
                  onClick={() => choose(key)}
                  aria-pressed={isActive}
                  className={cn(
                    "flex flex-col items-center gap-0.5 rounded-2xl border p-3 text-center transition-colors",
                    isActive
                      ? "border-primary bg-primary/10"
                      : "border-border hover:bg-muted",
                  )}
                >
                  <span className="text-sm font-medium">{label}</span>
                  <span className="text-xs text-muted-foreground tabular-nums">
                    {formatMultiple(pool.oddsBySelection[key])}
                  </span>
                </button>
              );
            })}
          </div>

          <div>
            <label
              htmlFor="stake"
              className="mb-1 block text-xs font-medium text-muted-foreground"
            >
              Stake ({TOKEN_SYMBOL})
            </label>
            <input
              id="stake"
              inputMode="decimal"
              placeholder="0"
              value={stakeStr}
              onChange={(e) =>
                setStakeStr(e.target.value.replace(/[^0-9.]/g, ""))
              }
              className={cn(
                "w-full rounded-2xl border border-border bg-background px-4 py-3 text-lg font-semibold",
                "tabular-nums outline-none focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/30 aria-invalid:border-destructive",
              )}
              aria-invalid={overBalance || undefined}
            />
            <div className="mt-2 flex flex-wrap items-center gap-2">
              {QUICK_STAKES.map((quick) => {
                const quickAmount = parseToken(quick, TOKEN_DECIMALS);
                const disabled =
                  quickAmount === null ||
                  (balance !== undefined && quickAmount > balance);
                return (
                  <Button
                    key={quick}
                    type="button"
                    variant="secondary"
                    size="sm"
                    disabled={disabled}
                    onClick={() => setStakeStr(quick)}
                  >
                    {quick}
                  </Button>
                );
              })}
              <Button
                type="button"
                variant="secondary"
                size="sm"
                disabled={balance === undefined || balance <= 0n}
                onClick={() =>
                  balance !== undefined &&
                  setStakeStr(formatTokenInput(balance, TOKEN_DECIMALS))
                }
              >
                Max
              </Button>
              <span className="ml-auto text-xs text-muted-foreground tabular-nums">
                Balance{" "}
                {balance !== undefined
                  ? formatToken(balance, TOKEN_DECIMALS)
                  : "—"}
              </span>
            </div>
          </div>

          <div className="rounded-2xl bg-muted/50 p-3">
            <div className="flex items-center justify-between text-sm">
              <span className="text-muted-foreground">
                To win if {activeLabel} lands
              </span>
              <span className="font-semibold tabular-nums">
                {formatToken(payout, TOKEN_DECIMALS)} {TOKEN_SYMBOL}
              </span>
            </div>
            <div className="mt-1 flex items-center justify-between text-xs text-muted-foreground">
              <span>Projected profit</span>
              <span className="tabular-nums">
                {profit > 0n ? `+${formatToken(profit, TOKEN_DECIMALS)}` : "—"}
              </span>
            </div>
            <p className="mt-2 text-xs text-muted-foreground">
              Pari-mutuel — the final payout depends on the whole pool at
              kickoff.
            </p>
          </div>

          {error && (
            <p className="text-sm text-destructive" role="alert">
              {error}
            </p>
          )}
        </div>

        <DrawerFooter>
          {!isConnected ? (
            <PrimaryButton
              type="button"
              size="lg"
              onClick={() => openConnectModal?.()}
            >
              Connect wallet
            </PrimaryButton>
          ) : (
            <PrimaryButton
              type="button"
              size="lg"
              onClick={submit}
              disabled={!valid || busy}
            >
              {phase === "approving"
                ? "Approving…"
                : phase === "betting"
                  ? "Placing…"
                  : phase === "done"
                    ? "Bet placed"
                    : valid
                      ? `${needsApproval ? "Approve & stake " : "Stake "}${formatToken(
                          amount,
                          TOKEN_DECIMALS,
                        )} on ${activeTeam}`
                      : overBalance
                        ? `Not enough ${TOKEN_SYMBOL}`
                        : "Enter a stake"}
            </PrimaryButton>
          )}
          <Button
            type="button"
            variant="ghost"
            size="lg"
            disabled={busy}
            onClick={() => choose(null)}
          >
            Cancel
          </Button>
        </DrawerFooter>
      </DrawerContent>
    </Drawer>
  );
}
