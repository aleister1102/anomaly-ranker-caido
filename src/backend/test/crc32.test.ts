import { describe, expect, it } from "vitest";
import { crc32, crc32Chars } from "../src/features/crc32.js";

const ASCII_123456789 = new TextEncoder().encode("123456789");

describe("crc32", () => {
  it("returns 0 for empty input", () => {
    expect(crc32(new Uint8Array())).toBe(0);
  });

  it("matches the standard CRC32 test vector as signed int", () => {
    const result = crc32(ASCII_123456789);
    expect(result).toBe(-873187034);
    expect(result >>> 0).toBe(0xcbf43926);
  });

  it("is deterministic for the same bytes", () => {
    const bytes = new Uint8Array([0x00, 0xff, 0x42, 0x7b]);
    expect(crc32(bytes)).toBe(crc32(bytes));
  });

  it("feeds char & 0xFF for crc32Chars", () => {
    expect(crc32Chars("")).toBe(0);
    expect(crc32Chars("123456789")).toBe(-873187034);
    expect(crc32Chars("123456789") >>> 0).toBe(0xcbf43926);
  });
});
