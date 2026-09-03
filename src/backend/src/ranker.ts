/// <reference types="@caido/sdk-backend" />

import type { SDK } from "caido:plugin";
import type { RequestResponseOpt } from "caido:utils";
import type {
  CohortSummary,
  RankedResult,
} from "../../shared/types.js";
import { mapPool } from "./mapPool.js";
import { parseMimeType } from "./mime.js";
import { extractFeatures } from "./ranking/featureExtractor.js";
import {
  buildFrequencyTables,
  scoreFeatureSet,
  type FrequencyTables,
} from "./ranking/burpScorer.js";
import {
  FEATURE_NAMES,
  type ResponseFeatureSet,
} from "./ranking/types.js";

const FETCH_CONCURRENCY = 50;

interface RankingCandidate {
  featureSet: ResponseFeatureSet;
  method: string;
  url: string;
  statusCode: number;
  contentLength: number;
  contentType: string;
  location?: string;
}

export interface RankingOutput {
  results: RankedResult[];
  summary: CohortSummary;
}

function minMaxNormalize(rawRank: number, min: number, max: number): number {
  if (max === min) {
    return 0;
  }
  return Math.round(((rawRank - min) / (max - min)) * 100);
}


function statusClass(code: number): string {
  if (code >= 500) return "5xx";
  if (code >= 400) return "4xx";
  if (code >= 300) return "3xx";
  if (code >= 200) return "2xx";
  if (code >= 100) return "1xx";
  return "other";
}
function buildCohortSummary(
  tables: FrequencyTables,
  size: number,
  statusClasses: Set<string>,
): CohortSummary {
  if (size === 0) {
    return { size: 0, dynamicFeatureCount: 0, warnings: [] };
  }

  let dynamicFeatureCount = 0;
  for (const values of tables.values()) {
    if (values.size > 1) {
      dynamicFeatureCount++;
    }
  }

  const warnings: string[] = [];
  if (size < 5) {
    warnings.push(
      `Only ${size} responses were available. Scores are less reliable with fewer than 5.`,
    );
  }
  if (dynamicFeatureCount >= 4 || statusClasses.size >= 2) {
    warnings.push(
      `Responses vary across ${dynamicFeatureCount} signals and ${statusClasses.size} status groups. For clearer comparisons, filter to one endpoint or status group.`,
    );
  }

  return { size, dynamicFeatureCount, warnings };
}


function compareRequestIds(left: string, right: string): number {
  if (left === right) return 0;
  return left < right ? -1 : 1;
}

function deduplicationKey(candidate: RankingCandidate): string {
  const values = candidate.featureSet.values;
  return [
    candidate.method,
    candidate.url,
    candidate.contentType,
    candidate.location ?? "",
    values.statusCode,
    values.contentLength,
    values.bodyContent,
    values.wordCount,
    values.lineCount,
    values.headerNames,
    values.colonCount,
    values.visibleText,
    values.visibleWordCount,
    values.tagNames,
  ].join("\u001f");
}

const EMPTY_BYTES = new Uint8Array();
const MAX_ANALYZED_BODY_BYTES = 256 * 1024;

export class RankingSession {
  private readonly candidates: RankingCandidate[] = [];

  public add(records: RequestResponseOpt[]): void {
    for (const record of records) {
      const response = record.response;
      if (!response) continue;

      const statusCode = response.getCode();
      if (typeof statusCode !== "number" || statusCode < 100 || statusCode > 599) {
        continue;
      }

      const requestId = String(record.request.getId());
      const bodyLength = response.getBody()?.length ?? 0;
      const raw =
        bodyLength <= MAX_ANALYZED_BODY_BYTES
          ? response.getRaw()?.toBytes() ?? EMPTY_BYTES
          : EMPTY_BYTES;
      const contentType =
        parseMimeType(response.getHeader("Content-Type")?.[0] ?? "") ||
        "unknown";
      const candidate: RankingCandidate = {
        featureSet: {
          requestId,
          hasResponse: true,
          values: extractFeatures({
            statusCode,
            bodyBytes: EMPTY_BYTES,
            contentLengthHeader:
              response.getHeader("Content-Length")?.[0] ??
              String(bodyLength),
            contentType,
            rawResponseBytes: raw,
          }),
        },
        method: record.request.getMethod() || "",
        url: record.request.getUrl() || "",
        statusCode,
        contentLength: bodyLength,
        contentType,
        location: response.getHeader("Location")?.[0],
      };
      this.candidates.push(candidate);
    }
  }


  public rank(): RankingOutput {
    if (this.candidates.length === 0) {
      return {
        results: [],
        summary: { size: 0, dynamicFeatureCount: 0, warnings: [] },
      };
    }

    const size = this.candidates.length;
    const tables = buildFrequencyTables(
      this.candidates.map((candidate) => candidate.featureSet),
    );
    const statusClasses = new Set(
      this.candidates.map((candidate) => statusClass(candidate.statusCode)),
    );
    const rawRanks = new Array<number>(size);
    let minRaw = Infinity;
    let maxRaw = -Infinity;
    for (let i = 0; i < size; i++) {
      const score = scoreFeatureSet(
        this.candidates[i].featureSet,
        tables,
        false,
      );
      rawRanks[i] = score.rawRank;
      if (score.rawRank < minRaw) minRaw = score.rawRank;
      if (score.rawRank > maxRaw) maxRaw = score.rawRank;
    }

    const summary = buildCohortSummary(tables, size, statusClasses);
    const grouped = new Map<string, RankedResult>();
    for (let i = 0; i < size; i++) {
      const candidate = this.candidates[i];
      const key = deduplicationKey(candidate);
      const existing = grouped.get(key);
      if (existing) {
        existing.occurrences++;
        continue;
      }

      const rawRank = rawRanks[i];
      grouped.set(key, {
        id: candidate.featureSet.requestId,
        occurrences: 1,
        rank: minMaxNormalize(rawRank, minRaw, maxRaw),
        rawRank,
        method: candidate.method,
        url: candidate.url,
        statusCode: candidate.statusCode,
        contentLength: candidate.contentLength,
        contentType: candidate.contentType,
        location: candidate.location,
      });
    }
    const results = [...grouped.values()];

    results.sort((left, right) => {
      if (right.rawRank !== left.rawRank) {
        return right.rawRank - left.rawRank;
      }
      return compareRequestIds(String(left.id), String(right.id));
    });

    return { results, summary };
  }
}

export class RankingEngine {
  public createSession(): RankingSession {
    return new RankingSession();
  }

  public async rank(sdk: SDK, ids: string[]): Promise<RankingOutput> {
    const records = await mapPool(ids, FETCH_CONCURRENCY, (id) =>
      sdk.requests.get(id),
    );
    const session = this.createSession();
    session.add(
      records.filter(
        (record): record is RequestResponseOpt => record !== undefined,
      ),
    );
    return session.rank();
  }
}
