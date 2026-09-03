import { describe, expect, it, vi } from "vitest";
import type { ScanHistoryOptions } from "../../shared/types.js";
import { HistoryScanner, hasValidHttpResponse } from "../src/scanner.js";

interface FixtureOptions {
  contentType?: (index: number) => string;
  inScope?: (index: number) => boolean;
  url?: (index: number) => string;
}

function createSdk(count: number, options: FixtureOptions = {}) {
  const records = Array.from({ length: count }, (_, index) => ({
    request: {
      getId: () => String(index + 1),
      getUrl: () =>
        options.url?.(index) ?? `https://example.test/${index}.html`,
    },
    response: {
      getCode: () => 200,
      getHeader: (name: string) =>
        name.toLowerCase() === "content-type"
          ? [options.contentType?.(index) ?? "text/html"]
          : undefined,
    },
  }));
  let offset = 0;
  let pageSize = 1000;
  const execute = vi.fn(async () => {
    const items = records
      .slice(offset, offset + pageSize)
      .map((record, index) => ({ cursor: String(offset + index + 1), ...record }));
    const end = offset + items.length;
    return {
      items,
      pageInfo: {
        hasNextPage: end < records.length,
        hasPreviousPage: offset > 0,
        startCursor: String(offset),
        endCursor: String(end),
      },
    };
  });
  const query = {
    descending: () => query,
    filter: () => query,
    first: (size: number) => {
      pageSize = size;
      return query;
    },
    after: (cursor: string) => {
      offset = Number(cursor);
      return query;
    },
    execute,
  };
  const get = vi.fn();
  const inScope = vi.fn(
    (request: { getId(): string }) =>
      options.inScope?.(Number(request.getId()) - 1) ?? true,
  );
  const sdk = {
    requests: {
      query: () => {
        offset = 0;
        return query;
      },
      get,
      inScope,
    },
    console: { log: vi.fn(), error: vi.fn() },
  };
  return { sdk, execute, get, inScope };
}

async function scanAll(
  sdk: ReturnType<typeof createSdk>["sdk"],
  options: ScanHistoryOptions,
) {
  const scanner = new HistoryScanner();
  const state = scanner.createState();
  const pages = [];
  while (!state.complete) {
    pages.push(await scanner.scanNext(sdk as never, options, state));
  }
  return { pages, state };
}

describe("hasValidHttpResponse", () => {
  it("returns false for records with no response", () => {
    expect(hasValidHttpResponse({ request: {} as never, response: undefined })).toBe(false);
  });

  it("returns false for status code 0 or outside 100-599", () => {
    expect(hasValidHttpResponse({
      request: {} as never,
      response: { getCode: () => 0 } as never,
    })).toBe(false);
    expect(hasValidHttpResponse({
      request: {} as never,
      response: { getCode: () => 99 } as never,
    })).toBe(false);
    expect(hasValidHttpResponse({
      request: {} as never,
      response: { getCode: () => 600 } as never,
    })).toBe(false);
  });

  it("returns true for standard HTTP status codes", () => {
    expect(hasValidHttpResponse({
      request: {} as never,
      response: { getCode: () => 200 } as never,
    })).toBe(true);
    expect(hasValidHttpResponse({
      request: {} as never,
      response: { getCode: () => 308 } as never,
    })).toBe(true);
    expect(hasValidHttpResponse({
      request: {} as never,
      response: { getCode: () => 500 } as never,
    })).toBe(true);
  });
});

describe("HistoryScanner", () => {
  it("pages through all query records without refetching them", async () => {
    const { sdk, execute, get } = createSdk(1500);
    const { pages, state } = await scanAll(sdk, { inScopeOnly: false });

    expect(pages).toHaveLength(15);
    expect(pages.every((page) => page.records.length === 100)).toBe(true);
    expect(state.scannedCount).toBe(1500);
    expect(state.visitedCount).toBe(1500);
    expect(execute).toHaveBeenCalledTimes(15);
    expect(get).not.toHaveBeenCalled();
  });

  it("keeps only records in the chosen scope", async () => {
    const { sdk, inScope } = createSdk(4, {
      inScope: (index) => index % 2 === 0,
    });
    const { pages, state } = await scanAll(sdk, {
      inScopeOnly: true,
      scopeId: "2" as never,
    });

    expect(pages[0].records.map((record) => record.request.getId())).toEqual([
      "1",
      "3",
    ]);
    expect(state.scannedCount).toBe(2);
    expect(state.visitedCount).toBe(2);
    expect(inScope).toHaveBeenCalledWith(expect.anything(), ["2"]);
  });

  it("uses the default scope when no scope ID is supplied", async () => {
    const { sdk, inScope } = createSdk(1);
    const { pages } = await scanAll(sdk, { inScopeOnly: true });

    expect(pages[0].records).toHaveLength(1);
    expect(inScope).toHaveBeenCalledWith(expect.anything());
  });

  it("excludes image, audio, video, and font resources", async () => {
    const { sdk } = createSdk(5, {
      contentType: (index) =>
        ["image/png", "text/plain", "video/mp4", "font/woff2", "application/json"][
          index
        ],
      url: (index) =>
        index === 1
          ? "https://example.test/avatar.jpg?size=large"
          : `https://example.test/resource/${index}`,
    });
    const { pages, state } = await scanAll(sdk, { inScopeOnly: false });

    expect(pages[0].records.map((record) => record.request.getId())).toEqual([
      "5",
    ]);
    expect(state.scannedCount).toBe(1);
    expect(state.visitedCount).toBe(5);
  });
});
