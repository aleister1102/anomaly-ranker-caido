/// <reference types="@caido/sdk-backend" />

import type { APISDK, SDK } from "caido:plugin";
import type {
  BackendEndpoints,
  RankingSnapshot,
  ScanAdvance,
  ScanHistoryOptions,
  ScanStatus,
} from "../../shared/types.js";
import { ResultsCache } from "./cache.js";
import {
  RankingEngine,
  type RankingOutput,
  type RankingSession,
} from "./ranker.js";
import {
  HistoryScanner,
  type HistoryScanState,
} from "./scanner.js";

const FIRST_PUBLISH_SIZE = 100;

interface ActiveScan {
  generation: number;
  startedAt: number;
  cancelled: boolean;
  options: ScanHistoryOptions;
  history: HistoryScanState;
  session: RankingSession;
  nextPublishSize: number;
}

function emptyOutput(): RankingOutput {
  return {
    results: [],
    summary: { size: 0, dynamicFeatureCount: 0, warnings: [] },
  };
}

function createSnapshot(
  output: RankingOutput,
  status: ScanStatus,
  scannedCount: number,
  startedAt: number,
  error?: string,
  visitedCount = scannedCount,
): RankingSnapshot {
  return {
    results: output.results,
    summary: output.summary,
    progress: {
      status,
      visitedCount,
      scannedCount,
      totalCount: undefined,
      rankedCount: output.summary.size,
      elapsedMs: Math.max(0, Date.now() - startedAt),
      error,
    },
  };
}

let scanGeneration = 0;
let activeScan: ActiveScan | undefined;
let currentOutput = emptyOutput();
let currentSnapshot = createSnapshot(currentOutput, "idle", 0, Date.now());
const cache = new ResultsCache<RankingOutput>(50);

function shouldCommit(generation: number): boolean {
  return generation === scanGeneration;
}


function commit(
  generation: number,
  output: RankingOutput,
  snapshot: RankingSnapshot,
): void {
  if (!shouldCommit(generation)) return;
  currentOutput = output;
  currentSnapshot = snapshot;
}

function finishScan(
  scan: ActiveScan,
  status: Extract<ScanStatus, "complete" | "cancelled" | "failed">,
  error?: string,
): void {
  if (status === "cancelled") {
    scan.cancelled = true;
  }
  commit(
    scan.generation,
    currentOutput,
    createSnapshot(
      currentOutput,
      status,
      scan.history.scannedCount,
      scan.startedAt,
      error,
      scan.history.visitedCount,
    ),
  );
  if (activeScan === scan && status !== "cancelled") {
    activeScan = undefined;
  }
}

export async function init(sdk: SDK) {
  const api = sdk.api as APISDK<BackendEndpoints, Record<string, never>>;
  const engine = new RankingEngine();
  const scanner = new HistoryScanner();

  api.register("rankRequests", async (sdkInstance: SDK, ids: string[]) => {
    if (activeScan) {
      finishScan(activeScan, "cancelled");
      activeScan = undefined;
    }
    const generation = ++scanGeneration;
    const startedAt = Date.now();
    const cacheKey = ResultsCache.createKey(ids);
    const cached = cache.get(cacheKey);
    if (cached) {
      const snapshot = createSnapshot(
        cached,
        "complete",
        ids.length,
        startedAt,
      );
      commit(generation, cached, snapshot);
      return snapshot;
    }

    sdkInstance.console.log(`AnomalyRanker: Ranking ${ids.length} requests`);
    const output = await engine.rank(sdkInstance, ids);
    const snapshot = createSnapshot(
      output,
      "complete",
      ids.length,
      startedAt,
    );
    if (shouldCommit(generation)) {
      cache.set(cacheKey, output);
    }
    commit(generation, output, snapshot);
    return snapshot;
  });

  api.register("scanHistory", async (_sdkInstance: SDK, options) => {
    if (activeScan) {
      finishScan(activeScan, "cancelled");
      activeScan = undefined;
    }
    const generation = ++scanGeneration;
    const startedAt = Date.now();
    const output = emptyOutput();
    activeScan = {
      cancelled: false,
      generation,
      startedAt,
      options,
      history: scanner.createState(),
      session: engine.createSession(),
      nextPublishSize: FIRST_PUBLISH_SIZE,
    };
    const snapshot = createSnapshot(output, "scanning", 0, startedAt);
    commit(generation, output, snapshot);
    return snapshot;
  });

  api.register("advanceScan", async (sdkInstance: SDK): Promise<ScanAdvance> => {
    const scan = activeScan;
    if (!scan || scan.cancelled) {
      return { progress: currentSnapshot.progress, resultsChanged: false };
    }

    try {
      if (!scan.history.complete) {
        const page = await scanner.scanNext(
          sdkInstance,
          scan.options,
          scan.history,
        );
        if (scan.cancelled || activeScan !== scan) {
          return { progress: currentSnapshot.progress, resultsChanged: false };
        }
        scan.session.add(page.records);
      }

      const shouldPublish =
        scan.history.scannedCount >= scan.nextPublishSize;
      const isFinished = scan.history.complete;

      if (shouldPublish || isFinished) {
        const output = scan.session.rank();
        currentOutput = output;
        while (scan.nextPublishSize <= scan.history.scannedCount) {
          scan.nextPublishSize *= 2;
        }
        currentSnapshot = createSnapshot(
          output,
          isFinished ? "complete" : "scanning",
          scan.history.scannedCount,
          scan.startedAt,
          undefined,
          scan.history.visitedCount,
        );
        if (isFinished) {
          activeScan = undefined;
        }
        return { progress: currentSnapshot.progress, resultsChanged: true };
      }

      currentSnapshot = {
        ...currentSnapshot,
        progress: {
          ...currentSnapshot.progress,
          visitedCount: scan.history.visitedCount,
          scannedCount: scan.history.scannedCount,
          elapsedMs: Math.max(0, Date.now() - scan.startedAt),
        },
      };
      return { progress: currentSnapshot.progress, resultsChanged: false };
    } catch (error: unknown) {
      const message = error instanceof Error ? error.message : String(error);
      sdkInstance.console.error("AnomalyRanker: advanceScan failed", error);
      finishScan(scan, "failed", message);
      return { progress: currentSnapshot.progress, resultsChanged: false };
    }
  });

  api.register("getResults", async () => currentSnapshot);


  api.register("resumeScan", async () => {
    const scan = activeScan;
    if (!scan?.cancelled) {
      return currentSnapshot;
    }
    scan.cancelled = false;
    currentSnapshot = {
      ...currentSnapshot,
      progress: {
        ...currentSnapshot.progress,
        status: "scanning",
        error: undefined,
      },
    };
    return currentSnapshot;
  });

  api.register("cancelScan", async () => {
    if (activeScan) {
      finishScan(activeScan, "cancelled");
    }
    return currentSnapshot;
  });

  api.register("clearResults", async () => {
    scanGeneration++;
    activeScan = undefined;
    currentOutput = emptyOutput();
    currentSnapshot = createSnapshot(currentOutput, "idle", 0, Date.now());
    cache.clear();
  });

  api.register("validateHttpql", async (sdkInstance: SDK, filter: string) => {
    if (!filter.trim()) return { valid: true };
    try {
      sdkInstance.requests.query().filter(filter.trim());
      return { valid: true };
    } catch (error) {
      return {
        valid: false,
        error: error instanceof Error ? error.message : String(error),
      };
    }
  });

  sdk.console.log("AnomalyRanker backend initialized.");
}
