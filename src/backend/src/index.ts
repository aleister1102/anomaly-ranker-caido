/// <reference types="@caido/sdk-backend" />

import type { APISDK, SDK } from "caido:plugin";
import { RankingEngine } from "./ranker.js";
import { HistoryScanner } from "./scanner.js";
import { BackendEndpoints, RankedResult, ScanHistoryOptions } from "../../shared/types.js";

let cachedResults: RankedResult[] = [];
const cache = new Map<string, RankedResult[]>();
const MAX_CACHE_SIZE = 50;

function getCacheKey(type: "ids" | "scan", data: string[] | ScanHistoryOptions): string {
  if (type === "ids") {
    const ids = data as string[];
    return `ids:${ids.slice().sort().join(",")}`;
  } else {
    const opts = data as ScanHistoryOptions;
    return `scan:${opts.limit}:${opts.scanAll}:${opts.filter || ""}`;
  }
}

function addToCache(key: string, results: RankedResult[]) {
  if (cache.size >= MAX_CACHE_SIZE) {
    const firstKey = cache.keys().next().value;
    if (firstKey !== undefined) cache.delete(firstKey);
  }
  cache.set(key, results);
}

export async function init(sdk: SDK) {
  const api = sdk.api as APISDK<BackendEndpoints, Record<string, never>>;
  const engine = new RankingEngine();
  const scanner = new HistoryScanner();

  api.register("rankRequests", async (sdkInstance: SDK, ids: string[]) => {
    try {
      const cacheKey = getCacheKey("ids", ids);
      if (cache.has(cacheKey)) {
        sdkInstance.console.log("AnomalyRanker: Cache hit for rankRequests");
        const results = cache.get(cacheKey)!;
        cachedResults = results;
        return results;
      }

      sdkInstance.console.log(`AnomalyRanker: Ranking ${ids.length} requests...`);
      const results = await engine.rank(sdkInstance, ids);
      cachedResults = results;
      addToCache(cacheKey, results);
      return results;
    } catch (error: unknown) {
      sdkInstance.console.error("AnomalyRanker: rankRequests failed", error);
      throw error;
    }
  });

  api.register("scanHistory", async (sdkInstance: SDK, options) => {
    try {
      const cacheKey = getCacheKey("scan", options);
      if (cache.has(cacheKey)) {
        sdkInstance.console.log("AnomalyRanker: Cache hit for scanHistory");
        const results = cache.get(cacheKey)!;
        cachedResults = results;
        return results;
      }

      sdkInstance.console.log(`AnomalyRanker: Scanning history with limit=${options.limit}, scanAll=${options.scanAll}, filter="${options.filter || ""}"`);
      
      // Scan history to collect request IDs
      const ids = await scanner.scan(sdkInstance, options);
      
      if (ids.length === 0) {
        sdkInstance.console.log("AnomalyRanker: No requests found matching criteria");
        cachedResults = [];
        return [];
      }
      
      // Rank the collected requests
      const results = await engine.rank(sdkInstance, ids);
      cachedResults = results;
      addToCache(cacheKey, results);
      
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
