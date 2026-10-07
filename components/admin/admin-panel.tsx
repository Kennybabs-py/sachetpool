"use client";

import { useMemo, useState, useTransition } from "react";
import posthog from "posthog-js";
import { Check, Search } from "lucide-react";
import type { MatchCandidate, AdminPool } from "@/lib/pools";
import type { OnchainOutcome } from "@/lib/onchain";
import {
  openPoolAction,
  resolvePoolAction,
  type ActionResult,
} from "@/app/(app)/admin/actions";
import { PrimaryButton } from "@/components/common/primary-button";
import { cn } from "@/lib/utils";

const isPostHogConfigured = Boolean(
  process.env.NEXT_PUBLIC_POSTHOG_PROJECT_TOKEN &&
  process.env.NEXT_PUBLIC_POSTHOG_HOST,
);

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

function formatKickoff(date: Date): string {
  return new Date(date).toLocaleString(undefined, {
    month: "short",
    day: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });
}

function OpenPoolSection({ candidates }: { candidates: MatchCandidate[] }) {
  const [pending, startTransition] = useTransition();
  const [result, setResult] = useState<ActionResult | null>(null);
  const [query, setQuery] = useState("");
  const [matchId, setMatchId] = useState(candidates[0]?.id ?? "");
  const [closesAt, setClosesAt] = useState(
    candidates[0] ? toLocalInputValue(new Date(candidates[0].kickoffAt)) : "",
  );

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return candidates;
    return candidates.filter((c) =>
      `${c.league} ${c.homeTeam} ${c.awayTeam}`.toLowerCase().includes(q),
    );
  }, [candidates, query]);

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

  function select(match: MatchCandidate) {
    setMatchId(match.id);
    setClosesAt(toLocalInputValue(new Date(match.kickoffAt)));
    setResult(null);
  }

  function submit() {
    if (!selected || pending) return;
    const closesAtSec = Math.floor(new Date(closesAt).getTime() / 1000);
    startTransition(async () => {
      const res = await openPoolAction({
        matchId: selected.id,
        closesAt: closesAtSec,
      });
      if (res.ok && isPostHogConfigured) {
        posthog.capture("pool_opened", { league: selected.league });
      }
      setResult(res);
    });
  }

  return (
    <section>
      <div className="mb-3 flex items-baseline justify-between gap-2">
        <h2 className="text-lg font-semibold">Open a pool</h2>
        <span className="text-xs text-muted-foreground tabular-nums">
          {candidates.length} scheduled
        </span>
      </div>

      <div className="overflow-hidden rounded-2xl border border-border">
        <div className="border-b border-border p-3">
          <div className="relative">
            <Search
              aria-hidden
              className="pointer-events-none absolute top-1/2 left-3 size-4 -translate-y-1/2 text-muted-foreground"
            />
            <input
              type="search"
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder="Search a team or league…"
              aria-label="Search matches"
              className="h-10 w-full rounded-lg border border-border bg-background pr-3 pl-9 text-sm text-foreground outline-none placeholder:text-muted-foreground focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/30"
            />
          </div>
        </div>

        <div className="max-h-90 overflow-y-auto p-2">
          {filtered.length === 0 ? (
            <p className="px-3 py-8 text-center text-sm text-muted-foreground">
              No matches match “{query}”.
            </p>
          ) : (
            <ul className="flex flex-col gap-0.5">
              {filtered.map((c) => {
                const isSelected = c.id === matchId;
                return (
                  <li key={c.id}>
                    <button
                      type="button"
                      onClick={() => select(c)}
                      aria-pressed={isSelected}
                      className={cn(
                        "flex w-full items-center justify-between gap-3 rounded-lg px-3 py-2 text-left transition-colors",
                        isSelected
                          ? "bg-primary/10 text-foreground"
                          : "hover:bg-muted",
                      )}
                    >
                      <span className="min-w-0">
                        <span className="block truncate text-sm font-medium">
                          {c.homeTeam}{" "}
                          <span className="text-muted-foreground">vs</span>{" "}
                          {c.awayTeam}
                        </span>
                        <span className="block truncate text-xs text-muted-foreground">
                          {c.league} · {formatKickoff(c.kickoffAt)}
                        </span>
                      </span>
                      {isSelected && (
                        <Check
                          aria-hidden
                          className="size-4 shrink-0 text-primary"
                        />
                      )}
                    </button>
                  </li>
                );
              })}
            </ul>
          )}
        </div>

        <div className="flex flex-wrap items-end gap-3 border-t border-border bg-muted/30 p-3">
          <div className="min-w-40 flex-1">
            {selected ? (
              <>
                <p className="truncate text-sm font-medium">
                  {selected.homeTeam}{" "}
                  <span className="text-muted-foreground">vs</span>{" "}
                  {selected.awayTeam}
                </p>
                <p className="truncate text-xs text-muted-foreground">
                  {selected.league}
                </p>
              </>
            ) : (
              <p className="text-xs text-muted-foreground">
                Select a match to open its pool.
              </p>
            )}
          </div>

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
              if (res.ok && isPostHogConfigured) {
                posthog.capture("pool_resolved", { outcome });
              }
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
