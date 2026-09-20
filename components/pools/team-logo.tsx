"use client";

import { useState } from "react";
import { cn } from "@/lib/utils";

/**
 * Team crest. External logo URLs (API-Football) aren't whitelisted for
 * `next/image` and the provider host can change, so we use a plain <img> and
 * fall back to the team's initials when the logo is missing or fails to load.
 */
export function TeamLogo({
  name,
  src,
  className,
}: {
  name: string;
  src: string | null;
  className?: string;
}) {
  const [failed, setFailed] = useState(false);
  const showImg = Boolean(src) && !failed;

  return (
    <span
      className={cn(
        "flex size-9 shrink-0 items-center justify-center overflow-hidden rounded-full bg-muted text-xs font-semibold text-muted-foreground",
        className,
      )}
      aria-hidden
    >
      {showImg ? (
        // eslint-disable-next-line @next/next/no-img-element -- external crest, no next/image host configured
        <img
          src={src!}
          alt=""
          className="size-full object-contain"
          loading="lazy"
          onError={() => setFailed(true)}
        />
      ) : (
        initials(name)
      )}
    </span>
  );
}

function initials(name: string): string {
  return name
    .split(/\s+/)
    .slice(0, 2)
    .map((word) => word[0]?.toUpperCase() ?? "")
    .join("");
}
