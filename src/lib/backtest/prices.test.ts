import { describe, it, expect } from "vitest";
import { classifyError } from "./prices";

// Phase 6.5 W2.2: classifyError is the deterministic edge of the fetch
// retry policy. We test it standalone because the rest of the fetcher
// requires hitting Yahoo (covered by the W2.4 smoke test instead).

describe("classifyError — Yahoo error categorization", () => {
  it("'Data doesn't exist' → no_data (no retry)", () => {
    // This is the canonical empty-window error from yahoo-finance2 — fires
    // for delisted tickers like BSC / MER where Yahoo returns nothing.
    const err = new Error(
      "Data doesn't exist for startDate = 754704000, endDate = 1293840000",
    );
    const c = classifyError(err);
    expect(c.status).toBe("no_data");
    expect(c.reason).toContain("Yahoo 无该窗口");
  });

  it("'Failed Yahoo Schema validation' → no_data (typical for ex-tickers)", () => {
    // ENRNQ et al. — Yahoo returns a malformed payload for these.
    const err = new Error(
      "Failed Yahoo Schema validation. See validation.md.",
    );
    const c = classifyError(err);
    expect(c.status).toBe("no_data");
    expect(c.reason).toContain("schema");
  });

  it("network / unknown error → transient (will retry)", () => {
    const err = new Error("ECONNRESET");
    const c = classifyError(err);
    expect(c.status).toBe("transient");
  });

  it("rate-limit message → transient (retry path)", () => {
    const err = new Error("HTTP 429 Too Many Requests");
    const c = classifyError(err);
    expect(c.status).toBe("transient");
  });

  it("plain string errors don't crash the classifier", () => {
    const c = classifyError("something went wrong");
    expect(c.status).toBe("transient");
    expect(typeof c.reason).toBe("string");
  });

  it("preserves the original error message for transient cases", () => {
    const err = new Error("timeout after 30s");
    const c = classifyError(err);
    expect(c.reason).toContain("timeout");
  });
});
