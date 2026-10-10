import { readFileSync } from "node:fs";
import { join } from "node:path";
import { ImageResponse } from "next/og";

import { getPoolDetailData } from "@/lib/pools";
import { BRAND } from "@/lib/brand";
import { formatToken } from "@/lib/format";
import { formatMultiple } from "@/components/pools/format";
import { TOKEN_DECIMALS, TOKEN_SYMBOL } from "@/config/chains";

/**
 * Shared renderer for the pool detail social card, used by both
 * `opengraph-image` and `twitter-image` so the two are always identical. Team
 * crests are fetched and inlined as data URIs (Satori can't fetch remote
 * hosts), with an initials fallback when a crest is missing or non-raster.
 */

export const POOL_SOCIAL_SIZE = { width: 1200, height: 630 };

const lockup = readFileSync(
  join(process.cwd(), "public/brand/lockup-on-dark.png"),
).toString("base64");

const RULE = "rgba(237,237,237,0.16)";
const MUTED = "rgba(237,237,237,0.6)";
const PANEL = "rgba(237,237,237,0.06)";

const OUTCOMES = [
  { key: "HOME", label: "Home" },
  { key: "DRAW", label: "Draw" },
  { key: "AWAY", label: "Away" },
] as const;

async function crestDataUri(url: string | null): Promise<string | null> {
  if (!url) return null;
  try {
    const res = await fetch(url, { signal: AbortSignal.timeout(4000) });
    if (!res.ok) return null;
    const type = res.headers.get("content-type")?.split(";")[0] ?? "";
    // Only raster formats render reliably in Satori; anything else falls back.
    if (!/^image\/(png|jpe?g|webp)$/i.test(type)) return null;
    const buf = Buffer.from(await res.arrayBuffer());
    return `data:${type};base64,${buf.toString("base64")}`;
  } catch {
    return null;
  }
}

function initials(name: string): string {
  return name
    .split(/\s+/)
    .slice(0, 2)
    .map((word) => word[0]?.toUpperCase() ?? "")
    .join("");
}

function TeamBlock({ name, crest }: { name: string; crest: string | null }) {
  return (
    <div
      style={{
        display: "flex",
        flexDirection: "column",
        alignItems: "center",
        width: 360,
        gap: 20,
      }}
    >
      <div
        style={{
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          width: 170,
          height: 170,
          borderRadius: 999,
          background: PANEL,
          border: `1px solid ${RULE}`,
          overflow: "hidden",
        }}
      >
        {crest ? (
          // eslint-disable-next-line @next/next/no-img-element -- Satori renders plain img only
          <img src={crest} width={124} height={124} alt="" />
        ) : (
          <span style={{ fontSize: 56, fontWeight: 700, color: MUTED }}>
            {initials(name)}
          </span>
        )}
      </div>
      <span
        style={{
          fontSize: 34,
          fontWeight: 600,
          lineHeight: 1.12,
          color: BRAND.colors.paper,
          textAlign: "center",
        }}
      >
        {name}
      </span>
    </div>
  );
}

export async function renderPoolSocialImage(
  id: string,
): Promise<ImageResponse> {
  const { pool, serverNowMs } = await getPoolDetailData(id);

  const [homeCrest, awayCrest] = await Promise.all([
    crestDataUri(pool?.homeTeamLogo ?? null),
    crestDataUri(pool?.awayTeamLogo ?? null),
  ]);

  const homeTeam = pool?.homeTeam ?? "Sachet Pool";
  const awayTeam = pool?.awayTeam ?? "";
  const league = pool?.league ?? "Football";

  const resolved = pool?.status === "RESOLVED" || pool?.status === "VOID";
  const hasScore =
    resolved &&
    pool?.status !== "VOID" &&
    pool.homeScore !== null &&
    pool.awayScore !== null;
  const bettingClosed = pool != null && pool.closesAt.getTime() <= serverNowMs;
  const badge = resolved
    ? pool?.status === "VOID"
      ? "Void"
      : "Final"
    : bettingClosed
      ? "Betting closed"
      : "Open";

  return new ImageResponse(
    <div
      style={{
        width: "100%",
        height: "100%",
        display: "flex",
        flexDirection: "column",
        justifyContent: "space-between",
        background: BRAND.colors.ink,
        padding: 64,
        position: "relative",
      }}
    >
      <div
        style={{
          position: "absolute",
          top: 32,
          left: 32,
          right: 32,
          bottom: 32,
          border: `1px solid ${RULE}`,
          display: "flex",
        }}
      />

      {/* Header: brand + league + status */}
      <div
        style={{
          display: "flex",
          alignItems: "center",
          justifyContent: "space-between",
        }}
      >
        {/* eslint-disable-next-line @next/next/no-img-element -- Satori renders plain img only */}
        <img
          src={`data:image/png;base64,${lockup}`}
          width={300}
          height={58}
          alt=""
        />
        <div style={{ display: "flex", alignItems: "center", gap: 16 }}>
          <span
            style={{
              fontSize: 24,
              letterSpacing: "0.16em",
              textTransform: "uppercase",
              color: MUTED,
            }}
          >
            {league}
          </span>
          <span
            style={{
              display: "flex",
              fontSize: 20,
              padding: "8px 20px",
              border: `1px solid ${RULE}`,
              borderRadius: 999,
              color: BRAND.colors.paper,
            }}
          >
            {badge}
          </span>
        </div>
      </div>

      {/* Teams */}
      <div
        style={{
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          gap: 48,
        }}
      >
        <TeamBlock name={homeTeam} crest={homeCrest} />
        <div
          style={{
            display: "flex",
            flexDirection: "column",
            alignItems: "center",
            width: 120,
          }}
        >
          {hasScore ? (
            <span
              style={{
                fontSize: 60,
                fontWeight: 600,
                color: BRAND.colors.paper,
              }}
            >
              {pool?.homeScore}–{pool?.awayScore}
            </span>
          ) : (
            <span style={{ fontSize: 40, color: MUTED }}>vs</span>
          )}
        </div>
        <TeamBlock name={awayTeam} crest={awayCrest} />
      </div>

      {/* Odds + pot */}
      <div style={{ display: "flex", flexDirection: "column", gap: 20 }}>
        <div style={{ display: "flex", gap: 16 }}>
          {OUTCOMES.map(({ key, label }) => (
            <div
              key={key}
              style={{
                display: "flex",
                flex: 1,
                flexDirection: "column",
                gap: 8,
                padding: "18px 24px",
                border: `1px solid ${RULE}`,
                borderRadius: 18,
              }}
            >
              <span
                style={{
                  fontSize: 20,
                  letterSpacing: "0.12em",
                  textTransform: "uppercase",
                  color: MUTED,
                }}
              >
                {label}
              </span>
              <span
                style={{
                  fontSize: 36,
                  fontWeight: 600,
                  color: BRAND.colors.paper,
                }}
              >
                {pool ? formatMultiple(pool.oddsBySelection[key]) : "—"}
              </span>
            </div>
          ))}
        </div>

        <div
          style={{
            display: "flex",
            alignItems: "center",
            justifyContent: "space-between",
          }}
        >
          <span style={{ fontSize: 26, color: MUTED }}>
            {pool
              ? `Pot ${formatToken(pool.totalStake, TOKEN_DECIMALS)} ${TOKEN_SYMBOL}`
              : "Pari-mutuel football pools"}
          </span>
          <span
            style={{
              fontSize: 22,
              letterSpacing: "0.18em",
              textTransform: "uppercase",
              color: MUTED,
            }}
          >
            sachet.market
          </span>
        </div>
      </div>
    </div>,
    POOL_SOCIAL_SIZE,
  );
}
