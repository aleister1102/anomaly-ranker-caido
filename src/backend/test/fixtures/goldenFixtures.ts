import type { ExtractFeaturesInput } from "../../src/ranking/featureExtractor.js";

/**
 * Independently authored request/response fixtures for static golden validation.
 * Each scenario isolates the roadmap fixture family named in its `family` field:
 * every input dimension is held constant across the scenario's entries except the
 * one(s) the family targets, so the expected `rawRank`s in goldenValidation.test.ts
 * are hand-derived directly from the scoring formula (see VALIDATION.md), not from
 * any external tool.
 */

export function bytes(s: string): Uint8Array {
  return new TextEncoder().encode(s);
}

export interface FixtureEntry {
  id: string;
  request: string;
  input: ExtractFeaturesInput;
}

export interface FixtureScenario {
  family: string;
  entries: FixtureEntry[];
}

const HEADERS = bytes(
  "HTTP/1.1 200 OK\r\nContent-Type: text/plain\r\nServer: nginx\r\n\r\n",
);
const CONTENT_LENGTH = "50";

function entry(
  id: string,
  request: string,
  overrides: Partial<ExtractFeaturesInput> = {},
): FixtureEntry {
  return {
    id,
    request,
    input: {
      statusCode: 200,
      bodyBytes: bytes(""),
      contentLengthHeader: CONTENT_LENGTH,
      rawResponseBytes: HEADERS,
      ...overrides,
    },
  };
}

export const SCENARIOS: FixtureScenario[] = [
  {
    family: "status-code anomaly",
    entries: [
      entry("status-b1", "GET /a HTTP/1.1", { bodyBytes: bytes("shared-body") }),
      entry("status-b2", "GET /b HTTP/1.1", { bodyBytes: bytes("shared-body") }),
      entry("status-x", "GET /c HTTP/1.1", {
        statusCode: 500,
        bodyBytes: bytes("shared-body"),
      }),
    ],
  },
  {
    family: "content-length anomaly",
    entries: [
      entry("cl-b1", "GET /a HTTP/1.1", { bodyBytes: bytes("shared-body-2") }),
      entry("cl-b2", "GET /b HTTP/1.1", { bodyBytes: bytes("shared-body-2") }),
      entry("cl-x", "GET /c HTTP/1.1", {
        bodyBytes: bytes("shared-body-2"),
        contentLengthHeader: "9999",
      }),
    ],
  },
  {
    family: "word-count anomaly",
    entries: [
      entry("word-b1", "GET /a HTTP/1.1", { bodyBytes: bytes("hello world") }),
      entry("word-b2", "GET /b HTTP/1.1", { bodyBytes: bytes("hello world") }),
      entry("word-x", "GET /c HTTP/1.1", {
        bodyBytes: bytes("hello world foo bar"),
      }),
    ],
  },
  {
    family: "line-count anomaly",
    entries: [
      entry("line-b1", "GET /a HTTP/1.1", { bodyBytes: bytes("line one") }),
      entry("line-b2", "GET /b HTTP/1.1", { bodyBytes: bytes("line one") }),
      entry("line-x", "GET /c HTTP/1.1", { bodyBytes: bytes("line\none") }),
    ],
  },
  {
    family: "colon-count anomaly",
    entries: [
      entry("colon-b1", "GET /a HTTP/1.1", { bodyBytes: bytes("shared-body-3") }),
      entry("colon-b2", "GET /b HTTP/1.1", { bodyBytes: bytes("shared-body-3") }),
      entry("colon-x", "GET /c HTTP/1.1", {
        bodyBytes: bytes("shared-body-3"),
        rawResponseBytes: bytes(
          "HTTP/1.1 200 OK\r\nContent-Type: text/plain\r\nServer: ngi:nx\r\n\r\n",
        ),
      }),
    ],
  },
  {
    family: "header-name diff",
    entries: [
      entry("hdr-b1", "GET /a HTTP/1.1", { bodyBytes: bytes("shared-body-4") }),
      entry("hdr-b2", "GET /b HTTP/1.1", { bodyBytes: bytes("shared-body-4") }),
      entry("hdr-x", "GET /c HTTP/1.1", {
        bodyBytes: bytes("shared-body-4"),
        rawResponseBytes: bytes(
          "HTTP/1.1 200 OK\r\nContent-Type: text/plain\r\nX-Frame-Options: DENY\r\n\r\n",
        ),
      }),
    ],
  },
  {
    family: "reflected-payload nonce / one-unique-body",
    entries: [
      entry("nonce-b1", "GET /a HTTP/1.1", { bodyBytes: bytes("normal content") }),
      entry("nonce-b2", "GET /b HTTP/1.1", { bodyBytes: bytes("normal content") }),
      entry("nonce-x", "GET /search?q=nonce9f3a8b2c HTTP/1.1", {
        bodyBytes: bytes("nonce9f3a8b2c"),
      }),
    ],
  },
  {
    family: "HTML visible-text change",
    entries: [
      entry("vt-b1", "GET /a HTTP/1.1", { bodyBytes: bytes("<div><p>hello</p></div>") }),
      entry("vt-b2", "GET /b HTTP/1.1", { bodyBytes: bytes("<div><p>hello</p></div>") }),
      entry("vt-x", "GET /c HTTP/1.1", { bodyBytes: bytes("<div><p>world</p></div>") }),
    ],
  },
  {
    family: "HTML tag-structure change",
    entries: [
      entry("tag-b1", "GET /a HTTP/1.1", { bodyBytes: bytes("<div><p>hello</p></div>") }),
      entry("tag-b2", "GET /b HTTP/1.1", { bodyBytes: bytes("<div><p>hello</p></div>") }),
      entry("tag-x", "GET /c HTTP/1.1", {
        bodyBytes: bytes("<section><p>hello</p></section>"),
      }),
    ],
  },
  {
    family: "two-template (symmetric, non-anomalous)",
    entries: [
      entry("tmpl-a1", "GET /a HTTP/1.1", { bodyBytes: bytes("<div><p>hello</p></div>") }),
      entry("tmpl-a2", "GET /b HTTP/1.1", { bodyBytes: bytes("<div><p>hello</p></div>") }),
      entry("tmpl-b1", "GET /c HTTP/1.1", {
        bodyBytes: bytes("<section><p>world</p></section>"),
      }),
      entry("tmpl-b2", "GET /d HTTP/1.1", {
        bodyBytes: bytes("<section><p>world</p></section>"),
      }),
    ],
  },
  {
    family: "malformed HTML",
    entries: [
      entry("mal-b1", "GET /a HTTP/1.1", { bodyBytes: bytes("<div><p>ok</p></div>") }),
      entry("mal-b2", "GET /b HTTP/1.1", { bodyBytes: bytes("<div><p>ok</p></div>") }),
      entry("mal-x", "GET /c HTTP/1.1", { bodyBytes: bytes("<div><p>broken<span") }),
    ],
  },
  {
    family: "empty/binary",
    entries: [
      entry("bin-b1", "GET /a HTTP/1.1", { bodyBytes: bytes("hi") }),
      entry("bin-b2", "GET /b HTTP/1.1", { bodyBytes: bytes("hi") }),
      entry("bin-x", "GET /c HTTP/1.1", {
        bodyBytes: new Uint8Array([0x00, 0xff, 0x10, 0x02, 0x00, 0xfe]),
      }),
    ],
  },
];
