import { crc32 } from "../features/crc32.js";
import type { FeatureName } from "./types.js";

export interface ExtractFeaturesInput {
  statusCode: number;
  bodyBytes: Uint8Array;
  contentLengthHeader?: string;
}

export function extractContentLength(
  bodyBytes: Uint8Array,
  contentLengthHeader?: string,
): number {
  if (contentLengthHeader !== undefined) {
    const trimmed = contentLengthHeader.trim();
    const parsed = parseInt(trimmed, 10);
    if (Number.isNaN(parsed)) {
      return 0;
    }
    return parsed;
  }
  return bodyBytes.length;
}

export function extractWordCount(bodyBytes: Uint8Array): number {
  let count = 0;
  let inWord = false;
  for (let i = 0; i < bodyBytes.length; i++) {
    if (bodyBytes[i] > 32) {
      if (!inWord) {
        count++;
        inWord = true;
      }
    } else {
      inWord = false;
    }
  }
  return count;
}

export function extractLineCount(bodyBytes: Uint8Array): number {
  if (bodyBytes.length === 0) {
    return 0;
  }
  let count = 0;
  for (let i = 0; i < bodyBytes.length; i++) {
    if (bodyBytes[i] === 0x0a) {
      count++;
    }
  }
  const lastByte = bodyBytes[bodyBytes.length - 1];
  if (lastByte !== 0x0a) {
    count++;
  }
  return count;
}

export function extractFeatures(
  input: ExtractFeaturesInput,
): Record<FeatureName, number> {
  const { statusCode, bodyBytes, contentLengthHeader } = input;
  return {
    statusCode,
    contentLength: extractContentLength(bodyBytes, contentLengthHeader),
    bodyContent: crc32(bodyBytes),
    wordCount: extractWordCount(bodyBytes),
    lineCount: extractLineCount(bodyBytes),
  };
}
