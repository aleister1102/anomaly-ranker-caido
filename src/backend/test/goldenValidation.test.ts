import { describe, expect, it } from "vitest";
import { extractFeatures } from "../src/ranking/featureExtractor.js";
import { scoreFeatureSets } from "../src/ranking/burpScorer.js";
import type { ResponseFeatureSet } from "../src/ranking/types.js";
import { SCENARIOS, type FixtureScenario } from "./fixtures/goldenFixtures.js";

/**
 * Static golden validation (Decision 6): each scenario below isolates exactly
 * the roadmap fixture family it names - every other feature dimension is held
 * constant across its entries (see fixtures/goldenFixtures.ts). With k=2 dynamic
 * features at frequency 2 (baseline) vs 1 (anomaly), weight = 0.9^2 = 0.81, so
 * each dynamic feature contributes 0.81/2 = 0.405 to a baseline entry and
 * 0.81/1 = 0.81 to the anomalous one. For D dynamic features that gives
 * rawRank(baseline) = round(D * 0.405 * 10000) = D * 4050 and
 * rawRank(anomaly) = D * 8100 - hand-derived directly from the formula in
 * VALIDATION.md, with no dependency on the literal crc32 output.
 */

function score(scenario: FixtureScenario) {
  const sets: ResponseFeatureSet[] = scenario.entries.map((e) => ({
    requestId: e.id,
    hasResponse: true,
    values: extractFeatures(e.input),
  }));
  const results = scoreFeatureSets(sets);
  return Object.fromEntries(results.map((r) => [r.requestId, r.rawRank]));
}

describe("golden fixture validation", () => {
  it("status-code anomaly: D=1 dynamic feature", () => {
    const ranks = score(SCENARIOS[0]);
    expect(ranks).toEqual({ "status-b1": 4050, "status-b2": 4050, "status-x": 8100 });
  });

  it("content-length anomaly: D=1 dynamic feature", () => {
    const ranks = score(SCENARIOS[1]);
    expect(ranks).toEqual({ "cl-b1": 4050, "cl-b2": 4050, "cl-x": 8100 });
  });

  it("word-count anomaly: D=2 dynamic features (bodyContent + wordCount)", () => {
    const ranks = score(SCENARIOS[2]);
    expect(ranks).toEqual({ "word-b1": 8100, "word-b2": 8100, "word-x": 16200 });
  });

  it("line-count anomaly: D=2 dynamic features (bodyContent + lineCount)", () => {
    const ranks = score(SCENARIOS[3]);
    expect(ranks).toEqual({ "line-b1": 8100, "line-b2": 8100, "line-x": 16200 });
  });

  it("colon-count anomaly: D=1 dynamic feature", () => {
    const ranks = score(SCENARIOS[4]);
    expect(ranks).toEqual({ "colon-b1": 4050, "colon-b2": 4050, "colon-x": 8100 });
  });

  it("header-name diff: D=1 dynamic feature", () => {
    const ranks = score(SCENARIOS[5]);
    expect(ranks).toEqual({ "hdr-b1": 4050, "hdr-b2": 4050, "hdr-x": 8100 });
  });

  it("reflected-payload nonce / one-unique-body: D=2 dynamic features", () => {
    const ranks = score(SCENARIOS[6]);
    expect(ranks).toEqual({ "nonce-b1": 8100, "nonce-b2": 8100, "nonce-x": 16200 });
  });

  it("HTML visible-text change: D=2 dynamic features (bodyContent + visibleText)", () => {
    const ranks = score(SCENARIOS[7]);
    expect(ranks).toEqual({ "vt-b1": 8100, "vt-b2": 8100, "vt-x": 16200 });
  });

  it("HTML tag-structure change: D=2 dynamic features (bodyContent + tagNames)", () => {
    const ranks = score(SCENARIOS[8]);
    expect(ranks).toEqual({ "tag-b1": 8100, "tag-b2": 8100, "tag-x": 16200 });
  });

  it("two templates: symmetric noise, no entry flagged over the other", () => {
    const ranks = score(SCENARIOS[9]);
    expect(ranks).toEqual({
      "tmpl-a1": 12150,
      "tmpl-a2": 12150,
      "tmpl-b1": 12150,
      "tmpl-b2": 12150,
    });
  });

  it("malformed HTML: deterministic, no throw, D=3 dynamic features", () => {
    const scenario = SCENARIOS[10];
    expect(() => score(scenario)).not.toThrow();
    const ranks = score(scenario);
    expect(ranks).toEqual({ "mal-b1": 12150, "mal-b2": 12150, "mal-x": 24300 });
  });

  it("empty/binary body: deterministic, no throw, D=2 dynamic features", () => {
    const scenario = SCENARIOS[11];
    expect(() => score(scenario)).not.toThrow();
    const ranks = score(scenario);
    expect(ranks).toEqual({ "bin-b1": 8100, "bin-b2": 8100, "bin-x": 16200 });
  });

  it("every scenario ranks anomalies strictly above the shared baseline, descending", () => {
    for (const scenario of SCENARIOS) {
      const ranks = score(scenario);
      const values = Object.values(ranks);
      const max = Math.max(...values);
      const min = Math.min(...values);
      const sorted = [...values].sort((a, b) => b - a);
      expect(sorted[0]).toBe(max);
      expect(sorted[sorted.length - 1]).toBe(min);
    }
  });
});
