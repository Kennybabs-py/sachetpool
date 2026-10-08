import { BRAND } from "@/lib/brand";
import { cn } from "@/lib/utils";

/**
 * The Sachet Pool mark: a square, half filled along the diagonal.
 *
 * Renders from `config/brand.json` with `currentColor`, so it tracks the app's
 * light/dark theme and matches the generated assets in `public/brand` exactly.
 */
export function LogoMark({ className }: { className?: string }) {
  return (
    <svg
      viewBox={`0 0 ${BRAND.mark.viewBox} ${BRAND.mark.viewBox}`}
      aria-hidden
      className={cn("shrink-0", className)}
    >
      <rect
        x={BRAND.mark.inset}
        y={BRAND.mark.inset}
        width={BRAND.mark.frameSize}
        height={BRAND.mark.frameSize}
        fill="none"
        stroke="currentColor"
        strokeWidth={BRAND.mark.stroke}
      />
      <polygon points={BRAND.mark.fillPoints} fill="currentColor" />
    </svg>
  );
}

/** Typographic wordmark: mono, uppercase, wide tracking. */
export function LogoWordmark({ className }: { className?: string }) {
  return (
    <span
      className={cn("font-mono leading-none font-medium uppercase", className)}
      style={{ letterSpacing: `${BRAND.wordmarkTrackingEm}em` }}
    >
      {BRAND.wordmark}
    </span>
  );
}

/** Mark + wordmark, the default brand lockup. */
export function LogoLockup({
  className,
  markClassName,
  wordmarkClassName,
}: {
  className?: string;
  markClassName?: string;
  wordmarkClassName?: string;
}) {
  return (
    <span className={cn("inline-flex items-center gap-2.5", className)}>
      <LogoMark className={cn("size-4", markClassName)} />
      <LogoWordmark className={cn("text-xs", wordmarkClassName)} />
    </span>
  );
}
