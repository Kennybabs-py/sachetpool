/**
 * Money coercion for the Postgres mirror.
 *
 * Token amounts are `uint256`-scale and overflow Postgres `bigint`, so the
 * mirrored columns are `numeric(78, 0)` and Prisma returns them as `Decimal`
 * objects. Arithmetic in the app stays `bigint`; these helpers convert at the
 * Prisma boundary and never go through exponential notation (`Decimal.toString`
 * renders large values as `1e+22`, which `BigInt` rejects).
 */

/** Structural type for a Prisma `Decimal` (and anything decimal-like). */
export interface DecimalLike {
  toFixed(dp?: number): string;
}

export function isDecimalLike(value: unknown): value is DecimalLike {
  return (
    typeof value === "object" &&
    value !== null &&
    typeof (value as DecimalLike).toFixed === "function"
  );
}

/** Coerce a mirrored amount to `bigint`. */
export function toBigInt(
  value: DecimalLike | bigint | number | string | null | undefined,
): bigint {
  if (value === null || value === undefined) return 0n;
  if (typeof value === "bigint") return value;
  if (typeof value === "object") return BigInt(value.toFixed(0));
  return BigInt(value);
}

/** Serialise any amount to a plain, non-exponential integer string. */
export function toAmountString(value: DecimalLike | bigint): string {
  return typeof value === "bigint" ? value.toString() : value.toFixed(0);
}
