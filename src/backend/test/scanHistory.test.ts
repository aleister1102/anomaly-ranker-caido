import { beforeEach, describe, expect, it, vi } from "vitest";
import { init } from "../src/index.js";
import { RankingSession } from "../src/ranker.js";

function deferred() {
  let resolve!: () => void;
  const promise = new Promise<void>((done) => {
    resolve = done;
  });
  return { promise, resolve };
}

async function waitForTerminal(
  harness: ReturnType<typeof createHarness>,
) {
  for (let attempt = 0; attempt < 1000; attempt++) {
    await harness.handlers.advanceScan(harness.sdk);
    const snapshot = await harness.handlers.getResults();
    if (snapshot.progress.status !== "scanning") {
      return snapshot;
    }
  }
  throw new Error("Scan did not finish");
}

function createRecord(index: number) {
  const id = String(index + 1);
  const body = new TextEncoder().encode(`response ${index % 3}`);
  return {
    request: {
      getId: () => id,
      getMethod: () => "GET",
      getUrl: () => `https://example.test/${id}`,
    },
    response: {
      getCode: () => (index % 10 === 0 ? 404 : 200),
      getBody: () => ({ toRaw: () => body, length: body.length }),
      getRaw: () => ({ toBytes: () => body }),
      getHeader: (name: string) => {
        if (name.toLowerCase() === "content-length") return [String(body.length)];
        if (name.toLowerCase() === "content-type") return ["text/plain"];
        return undefined;
      },
    },
  };
}

function createHarness(count: number, pauseSecondPage = false) {
  const handlers: Record<string, (...args: any[]) => any> = {};
  const records = Array.from({ length: count }, (_, index) => createRecord(index));
  const secondPageStarted = deferred();
  const releaseSecondPage = deferred();
  let offset = 0;
  let pageSize = 1000;
  let executeCount = 0;
  const execute = vi.fn(async () => {
    executeCount++;
    if (pauseSecondPage && executeCount === 2) {
      secondPageStarted.resolve();
      await releaseSecondPage.promise;
    }
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
  const sdk = {
    api: {
      register: (name: string, handler: (...args: any[]) => any) => {
        handlers[name] = handler;
      },
    },
    requests: {
      query: () => {
        offset = 0;
        return query;
      },
      get,
    },
    console: { log: vi.fn(), error: vi.fn() },
    graphql: {
      execute: vi.fn(async () => ({
        data: { requests: { count: { value: count } } },
      })),
    },
  };
  return {
    handlers,
    sdk,
    execute,
    get,
    secondPageStarted: secondPageStarted.promise,
    releaseSecondPage: releaseSecondPage.resolve,
  };
}

describe("scanHistory", () => {
  let harness: ReturnType<typeof createHarness>;

  beforeEach(async () => {
    harness = createHarness(1500);
    await init(harness.sdk as never);
    await harness.handlers.clearResults();
  });

  it("ranks query records without fetching them again", async () => {
    await harness.handlers.scanHistory(harness.sdk, {
      inScopeOnly: false,
    });
    expect(harness.execute).not.toHaveBeenCalled();
    const snapshot = await waitForTerminal(harness);

    expect(snapshot.progress.status).toBe("complete");
    expect(snapshot.progress.scannedCount).toBe(1500);
    expect(snapshot.results).toHaveLength(1500);
    expect(harness.execute).toHaveBeenCalledTimes(15);
    expect(harness.get).not.toHaveBeenCalled();
  });

  it("does not rank a completed checkpoint twice", async () => {
    harness = createHarness(100);
    await init(harness.sdk as never);
    await harness.handlers.clearResults();
    const rank = vi.spyOn(RankingSession.prototype, "rank");

    const started = await harness.handlers.scanHistory(harness.sdk, {
      inScopeOnly: false,
    });
    expect(started.progress.status).toBe("scanning");
    const snapshot = await waitForTerminal(harness);

    expect(snapshot.progress.status).toBe("complete");
    expect(snapshot.progress.scannedCount).toBe(100);
    expect(rank).toHaveBeenCalledTimes(1);
    rank.mockRestore();
  });


  it("keeps the last complete partial ranking when cancelled", async () => {
    harness = createHarness(1500, true);
    await init(harness.sdk as never);
    await harness.handlers.clearResults();

    const started = await harness.handlers.scanHistory(harness.sdk, {
      inScopeOnly: false,
    });
    expect(started.progress.status).toBe("scanning");
    await harness.handlers.advanceScan(harness.sdk);
    while ((await harness.handlers.getResults()).results.length === 0) {
      await harness.handlers.advanceScan(harness.sdk);
    }

    const nextPage = harness.handlers.advanceScan(harness.sdk);
    await harness.secondPageStarted;
    const cancelled = await harness.handlers.cancelScan();
    expect(cancelled.progress.status).toBe("cancelled");
    harness.releaseSecondPage();
    await nextPage;

    const snapshot = await harness.handlers.getResults();
    expect(snapshot.progress.status).toBe("cancelled");
    expect(snapshot.progress.scannedCount).toBe(100);
    expect(snapshot.results).toHaveLength(100);
    expect(harness.execute).toHaveBeenCalledTimes(2);
  });

  it("resumes a cancelled scan from its existing cursor", async () => {
    harness = createHarness(150);
    await init(harness.sdk as never);
    await harness.handlers.clearResults();
    await harness.handlers.scanHistory(harness.sdk, {
      inScopeOnly: false,
    });
    await harness.handlers.advanceScan(harness.sdk);

    const cancelled = await harness.handlers.cancelScan();
    expect(cancelled.progress.status).toBe("cancelled");
    expect(cancelled.results).toHaveLength(100);

    const resumed = await harness.handlers.resumeScan();
    expect(resumed.progress.status).toBe("scanning");
    expect(resumed.results).toHaveLength(100);

    const completed = await waitForTerminal(harness);
    expect(completed.progress.status).toBe("complete");
    expect(completed.progress.scannedCount).toBe(150);
    expect(completed.results).toHaveLength(150);
    expect(harness.execute).toHaveBeenCalledTimes(2);
  });
});
