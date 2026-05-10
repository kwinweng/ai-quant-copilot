import { describe, it, expect } from "vitest";
import {
  UNIVERSE,
  TICKER_TO_CIK,
  rebalanceMonthsOf,
  REBALANCE_MONTHS,
} from "./universe";
import { defaultUniverseProvider } from "./universeProvider";

describe("UNIVERSE constant (Phase 6 expanded)", () => {
  it("contains exactly the 60 tickers Phase 6 designed", () => {
    expect(UNIVERSE).toHaveLength(60);
  });

  it("has no duplicate tickers", () => {
    const set = new Set(UNIVERSE);
    expect(set.size).toBe(UNIVERSE.length);
  });

  it("all tickers are uppercase ASCII (or hyphenated for share classes)", () => {
    for (const t of UNIVERSE) {
      expect(t).toMatch(/^[A-Z]+(-[A-Z])?$/);
    }
  });

  it("includes representative tickers from each major GICS sector", () => {
    // Spot-check a few from each sector to catch accidental sector
    // monoculture if someone trims the list later.
    const tickers = new Set(UNIVERSE);
    expect(tickers.has("AAPL")).toBe(true); // tech
    expect(tickers.has("JPM")).toBe(true); // financials
    expect(tickers.has("JNJ")).toBe(true); // healthcare
    expect(tickers.has("HD")).toBe(true); // consumer disc
    expect(tickers.has("WMT")).toBe(true); // consumer staples
    expect(tickers.has("XOM")).toBe(true); // energy
    expect(tickers.has("BA")).toBe(true); // industrials
    expect(tickers.has("DIS")).toBe(true); // communications
  });

  it("includes non-pure-winner names for partial survivor-bias mitigation", () => {
    // Phase 6 explicitly added these "fading large-caps" so the universe
    // isn't 100% perpetual compounders. If a future change drops them
    // without replacement, the bias narrative shifts back.
    const tickers = new Set(UNIVERSE);
    for (const t of ["INTC", "IBM", "GE", "F", "KSS", "X"]) {
      expect(tickers.has(t)).toBe(true);
    }
  });
});

describe("TICKER_TO_CIK consistency", () => {
  it("has a CIK entry for every ticker in UNIVERSE", () => {
    const missing = UNIVERSE.filter((t) => !TICKER_TO_CIK[t]);
    expect(missing).toEqual([]);
  });

  it("every CIK is a 10-digit zero-padded string", () => {
    for (const [ticker, cik] of Object.entries(TICKER_TO_CIK)) {
      expect(cik).toMatch(/^\d{10}$/);
      expect(cik.length).toBe(10);
      // No accidental non-leading-zero CIKs (would silently 404 SEC API)
      expect(cik).not.toMatch(/^[^0]\d{0,8}$/);
      void ticker;
    }
  });

  it("has no duplicate CIKs (prevents accidentally aliasing two tickers to one filer)", () => {
    const ciks = Object.values(TICKER_TO_CIK);
    const unique = new Set(ciks);
    expect(unique.size).toBe(ciks.length);
  });
});

describe("rebalanceMonthsOf", () => {
  it("maps known labels (Chinese + English, mixed case) to month counts", () => {
    expect(rebalanceMonthsOf("月度")).toBe(1);
    expect(rebalanceMonthsOf("季度")).toBe(3);
    expect(rebalanceMonthsOf("Monthly")).toBe(1);
    expect(rebalanceMonthsOf("Quarterly")).toBe(3);
    expect(rebalanceMonthsOf("monthly")).toBe(1);
    expect(rebalanceMonthsOf("quarterly")).toBe(3);
  });

  it("falls back to 1 (monthly) for unknown labels", () => {
    expect(rebalanceMonthsOf("annually")).toBe(1);
    expect(rebalanceMonthsOf("")).toBe(1);
  });

  it("REBALANCE_MONTHS is the canonical map", () => {
    expect(Object.keys(REBALANCE_MONTHS).length).toBeGreaterThan(0);
    for (const v of Object.values(REBALANCE_MONTHS)) {
      expect([1, 3]).toContain(v);
    }
  });
});

describe("defaultUniverseProvider (Phase 6 static impl)", () => {
  it("returns UNIVERSE for any month (static)", () => {
    expect(defaultUniverseProvider.tickersAt("2014-01")).toEqual(UNIVERSE);
    expect(defaultUniverseProvider.tickersAt("2024-12")).toEqual(UNIVERSE);
  });

  it("allTickers() returns the same list as UNIVERSE", () => {
    expect(defaultUniverseProvider.allTickers()).toEqual(UNIVERSE);
  });

  it("description names the list size and discloses the bias profile", () => {
    const desc = defaultUniverseProvider.description();
    expect(desc).toContain(String(UNIVERSE.length));
    expect(desc).toContain("幸存者偏差");
  });
});
