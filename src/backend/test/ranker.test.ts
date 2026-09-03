import { describe, expect, it, vi } from "vitest";
import { RankingSession } from "../src/ranker.js";

describe("RankingSession", () => {
  it("does not copy bodies larger than the analysis limit", () => {
    const toRaw = vi.fn();
    const getRaw = vi.fn();
    const session = new RankingSession();

    session.add([
      {
        request: {
          getId: () => "1",
          getMethod: () => "GET",
          getUrl: () => "https://example.test/large-response",
        },
        response: {
          getBody: () => ({ length: 2 * 1024 * 1024, toRaw }),
          getCode: () => 200,
          getRaw,
          getHeader: (name: string) =>
            name.toLowerCase() === "content-type" ? ["text/html"] : undefined,
        },
      },
    ] as never);

    const output = session.rank();
    expect(output.results).toHaveLength(1);
    expect(output.results[0].contentLength).toBe(2 * 1024 * 1024);
    expect(getRaw).not.toHaveBeenCalled();
    expect(toRaw).not.toHaveBeenCalled();
  });

  it("groups equivalent request and response pairs after scoring", () => {
    const raw = new TextEncoder().encode(
      "HTTP/1.1 200 OK\r\nContent-Type: application/json\r\n\r\n{}",
    );
    const record = (id: string) => ({
      request: {
        getId: () => id,
        getMethod: () => "GET",
        getUrl: () => "https://example.test/api",
      },
      response: {
        getBody: () => ({ length: 2 }),
        getCode: () => 200,
        getRaw: () => ({ toBytes: () => raw }),
        getHeader: (name: string) =>
          name.toLowerCase() === "content-type"
            ? ["application/json"]
            : undefined,
      },
    });
    const session = new RankingSession();
    session.add([record("1"), record("2")] as never);

    const output = session.rank();
    expect(output.summary.size).toBe(2);
    expect(output.results).toHaveLength(1);
    expect(output.results[0].id).toBe("1");
    expect(output.results[0].occurrences).toBe(2);
  });

  it("skips records with missing or non-HTTP status codes", () => {
    const session = new RankingSession();
    session.add([
      {
        request: { getId: () => "1", getMethod: () => "GET", getUrl: () => "https://example.test/no-resp" },
        response: undefined,
      },
      {
        request: { getId: () => "2", getMethod: () => "GET", getUrl: () => "https://example.test/malformed" },
        response: {
          getBody: () => ({ length: 141 }),
          getCode: () => 0,
          getRaw: () => ({ toBytes: () => new Uint8Array() }),
          getHeader: () => undefined,
        },
      },
      {
        request: { getId: () => "3", getMethod: () => "GET", getUrl: () => "https://example.test/valid" },
        response: {
          getBody: () => ({ length: 100 }),
          getCode: () => 200,
          getRaw: () => ({ toBytes: () => new Uint8Array() }),
          getHeader: () => undefined,
        },
      },
    ] as never);

    const output = session.rank();
    expect(output.summary.size).toBe(1);
    expect(output.results).toHaveLength(1);
    expect(output.results[0].id).toBe("3");
  });
});
