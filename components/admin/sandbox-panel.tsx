"use client";

import { useEffect, useState, useTransition } from "react";
import type { SandboxState } from "@/lib/sandbox";
import type { OnchainOutcome, OnchainSelection } from "@/lib/onchain";
import {
  claimPoolAction,
  createPoolAction,
  deleteFixtureAction,
  placeBetAction,
  resolvePoolAction,
  syncFixtureAction,
  type SandboxActionResult,
} from "@/app/(app)/sandbox/actions";
import { PrimaryButton } from "@/components/common/primary-button";
import { Button } from "@/components/ui/button";
import { formatToken, parseToken, shortAddress } from "@/lib/format";
import { TOKEN_DECIMALS, TOKEN_SYMBOL } from "@/config/chains";

/**
 * Admin sandbox controls.
 *
 * Six ordered steps run the dummy fixture through the real contract and mirror
 * the result into Postgres. The operator wallet plays every role, so a single
 * key drives create → bet → resolve → claim. Each step re-renders with the
 * server snapshot after its action revalidates the route.
 */

const SELECTIONS: { key: OnchainSelection; label: string }[] = [
  { key: "HOME", label: "Home" },
  { key: "DRAW", label: "Draw" },
  { key: "AWAY", label: "Away" },
];

const OUTCOMES: OnchainOutcome[] = ["HOME", "DRAW", "AWAY", "VOID"];

function Feedback({ result }: { result: SandboxActionResult | null }) {
  if (!result) return null;
  return (
    <p
      className={
        result.ok ? "text-xs text-muted-foreground" : "text-xs text-destructive"
      }
      role={result.ok ? "status" : "alert"}
    >
      {result.ok ? result.message : result.error}
    </p>
  );
}

function Step({
  index,
  title,
  description,
  children,
}: {
  index: number;
  title: string;
  description: string;
  children: React.ReactNode;
}) {
  return (
    <section className="rounded-2xl border border-border p-4">
      <div className="flex items-baseline gap-2">
        <span className="flex size-5 shrink-0 items-center justify-center rounded-full bg-muted text-[11px] font-semibold text-muted-foreground">
          {index}
        </span>
        <h2 className="text-base font-semibold">{title}</h2>
      </div>
      <p className="mt-1 text-sm text-muted-foreground">{description}</p>
      <div className="mt-3">{children}</div>
    </section>
  );
}

/** Seconds until `targetMs` (with a small grace buffer), or `null` before mount. */
function useCountdown(
  targetMs: number | null,
  enabled: boolean,
): number | null {
  const [now, setNow] = useState<number | null>(null);

  useEffect(() => {
    if (!enabled || !targetMs) return;
    const id = window.setInterval(() => setNow(Date.now()), 1000);
    return () => window.clearInterval(id);
  }, [targetMs, enabled]);

  if (!targetMs || now === null) return null;
  return Math.max(0, Math.ceil((targetMs + 2000 - now) / 1000));
}

function StateRow({ label, value }: { label: string; value: React.ReactNode }) {
  return (
    <div className="flex items-center justify-between gap-3">
      <span className="text-muted-foreground">{label}</span>
      <span className="truncate font-mono text-xs tabular-nums text-foreground">
        {value}
      </span>
    </div>
  );
}

export function SandboxPanel({ state }: { state: SandboxState }) {
  const { fixture, pool, bets } = state;
  const defaultAmount = state.onchainMinStake
    ? formatToken(state.onchainMinStake, TOKEN_DECIMALS)
    : "1";

  const hasPool = Boolean(pool);
  const poolOpen = pool?.status === "OPEN" && !pool.isExpired;
  const poolResolved = pool?.status === "RESOLVED" || pool?.status === "VOID";
  const claimable = bets.some((b) => b.status === "WON" || b.status === "VOID");
  const secondsLeft = useCountdown(pool?.closesAtMs ?? null, poolOpen);
  const expired = Boolean(pool && pool.isExpired);

  return (
    <div className="flex flex-col gap-4">
      <div className="rounded-2xl border border-border bg-card p-4 text-sm">
        <StateRow
          label="Operator"
          value={
            state.operatorAddress
              ? shortAddress(state.operatorAddress)
              : "unset"
          }
        />
        <StateRow
          label={`Operator ${TOKEN_SYMBOL}`}
          value={
            state.operatorBalance !== null
              ? formatToken(state.operatorBalance, TOKEN_DECIMALS)
              : "—"
          }
        />
        <StateRow
          label="Min stake"
          value={
            state.onchainMinStake !== null
              ? `${formatToken(state.onchainMinStake, TOKEN_DECIMALS)} ${TOKEN_SYMBOL}`
              : "—"
          }
        />
        <StateRow label="Fixture" value={fixture ? "synced" : "none"} />
        <StateRow
          label="Pool"
          value={pool ? `${pool.status} · ${bets.length} bet(s)` : "none"}
        />
      </div>

      {!state.configured && (
        <p className="rounded-2xl border border-dashed border-destructive/40 p-3 text-xs text-destructive">
          MARKET_ADDRESS is not configured. On-chain steps will fail until the
          market is deployed and the env is set.
        </p>
      )}

      <Step
        index={1}
        title="Sync dummy fixture"
        description="Upsert a dummy match into the Postgres mirror, ready to back a pool."
      >
        <SyncFixtureStep exists={Boolean(fixture)} />
      </Step>

      <Step
        index={2}
        title="Simulate creating a dummy pool"
        description="Write the pool row, open it on-chain with the operator key, and mark it OPEN."
      >
        <CreatePoolStep
          hasFixture={Boolean(fixture)}
          hasPool={hasPool}
          defaultAmount={defaultAmount}
        />
      </Step>

      <Step
        index={3}
        title="Simulate betting on the dummy pool"
        description="The operator wallet approves $SACH and stakes. The bet is mirrored into Postgres like the indexer would."
      >
        <PlaceBetStep
          enabled={poolOpen}
          defaultAmount={defaultAmount}
          disabledReason={
            !pool
              ? "Create the pool first."
              : pool.isExpired
                ? "The betting window has closed."
                : pool.status !== "OPEN"
                  ? `Pool is ${pool.status}.`
                  : null
          }
        />
      </Step>

      <Step
        index={4}
        title="Simulate resolving the pool"
        description="Call resolve() with an outcome, then mirror the settlement and per-bet payouts."
      >
        <ResolvePoolStep
          hasPool={hasPool}
          alreadyResolved={poolResolved}
          expired={expired}
          secondsLeft={secondsLeft}
        />
      </Step>

      <Step
        index={5}
        title="Simulate claiming the pool"
        description="Pull the operator's payout on-chain and mark the mirrored bet CLAIMED."
      >
        <ClaimPoolStep
          enabled={poolResolved && claimable}
          disabledReason={
            !pool
              ? "Create the pool first."
              : !poolResolved
                ? "Resolve the pool first."
                : !claimable
                  ? "No claimable bet for the operator wallet."
                  : null
          }
        />
      </Step>

      <Step
        index={6}
        title="Delete dummy fixture"
        description="Remove the fixture, pool, bets, and mirrored events from Postgres. On-chain state is immutable and stays."
      >
        <DeleteFixtureStep exists={Boolean(fixture)} />
      </Step>
    </div>
  );
}

function SyncFixtureStep({ exists }: { exists: boolean }) {
  const [pending, startTransition] = useTransition();
  const [result, setResult] = useState<SandboxActionResult | null>(null);

  return (
    <div className="flex flex-col gap-2">
      <PrimaryButton
        type="button"
        size="sm"
        disabled={pending || exists}
        onClick={() =>
          startTransition(async () => setResult(await syncFixtureAction()))
        }
      >
        {pending
          ? "Syncing…"
          : exists
            ? "Fixture synced"
            : "Sync dummy fixture"}
      </PrimaryButton>
      <Feedback result={result} />
    </div>
  );
}

function CreatePoolStep({
  hasFixture,
  hasPool,
  defaultAmount,
}: {
  hasFixture: boolean;
  hasPool: boolean;
  defaultAmount: string;
}) {
  const [pending, startTransition] = useTransition();
  const [result, setResult] = useState<SandboxActionResult | null>(null);
  const [closesInSec, setClosesInSec] = useState("120");
  const [rakeBps, setRakeBps] = useState("500");

  return (
    <div className="flex flex-col gap-3">
      <div className="flex flex-wrap items-end gap-3">
        <label className="flex flex-col gap-1 text-xs text-muted-foreground">
          Betting window (seconds)
          <input
            type="number"
            min={30}
            className="w-40 rounded-lg border border-border bg-background px-3 py-2 text-sm text-foreground"
            value={closesInSec}
            onChange={(e) => setClosesInSec(e.target.value)}
          />
        </label>
        <label className="flex flex-col gap-1 text-xs text-muted-foreground">
          Rake (bps, max 1000)
          <input
            type="number"
            min={0}
            max={1000}
            className="w-32 rounded-lg border border-border bg-background px-3 py-2 text-sm text-foreground"
            value={rakeBps}
            onChange={(e) => setRakeBps(e.target.value)}
          />
        </label>
        <PrimaryButton
          type="button"
          size="sm"
          disabled={pending || !hasFixture || hasPool}
          onClick={() =>
            startTransition(async () =>
              setResult(
                await createPoolAction({
                  closesInSec: Number(closesInSec),
                  rakeBps: Number(rakeBps),
                }),
              ),
            )
          }
        >
          {pending
            ? "Creating…"
            : hasPool
              ? "Pool exists"
              : "Create dummy pool"}
        </PrimaryButton>
      </div>
      <p className="text-xs text-muted-foreground">
        Keep the window short (e.g. 60s) so you can resolve without waiting
        long. Suggested stake for the next step: {defaultAmount} {TOKEN_SYMBOL}.
      </p>
      <Feedback result={result} />
    </div>
  );
}

function PlaceBetStep({
  enabled,
  defaultAmount,
  disabledReason,
}: {
  enabled: boolean;
  defaultAmount: string;
  disabledReason: string | null;
}) {
  const [pending, startTransition] = useTransition();
  const [result, setResult] = useState<SandboxActionResult | null>(null);
  const [selection, setSelection] = useState<OnchainSelection>("HOME");
  const [amount, setAmount] = useState(defaultAmount);

  return (
    <div className="flex flex-col gap-3">
      <div className="flex flex-wrap items-end gap-3">
        <label className="flex flex-col gap-1 text-xs text-muted-foreground">
          Outcome
          <select
            className="rounded-lg border border-border bg-background px-3 py-2 text-sm text-foreground"
            value={selection}
            onChange={(e) => setSelection(e.target.value as OnchainSelection)}
          >
            {SELECTIONS.map((s) => (
              <option key={s.key} value={s.key}>
                {s.label}
              </option>
            ))}
          </select>
        </label>
        <label className="flex flex-col gap-1 text-xs text-muted-foreground">
          Stake ({TOKEN_SYMBOL})
          <input
            inputMode="decimal"
            className="w-32 rounded-lg border border-border bg-background px-3 py-2 text-sm text-foreground"
            value={amount}
            onChange={(e) => setAmount(e.target.value.replace(/[^0-9.]/g, ""))}
          />
        </label>
        <PrimaryButton
          type="button"
          size="sm"
          disabled={
            pending || !enabled || parseToken(amount, TOKEN_DECIMALS) === null
          }
          onClick={() =>
            startTransition(async () =>
              setResult(await placeBetAction({ selection, amount })),
            )
          }
        >
          {pending ? "Staking…" : "Place dummy bet"}
        </PrimaryButton>
      </div>
      {disabledReason && (
        <p className="text-xs text-muted-foreground">{disabledReason}</p>
      )}
      <Feedback result={result} />
    </div>
  );
}

function ResolvePoolStep({
  hasPool,
  alreadyResolved,
  expired,
  secondsLeft,
}: {
  hasPool: boolean;
  alreadyResolved: boolean;
  expired: boolean;
  secondsLeft: number | null;
}) {
  const [pending, startTransition] = useTransition();
  const [result, setResult] = useState<SandboxActionResult | null>(null);
  const [outcome, setOutcome] = useState<OnchainOutcome>("HOME");

  const waiting = hasPool && !alreadyResolved && !expired;
  const disabled = pending || !hasPool || alreadyResolved || !expired;

  return (
    <div className="flex flex-col gap-3">
      <div className="flex flex-wrap items-end gap-3">
        <label className="flex flex-col gap-1 text-xs text-muted-foreground">
          Outcome
          <select
            className="rounded-lg border border-border bg-background px-3 py-2 text-sm text-foreground"
            value={outcome}
            onChange={(e) => setOutcome(e.target.value as OnchainOutcome)}
          >
            {OUTCOMES.map((o) => (
              <option key={o} value={o}>
                {o}
              </option>
            ))}
          </select>
        </label>
        <PrimaryButton
          type="button"
          size="sm"
          disabled={disabled}
          onClick={() =>
            startTransition(async () =>
              setResult(await resolvePoolAction({ outcome })),
            )
          }
        >
          {pending
            ? "Resolving…"
            : alreadyResolved
              ? "Already resolved"
              : "Resolve pool"}
        </PrimaryButton>
      </div>
      {!hasPool && (
        <p className="text-xs text-muted-foreground">Create the pool first.</p>
      )}
      {waiting && (
        <p className="text-xs text-muted-foreground">
          {secondsLeft === null
            ? "Waiting for the betting window to close…"
            : `Resolve unlocks in ${secondsLeft}s (on-chain expiry).`}
        </p>
      )}
      <Feedback result={result} />
    </div>
  );
}

function ClaimPoolStep({
  enabled,
  disabledReason,
}: {
  enabled: boolean;
  disabledReason: string | null;
}) {
  const [pending, startTransition] = useTransition();
  const [result, setResult] = useState<SandboxActionResult | null>(null);

  return (
    <div className="flex flex-col gap-2">
      <PrimaryButton
        type="button"
        size="sm"
        disabled={pending || !enabled}
        onClick={() =>
          startTransition(async () => setResult(await claimPoolAction()))
        }
      >
        {pending ? "Claiming…" : "Claim dummy payout"}
      </PrimaryButton>
      {disabledReason && (
        <p className="text-xs text-muted-foreground">{disabledReason}</p>
      )}
      <Feedback result={result} />
    </div>
  );
}

function DeleteFixtureStep({ exists }: { exists: boolean }) {
  const [pending, startTransition] = useTransition();
  const [result, setResult] = useState<SandboxActionResult | null>(null);

  return (
    <div className="flex flex-col gap-2">
      <Button
        type="button"
        variant="destructive"
        size="sm"
        disabled={pending || !exists}
        onClick={() =>
          startTransition(async () => setResult(await deleteFixtureAction()))
        }
      >
        {pending
          ? "Deleting…"
          : exists
            ? "Delete dummy fixture"
            : "Nothing to delete"}
      </Button>
      <Feedback result={result} />
    </div>
  );
}
