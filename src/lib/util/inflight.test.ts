import { describe, it, expect, vi } from "vitest";
import { withInflightDedup } from "./inflight";

describe("withInflightDedup", () => {
  it("only invokes loader once when called concurrently for the same key", async () => {
    const map = new Map<string, Promise<string>>();
    const loader = vi.fn(async () => {
      // Simulate non-trivial async work so the second caller arrives during
      // the first's pending state.
      await new Promise((r) => setTimeout(r, 30));
      return "result";
    });
    const [a, b, c] = await Promise.all([
      withInflightDedup(map, "AAPL", loader),
      withInflightDedup(map, "AAPL", loader),
      withInflightDedup(map, "AAPL", loader),
    ]);
    expect(loader).toHaveBeenCalledTimes(1);
    expect(a).toBe("result");
    expect(b).toBe("result");
    expect(c).toBe("result");
  });

  it("invokes loader once per distinct key", async () => {
    const map = new Map<string, Promise<string>>();
    const loader = vi.fn(async (k: string) => {
      await new Promise((r) => setTimeout(r, 10));
      return `result-${k}`;
    });
    const [a, b] = await Promise.all([
      withInflightDedup(map, "A", () => loader("A")),
      withInflightDedup(map, "B", () => loader("B")),
    ]);
    expect(loader).toHaveBeenCalledTimes(2);
    expect(a).toBe("result-A");
    expect(b).toBe("result-B");
  });

  it("clears the map entry after resolution so a new caller goes through", async () => {
    const map = new Map<string, Promise<string>>();
    const loader = vi.fn(async () => {
      await new Promise((r) => setTimeout(r, 10));
      return "x";
    });
    await withInflightDedup(map, "AAPL", loader);
    expect(map.has("AAPL")).toBe(false); // cleared after settle
    await withInflightDedup(map, "AAPL", loader);
    expect(loader).toHaveBeenCalledTimes(2); // second call goes through
  });

  it("clears the map entry when loader rejects (failure doesn't lock the key)", async () => {
    const map = new Map<string, Promise<string>>();
    const loader = vi.fn(async () => {
      await new Promise((r) => setTimeout(r, 10));
      throw new Error("boom");
    });
    await expect(withInflightDedup(map, "AAPL", loader)).rejects.toThrow("boom");
    expect(map.has("AAPL")).toBe(false);
    // Next call should go through, not be stuck on the old failed Promise.
    const goodLoader = vi.fn(async () => "ok");
    const result = await withInflightDedup(map, "AAPL", goodLoader);
    expect(result).toBe("ok");
    expect(goodLoader).toHaveBeenCalledTimes(1);
  });

  it("when a second caller arrives during the in-flight window, they share the same Promise", async () => {
    const map = new Map<string, Promise<string>>();
    let resolve!: (v: string) => void;
    const loader = vi.fn(
      () =>
        new Promise<string>((r) => {
          resolve = r;
        }),
    );
    const p1 = withInflightDedup(map, "AAPL", loader);
    const p2 = withInflightDedup(map, "AAPL", loader);
    expect(p1).toBe(p2); // identical Promise instance
    resolve("x");
    await Promise.all([p1, p2]);
    expect(loader).toHaveBeenCalledTimes(1);
  });
});
