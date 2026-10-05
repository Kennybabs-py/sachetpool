"use client";

import { useState, useTransition } from "react";
import type { MatchCandidate, AdminPool } from "@/lib/pools";
import type { OnchainOutcome } from "@/lib/onchain";
import {
  openPoolAction,
  resolvePoolAction,
  type ActionResult,
} from "@/app/(app)/admin/actions";
import { PrimaryButton } from "@/components/common/primary-button";

/**
 * Admin dashboard interactivity. Renders the "open a pool" queue and the
 * "resolve" queue; every write goes through the operator-key server actions.
 */

function toLocalInputValue(date: Date): string {
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(
    date.getDate(),
  )}T${pad(date.getHours())}:${pad(date.getMinutes())}`;
}

export function AdminPanel({
  candidates,
  pools,
}: {
  candidates: MatchCandidate[];
  pools: AdminPool[];
}) {
  return (
    <div className="flex flex-col gap-8">
      <OpenPoolSection candidates={candidates} />
      <ResolveSection pools={pools} />
    </div>
  );
}

function Feedback({ result }: { result: ActionResult | null }) {
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

function OpenPoolSection({ candidates }: { candidates: MatchCandidate[] }) {
  const [pending, startTransition] = useTransition();
  const [result, setResult] = useState<ActionResult | null>(null);
  const [matchId, setMatchId] = useState(candidates[0]?.id ?? "");
  const [closesAt, setClosesAt] = useState(
    candidates[0] ? toLocalInputValue(new Date(candidates[0].kickoffAt)) : "",
  );

  if (candidates.length === 0) {
    return (
      <section>
        <h2 className="mb-2 text-lg font-semibold">Open a pool</h2>
        <p className="text-sm text-muted-foreground">
          No scheduled matches without a pool. Sync fixtures first.
        </p>
      </section>
    );
  }

  const selected = candidates.find((c) => c.id === matchId);

  function submit() {
    if (!selected || pending) return;
    const closesAtSec = Math.floor(new Date(closesAt).getTime() / 1000);
    startTransition(async () => {
      const res = await openPoolAction({
        matchId: selected.id,
        closesAt: closesAtSec,
      });
      setResult(res);
    });
  }

  return (
    <section>
      <h2 className="mb-3 text-lg font-semibold">Open a pool</h2>
      <div className="flex flex-wrap items-end gap-3 rounded-2xl border border-border p-4">
        <label className="flex flex-col gap-1 text-xs text-muted-foreground">
          Match
          <select
            className="min-w-64 rounded-lg border border-border bg-background px-3 py-2 text-sm text-foreground"
            value={matchId}
            onChange={(e) => {
              setMatchId(e.target.value);
              const next = candidates.find((c) => c.id === e.target.value);
              if (next)
                setClosesAt(toLocalInputValue(new Date(next.kickoffAt)));
            }}
          >
            {candidates.map((c) => (
              <option key={c.id} value={c.id}>
                {c.league}: {c.homeTeam} vs {c.awayTeam} (
                {new Date(c.kickoffAt).toLocaleString()})
              </option>
            ))}
          </select>
        </label>

        <label className="flex flex-col gap-1 text-xs text-muted-foreground">
          Closes at
          <input
            type="datetime-local"
            className="rounded-lg border border-border bg-background px-3 py-2 text-sm text-foreground"
            value={closesAt}
            onChange={(e) => setClosesAt(e.target.value)}
          />
        </label>

        <PrimaryButton
          type="button"
          onClick={submit}
          disabled={pending || !selected}
        >
          {pending ? "Opening…" : "Open pool"}
        </PrimaryButton>
      </div>
      <div className="mt-2">
        <Feedback result={result} />
      </div>
    </section>
  );
}

const OUTCOMES: OnchainOutcome[] = ["HOME", "DRAW", "AWAY", "VOID"];

function ResolveSection({ pools }: { pools: AdminPool[] }) {
  if (pools.length === 0) {
    return (
      <section>
        <h2 className="mb-2 text-lg font-semibold">Resolve pools</h2>
        <p className="text-sm text-muted-foreground">
          No open pools awaiting resolution.
        </p>
      </section>
    );
  }
  return (
    <section>
      <h2 className="mb-3 text-lg font-semibold">Resolve pools</h2>
      <ul className="flex flex-col divide-y divide-border rounded-2xl border border-border">
        {pools.map((pool) => (
          <ResolveRow key={pool.poolId} pool={pool} />
        ))}
      </ul>
    </section>
  );
}

function ResolveRow({ pool }: { pool: AdminPool }) {
  const [pending, startTransition] = useTransition();
  const [result, setResult] = useState<ActionResult | null>(null);
  const [outcome, setOutcome] = useState<OnchainOutcome>("HOME");

  return (
    <li className="flex flex-col gap-2 p-4 sm:flex-row sm:items-center sm:justify-between">
      <div className="min-w-0">
        <p className="truncate text-sm font-medium">
          {pool.homeTeam} vs {pool.awayTeam}
        </p>
        <p className="text-xs text-muted-foreground">
          {pool.league} · {pool.status} · staked {pool.totalStake} ·{" "}
          {pool.isExpired ? "expired" : "open"}
        </p>
        <Feedback result={result} />
      </div>
      <div className="flex items-center gap-2">
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
        <PrimaryButton
          type="button"
          size="sm"
          disabled={pending}
          onClick={() =>
            startTransition(async () => {
              const res = await resolvePoolAction({
                poolId: pool.poolId,
                outcome,
              });
              setResult(res);
            })
          }
        >
          {pending ? "Resolving…" : "Resolve"}
        </PrimaryButton>
      </div>
    </li>
  );
}
