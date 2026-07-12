import type { ID } from "@caido/sdk-frontend";

export interface FeatureContribution {
  feature: string;
  value: number;
  frequency: number;
  distinctValues: number;
  weight: number;
  contribution: number;
}

export interface CohortSummary {
  size: number;
  dynamicFeatureCount: number;
  warnings: string[];
}

export interface RankedResult {
  id: ID;
  rank: number;           // Higher = more anomalous (0-100 display rank)
  rawRank: number;        // Burp-compatible integer score
  method: string;
  url: string;
  statusCode: number;
  contentLength: number;
  contentType: string;
  location?: string;      // For 3xx redirects
  contributions?: FeatureContribution[];
  cohortSummary?: CohortSummary;
}

export interface ScanHistoryOptions {
  limit: number;        // Max requests to fetch (1-100000)
  scanAll: boolean;     // If true, ignore limit and fetch all matching
  filter?: string;      // Optional HTTPQL filter query
}

export type BackendEndpoints = {
  rankRequests(ids: string[]): Promise<RankedResult[]>;
  getResults(): Promise<RankedResult[]>;
  clearResults(): Promise<void>;
  scanHistory(options: ScanHistoryOptions): Promise<RankedResult[]>;
  validateHttpql(filter: string): Promise<{ valid: boolean; error?: string }>;
};
