import { describe, expect, it, vi } from "vitest";
import { mapPool } from "../src/mapPool.js";

describe("mapPool", () => {
  it("preserves result order", async () => {
    const items = [1, 2, 3, 4, 5];
    const results = await mapPool(items, 3, async (item) => item * 10);
    expect(results).toEqual([10, 20, 30, 40, 50]);
  });

  it("respects the concurrency cap", async () => {
    let inFlight = 0;
    let maxInFlight = 0;
    const concurrency = 3;
    const items = Array.from({ length: 12 }, (_, i) => i);

    await mapPool(items, concurrency, async (item) => {
      inFlight++;
      maxInFlight = Math.max(maxInFlight, inFlight);
      await new Promise((resolve) => setTimeout(resolve, 5));
      inFlight--;
      return item;
    });

    expect(maxInFlight).toBeLessThanOrEqual(concurrency);
    expect(maxInFlight).toBeGreaterThan(1);
  });

  it("handles empty input", async () => {
    const fn = vi.fn(async (item: number) => item);
    const results = await mapPool([], 50, fn);
    expect(results).toEqual([]);
    expect(fn).not.toHaveBeenCalled();
  });
});
