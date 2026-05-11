import { describe, it, expect } from "vitest";
import { diffTickerSets, tickerSetsEqual } from "./adviceDiff";

describe("diffTickerSets", () => {
  it("returns empty add/remove when sets match", () => {
    const d = diffTickerSets(["AAPL", "MSFT"], ["MSFT", "AAPL"]);
    expect(d.added).toEqual([]);
    expect(d.removed).toEqual([]);
    expect(d.unchanged).toEqual(["AAPL", "MSFT"]);
  });

  it("classifies added / removed / unchanged correctly", () => {
    const d = diffTickerSets(["AAPL", "MSFT", "TSLA"], ["MSFT", "NVDA", "AMD"]);
    expect(d.added).toEqual(["AMD", "NVDA"]);
    expect(d.removed).toEqual(["AAPL", "TSLA"]);
    expect(d.unchanged).toEqual(["MSFT"]);
  });

  it("deduplicates inputs", () => {
    const d = diffTickerSets(["AAPL", "AAPL"], ["AAPL", "MSFT", "MSFT"]);
    expect(d.current).toEqual(["AAPL"]);
    expect(d.suggested).toEqual(["AAPL", "MSFT"]);
    expect(d.added).toEqual(["MSFT"]);
    expect(d.removed).toEqual([]);
  });

  it("handles empty current (fresh portfolio)", () => {
    const d = diffTickerSets([], ["AAPL", "MSFT"]);
    expect(d.added).toEqual(["AAPL", "MSFT"]);
    expect(d.removed).toEqual([]);
    expect(d.unchanged).toEqual([]);
  });

  it("handles empty suggested (degenerate; everything removed)", () => {
    const d = diffTickerSets(["AAPL"], []);
    expect(d.added).toEqual([]);
    expect(d.removed).toEqual(["AAPL"]);
  });

  it("output arrays are alphabetically sorted", () => {
    const d = diffTickerSets(["ZZZ", "BBB"], ["YYY", "AAA"]);
    expect(d.added).toEqual(["AAA", "YYY"]);
    expect(d.removed).toEqual(["BBB", "ZZZ"]);
    expect(d.suggested).toEqual(["AAA", "YYY"]);
    expect(d.current).toEqual(["BBB", "ZZZ"]);
  });
});

describe("tickerSetsEqual", () => {
  it("true for identical sets regardless of order", () => {
    expect(tickerSetsEqual(["A", "B"], ["B", "A"])).toBe(true);
  });
  it("false on differing length", () => {
    expect(tickerSetsEqual(["A", "B"], ["A", "B", "C"])).toBe(false);
  });
  it("false on different content even at same length", () => {
    expect(tickerSetsEqual(["A", "B"], ["A", "C"])).toBe(false);
  });
  it("true on both empty", () => {
    expect(tickerSetsEqual([], [])).toBe(true);
  });
});
