import { describe, expect, it } from "vitest";
import { crc32 } from "../src/features/crc32.js";
import {
  extractContentLength,
  extractFeatures,
} from "../src/ranking/featureExtractor.js";

function bytes(s: string): Uint8Array {
  return new TextEncoder().encode(s);
}

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

  it("counts words and lines in one byte pass", () => {
    const features = extractFeatures({
      statusCode: 200,
      bodyBytes: bytes("hello\tworld\nnext"),
    });
    expect(features.wordCount).toBe(3);
    expect(features.lineCount).toBe(2);
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

  it("skips HTML tokenization for known non-HTML content", () => {
    const features = extractFeatures({
      statusCode: 200,
      bodyBytes: bytes("const result = value < limit ? '<div>' : 'text';"),
      contentType: "application/javascript",
    });

    expect(features.visibleText).toBe(0);
    expect(features.visibleWordCount).toBe(0);
    expect(features.tagNames).toBe(0);
  });
});
