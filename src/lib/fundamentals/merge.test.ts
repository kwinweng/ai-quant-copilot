import { describe, it, expect } from "vitest";
import { mergeFundamentals } from "./merge";
import type { FundamentalSnapshot } from "./types";

const yahoo: FundamentalSnapshot = {
  ticker: "AAPL",
  source: "yahoo",
  fiscalDate: new Date("2024-09-30"),
  pe: 30,
  pb: 50,
  ps: 8,
  evEbitda: 22,
  roe: 150, // Yahoo says 150% (TTM)
  grossMargin: 45,
  debtToEquity: 1.5,
  revenueGrowth: 5,
  epsGrowth: 8,
};

const sec: FundamentalSnapshot = {
  ticker: "AAPL",
  source: "sec",
  fiscalDate: new Date("2024-09-28"), // SEC fiscal year-end is slightly different
  reportedAt: new Date("2024-11-01"),
  // SEC has no price-dependent ratios:
  pe: undefined,
  pb: undefined,
  ps: undefined,
  evEbitda: undefined,
  // SEC computes its own ratios from filings:
  roe: 100, // simplified self-computed ROE
  roic: 28,
  grossMargin: 46,
  debtToEquity: 1.4,
  revenueGrowth: 4,
  epsGrowth: undefined, // disabled in PIT path (Sprint #1 C4)
};

describe("mergeFundamentals — overall priority policy", () => {
  it("returns undefined when both inputs are undefined", () => {
    expect(mergeFundamentals(undefined, undefined)).toBeUndefined();
  });

  it("returns SEC-only fields if Yahoo is absent", () => {
    const out = mergeFundamentals(undefined, sec)!;
    expect(out.source).toBe("merged");
    expect(out.roic).toBe(28); // SEC-only
    expect(out.roe).toBe(100);
    expect(out.pe).toBeUndefined(); // Yahoo-only field, no fallback
  });

  it("returns Yahoo-only fields if SEC is absent", () => {
    const out = mergeFundamentals(yahoo, undefined)!;
    expect(out.source).toBe("merged");
    expect(out.pe).toBe(30);
    expect(out.roe).toBe(150);
    expect(out.reportedAt).toBeUndefined(); // SEC-only PIT anchor
  });
});

describe("mergeFundamentals — Value fields (Yahoo wins)", () => {
  it("PE / PB / PS / EV-EBITDA always come from Yahoo", () => {
    const out = mergeFundamentals(yahoo, sec)!;
    expect(out.pe).toBe(30);
    expect(out.pb).toBe(50);
    expect(out.ps).toBe(8);
    expect(out.evEbitda).toBe(22);
  });
});

describe("mergeFundamentals — Quality fields (SEC wins, Yahoo fallback)", () => {
  it("uses SEC ROE when SEC has it (the PIT-correct number)", () => {
    const out = mergeFundamentals(yahoo, sec)!;
    expect(out.roe).toBe(100); // SEC's number, not Yahoo's 150
    expect(out.grossMargin).toBe(46); // SEC
    expect(out.debtToEquity).toBe(1.4); // SEC
  });

  it("falls back to Yahoo when SEC's field is undefined", () => {
    const secNoROE: FundamentalSnapshot = {
      ...sec,
      roe: undefined,
      grossMargin: undefined,
    };
    const out = mergeFundamentals(yahoo, secNoROE)!;
    expect(out.roe).toBe(150); // falls back to Yahoo
    expect(out.grossMargin).toBe(45);
  });

  it("ROIC: SEC has it, Yahoo doesn't (Yahoo's quoteSummary doesn't expose it)", () => {
    const out = mergeFundamentals(yahoo, sec)!;
    expect(out.roic).toBe(28);
  });
});

describe("mergeFundamentals — Growth fields (SEC preferred)", () => {
  it("revenueGrowth: SEC wins", () => {
    const out = mergeFundamentals(yahoo, sec)!;
    expect(out.revenueGrowth).toBe(4);
  });

  it("epsGrowth falls back to Yahoo when SEC disabled (Sprint #1 C4)", () => {
    // SEC's epsGrowth is undefined (split-contamination), so Yahoo's value
    // should still surface in the merged output.
    const out = mergeFundamentals(yahoo, sec)!;
    expect(out.epsGrowth).toBe(8); // Yahoo
  });
});

describe("mergeFundamentals — metadata", () => {
  it("source is 'merged'", () => {
    expect(mergeFundamentals(yahoo, sec)?.source).toBe("merged");
  });

  it("preserves SEC reportedAt as the PIT anchor", () => {
    const out = mergeFundamentals(yahoo, sec)!;
    expect(out.reportedAt?.toISOString().slice(0, 10)).toBe("2024-11-01");
  });

  it("fiscalDate is the most recent of the two inputs", () => {
    // Yahoo: 2024-09-30, SEC: 2024-09-28 → expect Yahoo's (later)
    const out = mergeFundamentals(yahoo, sec)!;
    expect(out.fiscalDate.toISOString().slice(0, 10)).toBe("2024-09-30");
  });
});
