import { describe, expect, it } from "vitest";
import { scoreFeatureSets } from "../src/ranking/burpScorer.js";
import type { FeatureName, ResponseFeatureSet } from "../src/ranking/types.js";

function makeSet(
  requestId: string,
  values: Record<FeatureName, number>,
  hasResponse = true,
): ResponseFeatureSet {
  return { requestId, hasResponse, values };
}

const identicalValues: Record<FeatureName, number> = {
  statusCode: 200,
  contentLength: 100,
  bodyContent: 12345,
  wordCount: 5,
  lineCount: 2,
  headerNames: 999,
  colonCount: 10,
  visibleText: 111,
  visibleWordCount: 3,
  tagNames: 222,
};

describe("scoreFeatureSets", () => {
  it("gives zero contribution for constant attributes", () => {
    const sets = [
      makeSet("a", identicalValues),
      makeSet("b", { ...identicalValues }),
      makeSet("c", { ...identicalValues }),
    ];
    const results = scoreFeatureSets(sets);
    expect(results.every((r) => r.rawRank === 0)).toBe(true);
    expect(results.every((r) => r.contributions.length === 0)).toBe(true);
  });

  it("uses weight 0.81 when k=2", () => {
    const sets = [
      makeSet("a", { ...identicalValues, statusCode: 200 }),
      makeSet("b", { ...identicalValues, statusCode: 200 }),
      makeSet("c", { ...identicalValues, statusCode: 500 }),
    ];
    const results = scoreFeatureSets(sets);
    const byId = Object.fromEntries(results.map((r) => [r.requestId, r]));

    expect(byId.a.rawRank).toBe(4050);
    expect(byId.b.rawRank).toBe(4050);
    expect(byId.c.rawRank).toBe(8100);

    const statusContrib = byId.c.contributions.find((c) => c.feature === "statusCode");
    expect(statusContrib?.weight).toBeCloseTo(0.81);
    expect(statusContrib?.distinctValues).toBe(2);
  });

  it("uses weight 0.9**10 when k=10", () => {
    const values: Record<FeatureName, number> = { ...identicalValues };
    const sets: ResponseFeatureSet[] = [];
    for (let i = 0; i < 10; i++) {
      sets.push(makeSet(`r${i}`, { ...values, statusCode: 200 + i }));
    }
    const results = scoreFeatureSets(sets);
    const contrib = results[0].contributions.find((c) => c.feature === "statusCode");
    expect(contrib?.weight).toBeCloseTo(Math.pow(0.9, 10));
  });

  it("ranks rarer values higher than common ones", () => {
    const sets = [
      makeSet("common", { ...identicalValues, statusCode: 200 }),
      makeSet("common2", { ...identicalValues, statusCode: 200 }),
      makeSet("rare", { ...identicalValues, statusCode: 500 }),
    ];
    const results = scoreFeatureSets(sets);
    const rare = results.find((r) => r.requestId === "rare")!;
    const common = results.find((r) => r.requestId === "common")!;
    expect(rare.rawRank).toBeGreaterThan(common.rawRank);
  });

  it("is invariant to input order", () => {
    const sets = [
      makeSet("a", { ...identicalValues, statusCode: 200 }),
      makeSet("b", { ...identicalValues, statusCode: 500 }),
      makeSet("c", { ...identicalValues, statusCode: 200 }),
    ];
    const shuffled = [sets[2], sets[0], sets[1]];
    const forward = scoreFeatureSets(sets);
    const reversed = scoreFeatureSets(shuffled);
    const byId = Object.fromEntries(reversed.map((r) => [r.requestId, r.rawRank]));
    for (const r of forward) {
      expect(byId[r.requestId]).toBe(r.rawRank);
    }
  });

  it("preserves ordering for duplicate datasets", () => {
    const sets = [
      makeSet("a", { ...identicalValues, statusCode: 200 }),
      makeSet("b", { ...identicalValues, statusCode: 500 }),
    ];
    const first = scoreFeatureSets(sets);
    const second = scoreFeatureSets(sets);
    expect(second.map((r) => r.rawRank)).toEqual(first.map((r) => r.rawRank));
  });

  it("returns -1 for no-response entries", () => {
    const sets = [
      makeSet("a", identicalValues, false),
      makeSet("b", { ...identicalValues, statusCode: 500 }),
      makeSet("c", { ...identicalValues, statusCode: 200 }),
    ];
    const results = scoreFeatureSets(sets);
    const noResp = results.find((r) => r.requestId === "a")!;
    expect(noResp.rawRank).toBe(-1);
    expect(noResp.contributions).toEqual([]);
  });

  it("excludes no-response entries from frequency tables", () => {
    const sets = [
      makeSet("a", { ...identicalValues, statusCode: 999 }, false),
      makeSet("b", { ...identicalValues, statusCode: 200 }),
      makeSet("c", { ...identicalValues, statusCode: 200 }),
    ];
    const results = scoreFeatureSets(sets);
    expect(results.find((r) => r.requestId === "a")!.rawRank).toBe(-1);
    expect(results.find((r) => r.requestId === "b")!.rawRank).toBe(0);
    expect(results.find((r) => r.requestId === "c")!.rawRank).toBe(0);
  });
});
