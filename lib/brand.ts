import brand from "@/config/brand.json";

const { viewBox, inset, stroke } = brand.mark;
const far = viewBox - inset;

/**
 * Brand constants, derived from `config/brand.json`.
 *
 * That JSON is the single source of truth: the generated assets in
 * `public/brand` and `app/` (see `scripts/generate-brand-assets.mjs`) and every
 * React consumer read from it, so the mark geometry, wordmark, and colors can
 * never drift apart.
 */
export const BRAND = {
  name: brand.name,
  wordmark: brand.wordmark,
  tagline: brand.tagline,
  subtagline: brand.subtagline,
  description: brand.description,
  url: brand.url,
  colors: brand.colors,
  fontStack: brand.fontStack,
  wordmarkTrackingEm: brand.wordmarkTrackingEm,
  mark: {
    viewBox,
    inset,
    stroke,
    /** Side length of the square frame. */
    frameSize: far - inset,
    /** Lower-left half of the square, filled — the pool. */
    fillPoints: `${inset},${inset} ${inset},${far} ${far},${far}`,
  },
} as const;
