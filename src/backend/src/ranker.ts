/// <reference types="@caido/sdk-backend" />

import type { SDK } from "caido:plugin";
import { CohortSummary, RankedResult } from "../../shared/types.js";
import { mapPool } from "./mapPool.js";
import { extractFeatures } from "./ranking/featureExtractor.js";
import { scoreFeatureSets } from "./ranking/burpScorer.js";
import { FEATURE_NAMES, type FeatureName, type ResponseFeatureSet } from "./ranking/types.js";

export const FETCH_CONCURRENCY = 50;

function minMaxNormalize(
  rawRank: number,
  min: number,
  max: number,
): number {
  if (max === min) {
    return 0;
  }
  return Math.round(((rawRank - min) / (max - min)) * 100);
}

function extractMimeType(contentType: string): string {
  return contentType ? contentType.split(";")[0].trim().toLowerCase() : "unknown";
}

function statusClass(code: number): string {
  if (code >= 500) return "5xx";
  if (code >= 400) return "4xx";
  if (code >= 300) return "3xx";
  if (code >= 200) return "2xx";
  return "other";
}

function buildCohortSummary(
  featureSets: ResponseFeatureSet[],
  statusCodes: number[],
): CohortSummary {
  const responded = featureSets.filter((s) => s.hasResponse);
  const size = responded.length;

  let dynamicFeatureCount = 0;
  for (const name of FEATURE_NAMES) {
    const distinct = new Set(
      responded.map((s) => s.values[name]),
    );
    if (distinct.size > 1) {
      dynamicFeatureCount++;
    }
  }

  const statusClasses = new Set(statusCodes.map(statusClass));
  const warnings: string[] = [];

  if (size < 5) {
    warnings.push(`Small cohort (${size} responses). Rankings may be unreliable.`);
  }

  const heterogeneous =
    dynamicFeatureCount >= 4 || statusClasses.size >= 2;
  if (heterogeneous) {
    warnings.push(
      `Heterogeneous cohort (${dynamicFeatureCount} varying features, ${statusClasses.size} status classes). Compare like with like when possible.`,
    );
  }

  return {
    size,
    dynamicFeatureCount,
    warnings,
  };
}

export class RankingEngine {
  public async rank(sdk: SDK, ids: string[]): Promise<RankedResult[]> {
    if (ids.length === 0) return [];

    const requests = await mapPool(ids, FETCH_CONCURRENCY, async (id) => {
      const record = await sdk.requests.get(id);
      return { id, record };
    });

    const featureSets: ResponseFeatureSet[] = requests
      .filter((r) => r.record)
      .map(({ id, record }) => {
        const hasResponse = Boolean(record!.response);
        if (!hasResponse) {
          return {
            requestId: id,
            hasResponse: false,
            values: Object.fromEntries(
              FEATURE_NAMES.map((n) => [n, 0]),
            ) as Record<FeatureName, number>,
          };
        }

        const resp = record!.response!;
        const bodyBytes = resp.getBody()?.toRaw() ?? new Uint8Array();
        const rawResponseBytes = resp.getRaw()?.toBytes() ?? new Uint8Array();
        return {
          requestId: id,
          hasResponse: true,
          values: extractFeatures({
            statusCode: resp.getCode() || 0,
            bodyBytes,
            contentLengthHeader: resp.getHeader("Content-Length")?.[0],
            rawResponseBytes,
          }),
        };
      });

    const scored = scoreFeatureSets(featureSets);
    const scoredById = new Map(scored.map((s) => [s.requestId, s]));

    const responded = requests.filter((r) => r.record?.response);
    if (responded.length === 0) return [];

    let minRaw = Infinity;
    let maxRaw = -Infinity;
    for (const r of responded) {
      const rawRank = scoredById.get(r.id)!.rawRank;
      if (rawRank < minRaw) minRaw = rawRank;
      if (rawRank > maxRaw) maxRaw = rawRank;
    }

    const statusCodes = responded.map(
      ({ record }) => record!.response!.getCode() || 0,
    );
    const cohortSummary = buildCohortSummary(featureSets, statusCodes);

    const results: RankedResult[] = responded.map(({ id, record }) => {
      const req = record!.request;
      const resp = record!.response!;
      const score = scoredById.get(id)!;
      const displayRank = minMaxNormalize(score.rawRank, minRaw, maxRaw);
      const bodyLen = resp.getBody()?.length || 0;
      const contributions = [...score.contributions].sort(
        (a, b) => b.contribution - a.contribution,
      );

      return {
        id,
        rank: displayRank,
        rawRank: score.rawRank,
        method: req.getMethod() || "",
        url: req.getUrl() || "",
        statusCode: resp.getCode() || 0,
        contentLength: bodyLen,
        contentType: extractMimeType(resp.getHeader("Content-Type")?.[0] || ""),
        location: resp.getHeader("Location")?.[0],
        contributions,
        cohortSummary,
      };
    });

    return results.sort((a, b) => {
      if (b.rawRank !== a.rawRank) {
        return b.rawRank - a.rawRank;
      }
      return String(a.id).localeCompare(String(b.id));
    });
  }
}
