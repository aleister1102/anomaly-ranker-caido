/// <reference types="@caido/sdk-backend" />

import type { APISDK, SDK } from "caido:plugin";
import { RankingEngine } from "./ranker.js";
import { HistoryScanner } from "./scanner.js";
import { ResultsCache } from "./cache.js";
import { BackendEndpoints, RankedResult, ScanHistoryOptions } from "../../shared/types.js";

let cachedResults: RankedResult[] = [];
const cache = new ResultsCache(50);

export async function init(sdk: SDK) {
  const api = sdk.api as APISDK<BackendEndpoints, Record<string, never>>;
  const engine = new RankingEngine();
  const scanner = new HistoryScanner();

  api.register("rankRequests", async (sdkInstance: SDK, ids: string[]) => {
    try {
      const cacheKey = ResultsCache.createKey("ids", ids);
      const cached = cache.get(cacheKey);
      
      if (cached) {
        sdkInstance.console.log("AnomalyRanker: Cache hit for rankRequests");
        cachedResults = cached;
        return cached;
      }

      sdkInstance.console.log(`AnomalyRanker: Ranking ${ids.length} requests...`);
      const results = await engine.rank(sdkInstance, ids);
      cachedResults = results;
      cache.set(cacheKey, results);
      return results;
    } catch (error: unknown) {
      sdkInstance.console.error("AnomalyRanker: rankRequests failed", error);
      throw error;
    }
  });

  api.register("scanHistory", async (sdkInstance: SDK, options: ScanHistoryOptions) => {
    try {
      const cacheKey = ResultsCache.createKey("scan", options);
      const cached = cache.get(cacheKey);
      
      if (cached) {
        sdkInstance.console.log("AnomalyRanker: Cache hit for scanHistory");
        cachedResults = cached;
        return cached;
      }

      sdkInstance.console.log(`AnomalyRanker: Scanning history with limit=${options.limit}, scanAll=${options.scanAll}, filter="${options.filter || ""}"`);
      
      const ids = await scanner.scan(sdkInstance, options);
      
      if (ids.length === 0) {
        sdkInstance.console.log("AnomalyRanker: No requests found matching criteria");
        cachedResults = [];
        return [];
      }
      
      const results = await engine.rank(sdkInstance, ids);
      cachedResults = results;
      cache.set(cacheKey, results);
      
      sdkInstance.console.log(`AnomalyRanker: Scan complete, ranked ${results.length} requests`);
      return results;
    } catch (error: unknown) {
      sdkInstance.console.error("AnomalyRanker: scanHistory failed", error);
      throw new Error(`Scan failed: ${error instanceof Error ? error.message : String(error)}`);
    }
  });

  api.register("getResults", async () => {
    return cachedResults;
  });

  api.register("clearResults", async () => {
    cachedResults = [];
    cache.clear();
  });

  api.register("validateHttpql", async (sdkInstance: SDK, filter: string) => {
    if (!filter || !filter.trim()) return { valid: true };
    try {
      sdkInstance.requests.query().filter(filter.trim());
      return { valid: true };
    } catch (error) {
      return { valid: false, error: error instanceof Error ? error.message : String(error) };
    }
  });

  sdk.console.log("AnomalyRanker backend initialized.");
}
