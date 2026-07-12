export type FeatureName =
  | "statusCode"
  | "contentLength"
  | "bodyContent"
  | "wordCount"
  | "lineCount";

export const FEATURE_NAMES: FeatureName[] = [
  "statusCode",
  "contentLength",
  "bodyContent",
  "wordCount",
  "lineCount",
];

export interface ResponseFeatureSet {
  requestId: string;
  hasResponse: boolean;
  values: Record<FeatureName, number>;
}

export interface FeatureContribution {
  feature: FeatureName;
  value: number;
  frequency: number;
  distinctValues: number;
  weight: number;
  contribution: number;
}

export interface RankingResult {
  requestId: string;
  rawRank: number;
  contributions: FeatureContribution[];
}
