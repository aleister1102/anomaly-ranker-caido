/// <reference types="@caido/sdk-backend" />

import type { SDK } from "caido:plugin";
import { SimHash } from "./simhash.js";
import { RankedResult } from "../../shared/types.js";

export class RankingEngine {
  /**
   * Ranks a list of requests by anomaly.
   */
  public async rank(sdk: SDK, ids: string[]): Promise<RankedResult[]> {
    if (ids.length === 0) return [];

    const requests = await Promise.all(
      ids.map(async (id) => {
        const record = await sdk.requests.get(id);
        return { id, record };
      })
    );

    const validRequests = requests.filter(r => r.record && r.record.response);
    if (validRequests.length === 0) return [];

    const total = validRequests.length;
    const MAX_BODY_BYTES = 50 * 1024; // 50KB

    // 1. Gather statistical data
    const lengths = new Float64Array(total);
    const fingerprints = new BigUint64Array(total);
    const statusCodes = new Int32Array(total);
    const mimeTypes: string[] = [];
    
    const statusFreq: Record<number, number> = {};
    const typeFreq: Record<string, number> = {};

    for (let i = 0; i < total; i++) {
      const { record } = validRequests[i];
      const resp = record!.response!;
      
      const len = resp.getBody()?.length || 0;
      lengths[i] = len;

      const code = resp.getCode() || 0;
      statusCodes[i] = code;
      statusFreq[code] = (statusFreq[code] || 0) + 1;

      const type = this.extractMimeType(resp.getHeader("Content-Type")?.[0] || "");
      mimeTypes[i] = type;
      typeFreq[type] = (typeFreq[type] || 0) + 1;

      const body = (resp.getBody()?.toText() || "").slice(0, MAX_BODY_BYTES);
      fingerprints[i] = SimHash.calculate(body);
    }

    // 2. Compute statistical aggregates
    let sumLen = 0;
    for (let i = 0; i < total; i++) sumLen += lengths[i];
    const meanLen = sumLen / total;
    
    let sumSqDiff = 0;
    for (let i = 0; i < total; i++) sumSqDiff += Math.pow(lengths[i] - meanLen, 2);
    const stdDevLen = Math.sqrt(sumSqDiff / total) || 1;

    // Find the most frequent fingerprint (centroid)
    const fpFreq: Map<bigint, number> = new Map();
    let maxFpFreq = 0;
    let centroid = 0n;
    for (let i = 0; i < total; i++) {
      const fp = fingerprints[i];
      const f = (fpFreq.get(fp) || 0) + 1;
      fpFreq.set(fp, f);
      if (f > maxFpFreq) {
        maxFpFreq = f;
        centroid = fp;
      }
    }

    // 3. Calculate ranks
    const results: RankedResult[] = [];
    for (let i = 0; i < total; i++) {
      const { id, record } = validRequests[i];
      const req = record!.request;
      const resp = record!.response!;

      const len = lengths[i];
      const code = statusCodes[i];
      const type = mimeTypes[i];
      const fp = fingerprints[i];

      // Statistical scores (0-1)
      const lenOutlier = Math.min(Math.abs(len - meanLen) / (stdDevLen * 3), 1); // 3 sigma
      const statusRarity = 1 - (statusFreq[code] / total);
      const typeRarity = 1 - (typeFreq[type] / total);

      const statScore = (lenOutlier + statusRarity + typeRarity) / 3;

      // SimHash score (0-1)
      const hammingDist = SimHash.hammingDistance(fp, centroid);
      const simHashScore = hammingDist / 64;

      // Final rank (0-100)
      const finalRank = Math.round(((statScore * 0.5) + (simHashScore * 0.5)) * 100);

      results.push({
        id,
        rank: finalRank,
        method: req.getMethod() || "",
        url: req.getUrl() || "",
        statusCode: code,
        contentLength: len,
        contentType: type,
        location: resp.getHeader("Location")?.[0],
      });
    }

    // Sort by rank descending
    return results.sort((a, b) => b.rank - a.rank);
  }

  private extractMimeType(contentType: string): string {
    return contentType ? contentType.split(";")[0].trim().toLowerCase() : "unknown";
  }
}
