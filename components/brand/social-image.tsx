import { readFileSync } from "node:fs";
import { join } from "node:path";

import { ImageResponse } from "next/og";

import { BRAND } from "@/lib/brand";

/**
 * Shared social-card renderer for `opengraph-image` and `twitter-image`, so the
 * two cards are always identical. The lockup is the generated
 * `lockup-on-dark.png` (992x192, drawn at 392x76), which means the card carries
 * the exact same mark and wordmark as the favicon and the site header.
 */
const lockup = readFileSync(
  join(process.cwd(), "public/brand/lockup-on-dark.png"),
).toString("base64");

export const SOCIAL_IMAGE_SIZE = { width: 1200, height: 630 };

const RULE = "rgba(237,237,237,0.14)";
const MUTED = "rgba(237,237,237,0.55)";

export function renderSocialImage() {
  return new ImageResponse(
    (
      <div
        style={{
          width: "100%",
          height: "100%",
          display: "flex",
          flexDirection: "column",
          justifyContent: "space-between",
          background: BRAND.colors.ink,
          padding: 80,
          position: "relative",
        }}
      >
        <div
          style={{
            position: "absolute",
            top: 40,
            left: 40,
            right: 40,
            bottom: 40,
            border: `1px solid ${RULE}`,
            display: "flex",
          }}
        />

        {/* Satori only renders plain <img>, not next/image. */}
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img
          src={`data:image/png;base64,${lockup}`}
          width={392}
          height={76}
          alt=""
        />

        <div style={{ display: "flex", flexDirection: "column" }}>
          <div
            style={{
              color: BRAND.colors.paper,
              fontSize: 66,
              lineHeight: 1.06,
              letterSpacing: "-0.035em",
            }}
          >
            {BRAND.tagline}
          </div>
          <div
            style={{
              color: MUTED,
              fontSize: 66,
              lineHeight: 1.06,
              letterSpacing: "-0.035em",
            }}
          >
            {BRAND.subtagline}
          </div>
        </div>

        <div
          style={{
            display: "flex",
            color: MUTED,
            fontSize: 22,
            letterSpacing: "0.18em",
            textTransform: "uppercase",
          }}
        >
          Pari-mutuel football · $SACH on Robinhood Chain
        </div>
      </div>
    ),
    SOCIAL_IMAGE_SIZE,
  );
}
