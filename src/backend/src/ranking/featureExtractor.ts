import { crc32, crc32Chars } from "../features/crc32.js";
import { extractHtmlFeatures } from "../features/htmlFeatures.js";
import { parseMimeType } from "../mime.js";
import type { FeatureName } from "./types.js";

export interface ExtractFeaturesInput {
  statusCode: number;
  bodyBytes: Uint8Array;
  contentLengthHeader?: string;
  contentType?: string;
  rawResponseBytes?: Uint8Array;
}

function isHtmlContentType(contentType: string): boolean {
  const mime = parseMimeType(contentType);
  return mime === "text/html" || mime === "application/xhtml+xml";
}

function bytesToLatin1(bytes: Uint8Array, start: number, end: number): string {
  let s = "";
  for (let i = start; i < end; i++) {
    s += String.fromCharCode(bytes[i]);
  }
  return s;
}


function findBodyStart(bytes: Uint8Array): number {
  const len = bytes.length;
  for (let i = 0; i < len - 1; i++) {
    if (bytes[i] === 0x0a) {
      if (i + 1 < len && bytes[i + 1] === 0x0a) return i + 2;
      if (i + 2 < len && bytes[i + 1] === 0x0d && bytes[i + 2] === 0x0a) return i + 3;
    }
  }
  return len;
}

export function extractHeaderNames(rawResponseBytes: Uint8Array): number {
  let names = "";
  const len = rawResponseBytes.length;
  let lineStart = 0;

  for (let i = 0; i < len; i++) {
    if (rawResponseBytes[i] !== 0x0a) continue;

    let lineEnd = i;
    if (lineEnd > lineStart && rawResponseBytes[lineEnd - 1] === 0x0d) {
      lineEnd--;
    }

    if (lineEnd === lineStart) {
      break;
    }

    let colonIdx = -1;
    for (let j = lineStart; j < lineEnd; j++) {
      if (rawResponseBytes[j] === 0x3a) {
        colonIdx = j;
        break;
      }
    }

    if (colonIdx !== -1) {
      names += bytesToLatin1(rawResponseBytes, lineStart, colonIdx);
    }

    lineStart = i + 1;
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


export function extractFeatures(
  input: ExtractFeaturesInput,
): Record<FeatureName, number> {
  const {
    statusCode,
    bodyBytes,
    contentLengthHeader,
    contentType,
    rawResponseBytes,
  } = input;
  const raw = rawResponseBytes ?? new Uint8Array();
  let body = bodyBytes;
  if (body.length === 0 && raw.length > 0) {
    body = raw.subarray(findBodyStart(raw));
  }
  const len = body.length;
  let wordCount = 0;
  let lineCount = 0;
  let inWord = false;

  for (let i = 0; i < len; i++) {
    const b = body[i];
    if (b === 0x0a) {
      lineCount++;
    }
    if (b > 32) {
      if (!inWord) {
        wordCount++;
        inWord = true;
      }
    } else {
      inWord = false;
    }
  }
  if (len > 0 && body[len - 1] !== 0x0a) {
    lineCount++;
  }

  const html =
    contentType === undefined || isHtmlContentType(contentType)
      ? extractHtmlFeatures(body)
      : { hasMarkup: false, visibleText: 0, visibleWordCount: 0, tagNames: 0 };
  return {
    statusCode,
    contentLength: extractContentLength(body, contentLengthHeader),
    bodyContent: crc32(body),
    wordCount,
    lineCount,
    headerNames: extractHeaderNames(raw),
    colonCount: extractColonCount(raw),
    visibleText: html.visibleText,
    visibleWordCount: html.visibleWordCount,
    tagNames: html.tagNames,
  };
}
