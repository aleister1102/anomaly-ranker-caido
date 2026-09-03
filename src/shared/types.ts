import type { ID } from "@caido/sdk-frontend";


export interface CohortSummary {
  size: number;
  dynamicFeatureCount: number;
  warnings: string[];
}

export interface RankedResult {
  id: ID;
  rank: number;
  rawRank: number;
  method: string;
  url: string;
  statusCode: number;
  contentLength: number;
  contentType: string;
  location?: string;
  occurrences: number;
}

export type ScanStatus =
  | "idle"
  | "scanning"
  | "cancelling"
  | "complete"
  | "cancelled"
  | "failed";

export interface ScanProgress {
  status: ScanStatus;
  visitedCount: number;
  scannedCount: number;
  totalCount?: number;
  rankedCount: number;
  elapsedMs: number;
  error?: string;
}

export interface RankingSnapshot {
  results: RankedResult[];
  summary: CohortSummary;
  progress: ScanProgress;
}

export interface ScanAdvance {
  progress: ScanProgress;
  resultsChanged: boolean;
}


export interface ScanHistoryOptions {
  filter?: string;
  inScopeOnly: boolean;
  scopeId?: ID;
}

export type BackendEndpoints = {
  rankRequests(ids: string[]): Promise<RankingSnapshot>;
  getResults(): Promise<RankingSnapshot>;
  clearResults(): Promise<void>;
  scanHistory(options: ScanHistoryOptions): Promise<RankingSnapshot>;
  advanceScan(): Promise<ScanAdvance>;
  resumeScan(): Promise<RankingSnapshot>;
  cancelScan(): Promise<RankingSnapshot>;
  validateHttpql(filter: string): Promise<{ valid: boolean; error?: string }>;
};
