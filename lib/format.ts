import { formatUnits, parseUnits } from "viem";

/**
 * Token amount formatting. Client-safe and dependency-light.
 *
 * Amounts are `bigint` base units; the UI renders trimmed decimal strings so no
 * `BigInt` ever crosses the RSC boundary.
 */

/** Format base units as a trimmed decimal string (`1234.56`). */
export function formatToken(
  value: bigint | string,
  decimals: number,
  maxFractionDigits = 4,
): string {
  const raw = typeof value === "string" ? BigInt(value) : value;
  const formatted = formatUnits(raw, decimals);
  const [whole, fraction = ""] = formatted.split(".");
  const trimmed = fraction.slice(0, maxFractionDigits).replace(/0+$/, "");
  return trimmed ? `${whole}.${trimmed}` : whole;
}

/** Parse a user-entered decimal string into base units, or `null` if invalid. */
export function parseToken(
  input: string,
  decimals: number,
): bigint | null {
  const trimmed = input.trim();
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
