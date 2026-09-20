/** Shared formatting for pool odds/stakes. */
export { formatToken, parseToken } from "@/lib/format";

/** Display a pari-mutuel multiple like `3.42×`, or `—` when unpriced. */
export function formatMultiple(multiple: number | null): string {
  if (multiple === null) return "—";
  return `${multiple.toFixed(2)}×`;
}
