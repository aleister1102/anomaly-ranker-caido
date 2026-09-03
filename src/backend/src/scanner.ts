/// <reference types="@caido/sdk-backend" />

import type { SDK } from "caido:plugin";
import type { RequestResponseOpt } from "caido:utils";
import type { ScanHistoryOptions } from "../../shared/types.js";
import { parseMimeType } from "./mime.js";

const PAGE_SIZE = 100;

const MEDIA_EXTENSIONS = new Set([
  "apng",
  "avif",
  "bmp",
  "eot",
  "gif",
  "ico",
  "jpeg",
  "jpg",
  "m4a",
  "mov",
  "mp3",
  "mp4",
  "mpeg",
  "oga",
  "ogg",
  "ogv",
  "otf",
  "png",
  "svg",
  "tif",
  "tiff",
  "ttf",
  "wav",
  "webm",
  "webp",
  "woff",
  "woff2",
]);

function getExtension(url: string): string | undefined {
  const hashIdx = url.indexOf("#");
  const queryIdx = url.indexOf("?");
  let end = url.length;
  if (hashIdx !== -1) end = hashIdx;
  if (queryIdx !== -1 && queryIdx < end) end = queryIdx;
  const lastSlash = url.lastIndexOf("/", end);
  const lastDot = url.lastIndexOf(".", end);
  if (lastDot > lastSlash && lastDot !== -1) {
    return url.slice(lastDot + 1, end).toLowerCase();
  }
  return undefined;
}

function isMediaRecord(record: RequestResponseOpt): boolean {
  const mime = parseMimeType(
    record.response?.getHeader("Content-Type")?.[0] ?? "",
  );
  if (
    mime.startsWith("image/") ||
    mime.startsWith("audio/") ||
    mime.startsWith("video/") ||
    mime.startsWith("font/")
  ) {
    return true;
  }
  const ext = getExtension(record.request.getUrl());
  return ext !== undefined && MEDIA_EXTENSIONS.has(ext);
}

export function hasValidHttpResponse(record: RequestResponseOpt): boolean {
  const resp = record.response;
  if (!resp) return false;
  const code = resp.getCode();
  return typeof code === "number" && code >= 100 && code <= 599;
}

export interface HistoryScanState {
  cursor?: string;
  visitedCount: number;
  scannedCount: number;
  complete: boolean;
}

export interface HistoryScanPage {
  records: RequestResponseOpt[];
}

export class HistoryScanner {
  public createState(): HistoryScanState {
    return { visitedCount: 0, scannedCount: 0, complete: false };
  }

  public async scanNext(
    sdk: SDK,
    options: ScanHistoryOptions,
    state: HistoryScanState,
  ): Promise<HistoryScanPage> {
    if (state.complete) {
      return { records: [] };
    }

    let query = sdk.requests.query().descending("req", "created_at");
    const filter = options.filter?.trim();
    if (filter) {
      query = query.filter(filter);
    }
    const pageQuery = state.cursor
      ? query.after(state.cursor).first(PAGE_SIZE)
      : query.first(PAGE_SIZE);

    try {
      const page = await pageQuery.execute();
      const scopedRecords = page.items.filter((record) => {
        if (!options.inScopeOnly) return true;
        return options.scopeId
          ? sdk.requests.inScope(record.request, [options.scopeId])
          : sdk.requests.inScope(record.request);
      });
      state.visitedCount += scopedRecords.length;
      const records = scopedRecords.filter((record) => {
        return hasValidHttpResponse(record) && !isMediaRecord(record);
      });
      state.scannedCount += records.length;
      state.complete =
        !page.pageInfo.hasNextPage || !page.pageInfo.endCursor;
      state.cursor = state.complete ? undefined : page.pageInfo.endCursor;

      if (state.complete) {
        sdk.console.log(
          `HistoryScanner: Reviewed ${state.visitedCount} requests and collected ${state.scannedCount} eligible records`,
        );
      }
      return { records };
    } catch (error: unknown) {
      sdk.console.error("HistoryScanner: scan failed", error);
      throw new Error(
        `Failed to scan history: ${error instanceof Error ? error.message : String(error)}`,
      );
    }
  }

}
