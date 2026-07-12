import { describe, expect, it } from "vitest";
import { crc32Chars } from "../src/features/crc32.js";
import {
  extractColonCount,
  extractHeaderNames,
} from "../src/ranking/featureExtractor.js";

function bytes(s: string): Uint8Array {
  return new TextEncoder().encode(s);
}

function rawResponse(headers: string, body = ""): Uint8Array {
  return bytes(`HTTP/1.1 200 OK\r\n${headers}\r\n\r\n${body}`);
}

describe("extractHeaderNames", () => {
  it("groups responses with same header names but different values", () => {
    const a = rawResponse("Content-Type: text/html\r\nServer: nginx", "body-a");
    const b = rawResponse("Content-Type: application/json\r\nServer: apache", "body-b");
    expect(extractHeaderNames(a)).toBe(extractHeaderNames(b));
  });

  it("changes when header order differs", () => {
    const ordered = rawResponse("Content-Type: text/html\r\nServer: nginx");
    const reordered = rawResponse("Server: nginx\r\nContent-Type: text/html");
    expect(extractHeaderNames(ordered)).not.toBe(extractHeaderNames(reordered));
  });

  it("changes when header name case differs", () => {
    const lower = rawResponse("content-type: text/html\r\nserver: nginx");
    const mixed = rawResponse("Content-Type: text/html\r\nServer: nginx");
    expect(extractHeaderNames(lower)).not.toBe(extractHeaderNames(mixed));
  });

  it("changes when a header name is repeated", () => {
    const once = rawResponse("Set-Cookie: a=1\r\nServer: nginx");
    const twice = rawResponse("Set-Cookie: a=1\r\nSet-Cookie: b=2\r\nServer: nginx");
    expect(extractHeaderNames(once)).not.toBe(extractHeaderNames(twice));
  });

  it("ignores colon-containing body lines after the header block", () => {
    const headers = "Content-Type: application/json\r\nServer: nginx";
    const a = rawResponse(headers, '{"a":"1"}');
    const b = rawResponse(headers, '{"b":"2","c":"3"}');
    expect(extractHeaderNames(a)).toBe(extractHeaderNames(b));
  });

  it("skips lines without a colon", () => {
    const withStatus = rawResponse("Content-Type: text/html");
    const expected = crc32Chars("Content-Type");
    expect(extractHeaderNames(withStatus)).toBe(expected);
  });
});

describe("extractColonCount", () => {
  it("counts colons across status line, headers, and body", () => {
    const response = rawResponse("Content-Type: text/html\r\nX-Test: 1:2:3", "a:b:c");
    expect(extractColonCount(response)).toBe(6);
  });

  it("returns zero for colon-free raw response", () => {
    const response = bytes("HTTP/1.1 200 OK\r\n\r\nplain");
    expect(extractColonCount(response)).toBe(0);
  });
});
