import { describe, expect, it } from "vitest";
import { crc32 } from "../src/features/crc32.js";
import {
  extractContentLength,
  extractFeatures,
  extractLineCount,
  extractWordCount,
} from "../src/ranking/featureExtractor.js";

function bytes(s: string): Uint8Array {
  return new TextEncoder().encode(s);
}

describe("extractWordCount", () => {
  it("counts space-delimited words", () => {
    expect(extractWordCount(bytes("hello world"))).toBe(2);
  });

  it("counts tab-delimited words", () => {
    expect(extractWordCount(bytes("hello\tworld"))).toBe(2);
  });

  it("handles CRLF without counting CR as word boundary alone", () => {
    expect(extractWordCount(bytes("hello\r\nworld"))).toBe(2);
  });

  it("collapses repeated whitespace between words", () => {
    expect(extractWordCount(bytes("hello   world"))).toBe(2);
  });

  it("ignores leading and trailing whitespace", () => {
    expect(extractWordCount(bytes("  hello world  "))).toBe(2);
  });

  it("counts non-ASCII bytes above 32 as word content", () => {
    expect(extractWordCount(bytes("caf\u00e9"))).toBe(1);
  });

  it("uses byte>32 rule not printable ASCII only", () => {
    expect(extractWordCount(new Uint8Array([0x7f, 0x20, 0x80]))).toBe(2);
  });
});

describe("extractLineCount", () => {
  it("returns 0 for empty body", () => {
    expect(extractLineCount(new Uint8Array())).toBe(0);
  });

  it("counts LF-terminated lines", () => {
    expect(extractLineCount(bytes("a\nb\nc\n"))).toBe(3);
  });

  it("counts trailing partial line without LF", () => {
    expect(extractLineCount(bytes("a\nb"))).toBe(2);
  });

  it("ignores CR-only line endings", () => {
    expect(extractLineCount(bytes("a\rb\rc"))).toBe(1);
  });
});

describe("extractContentLength", () => {
  it("uses declared header value when present", () => {
    expect(extractContentLength(bytes("abcdef"), "42")).toBe(42);
  });

  it("trims header value before parsing", () => {
    expect(extractContentLength(bytes("abcdef"), "  99  ")).toBe(99);
  });

  it("returns 0 for malformed header", () => {
    expect(extractContentLength(bytes("abcdef"), "nope")).toBe(0);
  });

  it("falls back to body byte length when header absent", () => {
    expect(extractContentLength(bytes("abcdef"))).toBe(6);
  });
});

describe("extractFeatures", () => {
  it("passes status code through", () => {
    const features = extractFeatures({
      statusCode: 404,
      bodyBytes: bytes(""),
    });
    expect(features.statusCode).toBe(404);
  });

  it("computes body CRC32 deterministically", () => {
    const body = bytes("hello");
    const features = extractFeatures({ statusCode: 200, bodyBytes: body });
    expect(features.bodyContent).toBe(crc32(body));
  });

  it("is binary-safe", () => {
    const body = new Uint8Array([0x00, 0xff, 0x80]);
    const features = extractFeatures({ statusCode: 200, bodyBytes: body });
    expect(features.bodyContent).toBe(crc32(body));
  });
});
