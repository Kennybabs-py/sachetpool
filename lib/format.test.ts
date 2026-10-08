import { describe, expect, it } from "vitest";

import { formatToken, formatTokenInput, parseToken } from "./format";

const D = 18;

describe("formatToken", () => {
  it("groups the integer part with locale separators", () => {
    expect(formatToken(10_000n * 10n ** 18n, D)).toBe("10,000");
    expect(formatToken(1_234_567n * 10n ** 18n, D)).toBe("1,234,567");
  });

  it("trims trailing fraction digits and zeros", () => {
    expect(formatToken(1_234_500_000_000_000_000n, D)).toBe("1.2345");
    expect(formatToken(1_500_000_000_000_000_000n, D)).toBe("1.5");
  });

  it("renders zero and negatives", () => {
    expect(formatToken(0n, D)).toBe("0");
    expect(formatToken(-5n * 10n ** 18n, D)).toBe("-5");
  });

  it("never exposes exponential notation for uint256-scale values", () => {
    expect(formatToken(10n ** 22n, D)).toBe("10,000");
  });
});

describe("formatTokenInput", () => {
  it("omits grouping so the value can be re-parsed from an input", () => {
    expect(formatTokenInput(10_000n * 10n ** 18n, D)).toBe("10000");
    expect(formatTokenInput(1_234_500_000_000_000_000n, D)).toBe("1.2345");
  });
});

describe("parseToken", () => {
  it("accepts grouped and plain decimal strings", () => {
    expect(parseToken("1,234.5", D)).toBe(1_234_500_000_000_000_000_000n);
    expect(parseToken("10", D)).toBe(10n * 10n ** 18n);
  });

  it("rejects invalid input", () => {
    expect(parseToken("", D)).toBeNull();
    expect(parseToken(".", D)).toBeNull();
    expect(parseToken("1e+22", D)).toBeNull();
  });
});
