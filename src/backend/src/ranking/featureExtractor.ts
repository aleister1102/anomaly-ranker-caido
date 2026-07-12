import { crc32, crc32Chars } from "../features/crc32.js";
import { extractHtmlFeatures } from "../features/htmlFeatures.js";
import type { FeatureName } from "./types.js";

export interface ExtractFeaturesInput {
  statusCode: number;
  bodyBytes: Uint8Array;
  contentLengthHeader?: string;
  rawResponseBytes?: Uint8Array;
}

function bytesToLatin1(bytes: Uint8Array, start: number, end: number): string {
  let s = "";
  for (let i = start; i < end; i++) {
    s += String.fromCharCode(bytes[i]);
  }
  return s;
}

export function splitRawResponseLines(rawResponseBytes: Uint8Array): string[] {
  const lines: string[] = [];
  let start = 0;

  for (let i = 0; i < rawResponseBytes.length; i++) {
    if (rawResponseBytes[i] !== 0x0a) {
      continue;
    }

    let end = i;
    if (end > start && rawResponseBytes[end - 1] === 0x0d) {
      end--;
    }
    lines.push(bytesToLatin1(rawResponseBytes, start, end));
    start = i + 1;
  }

  if (start < rawResponseBytes.length) {
    let end = rawResponseBytes.length;
    if (end > start && rawResponseBytes[end - 1] === 0x0d) {
      end--;
    }
    lines.push(bytesToLatin1(rawResponseBytes, start, end));
  }

  return lines;
}

export function extractHeaderNames(rawResponseBytes: Uint8Array): number {
  let names = "";
  for (const line of splitRawResponseLines(rawResponseBytes)) {
    if (line === "") {
      break;
    }
    const colonIdx = line.indexOf(":");
    if (colonIdx === -1) {
      continue;
    }
    names += line.substring(0, colonIdx);
  }
  return crc32Chars(names);
}

export function extractColonCount(rawResponseBytes: Uint8Array): number {
  let count = 0;
  for (let i = 0; i < rawResponseBytes.length; i++) {
    if (rawResponseBytes[i] === 0x3a) {
      count++;
    }
  }
  return count;
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
  const { statusCode, bodyBytes, contentLengthHeader, rawResponseBytes } = input;
  const raw = rawResponseBytes ?? new Uint8Array();
  const html = extractHtmlFeatures(bodyBytes);
  return {
    statusCode,
    contentLength: extractContentLength(bodyBytes, contentLengthHeader),
    bodyContent: crc32(bodyBytes),
    wordCount: extractWordCount(bodyBytes),
    lineCount: extractLineCount(bodyBytes),
    headerNames: extractHeaderNames(raw),
    colonCount: extractColonCount(raw),
    visibleText: html.visibleText,
    visibleWordCount: html.visibleWordCount,
    tagNames: html.tagNames,
  };
}
