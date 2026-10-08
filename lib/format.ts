import { formatUnits, parseUnits } from "viem";

/**
 * Token amount formatting. Client-safe and dependency-light.
 *
 * Amounts are `bigint` base units; the UI renders trimmed decimal strings so no
 * `BigInt` ever crosses the RSC boundary. Displayed values group the integer
 * part with locale separators (`1,234.5`); the fixed `en-US` locale keeps the
 * server and client markup identical.
 */

/**
 * Fixed locale so RSC and browser render the same separators (no hydration
 * mismatch). Grouping is applied to the integer part only.
 */
const GROUPING = new Intl.NumberFormat("en-US");

/** Split base units into a signed integer part and trimmed fraction digits. */
function splitToken(
  value: bigint | string,
  decimals: number,
  maxFractionDigits: number,
): { whole: string; fraction: string } {
  const raw = typeof value === "string" ? BigInt(value) : value;
  const formatted = formatUnits(raw, decimals);
  const [whole, fraction = ""] = formatted.split(".");
  return {
    whole,
    fraction: fraction.slice(0, maxFractionDigits).replace(/0+$/, ""),
  };
}

/** Format base units as a grouped decimal string (`1,234.56`). */
export function formatToken(
  value: bigint | string,
  decimals: number,
  maxFractionDigits = 4,
): string {
  const { whole, fraction } = splitToken(value, decimals, maxFractionDigits);
  const grouped = GROUPING.format(BigInt(whole));
  return fraction ? `${grouped}.${fraction}` : grouped;
}

/**
 * Like `formatToken` but without grouping. Use for editable inputs, where a
 * thousands separator would be re-parsed as the user types.
 */
export function formatTokenInput(
  value: bigint | string,
  decimals: number,
  maxFractionDigits = 18,
): string {
  const { whole, fraction } = splitToken(value, decimals, maxFractionDigits);
  return fraction ? `${whole}.${fraction}` : whole;
}

/** Parse a user-entered decimal string into base units, or `null` if invalid. */
export function parseToken(
  input: string,
  decimals: number,
): bigint | null {
  const trimmed = input.trim().replace(/,/g, "");
  if (!/^\d*\.?\d*$/.test(trimmed) || trimmed === "" || trimmed === ".") {
    return null;
  }
  try {
    return parseUnits(trimmed as `${number}`, decimals);
  } catch {
    return null;
  }
}

/** Short `0x1234…abcd` display form. */
export function shortAddress(address: string): string {
  return address.length > 10
    ? `${address.slice(0, 6)}…${address.slice(-4)}`
    : address;
}
