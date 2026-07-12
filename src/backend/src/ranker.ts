/// <reference types="@caido/sdk-backend" />

import type { SDK } from "caido:plugin";
import { RankedResult } from "../../shared/types.js";
import { extractFeatures } from "./ranking/featureExtractor.js";
import { scoreFeatureSets } from "./ranking/burpScorer.js";
import type { ResponseFeatureSet } from "./ranking/types.js";

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

export class RankingEngine {
  public async rank(sdk: SDK, ids: string[]): Promise<RankedResult[]> {
    if (ids.length === 0) return [];

    const requests = await Promise.all(
      ids.map(async (id) => {
        const record = await sdk.requests.get(id);
        return { id, record };
      }),
    );

    const featureSets: ResponseFeatureSet[] = requests
      .filter((r) => r.record)
      .map(({ id, record }) => {
        const hasResponse = Boolean(record!.response);
        if (!hasResponse) {
          return {
            requestId: id,
            hasResponse: false,
            values: extractFeatures({
              statusCode: 0,
              bodyBytes: new Uint8Array(),
            }),
          };
        }

        const resp = record!.response!;
        const bodyBytes = resp.getBody()?.toRaw() ?? new Uint8Array();
        return {
          requestId: id,
          hasResponse: true,
          values: extractFeatures({
            statusCode: resp.getCode() || 0,
            bodyBytes,
            contentLengthHeader: resp.getHeader("Content-Length")?.[0],
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

    const results: RankedResult[] = responded.map(({ id, record }) => {
      const req = record!.request;
      const resp = record!.response!;
      const score = scoredById.get(id)!;
      const displayRank = minMaxNormalize(score.rawRank, minRaw, maxRaw);
      const bodyLen = resp.getBody()?.length || 0;

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
