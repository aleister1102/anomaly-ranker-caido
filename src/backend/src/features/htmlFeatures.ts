import { crc32Chars } from "./crc32.js";

export type HtmlNode =
  | { kind: "tag"; name: string; type: 0 | 1 | 4 }
  | { kind: "text"; text: string };

const RAW_TEXT_TAGS = new Set(["script", "style"]);

/**
 * Minimal, dependency-free HTML tokenizer. Never throws on malformed markup:
 * unterminated tags/comments are consumed to end-of-input deterministically.
 */
export function tokenizeHtml(html: string): HtmlNode[] {
  const nodes: HtmlNode[] = [];
  const len = html.length;
  let i = 0;
  let textStart = 0;

  const flushText = (end: number) => {
    if (end > textStart) {
      nodes.push({ kind: "text", text: html.slice(textStart, end) });
    }
  };

  while (i < len) {
    const lt = html.indexOf("<", i);
    if (lt === -1) {
      break;
    }

    if (html.startsWith("<!--", lt)) {
      flushText(lt);
      const end = html.indexOf("-->", lt + 4);
      i = end === -1 ? len : end + 3;
      textStart = i;
      continue;
    }

    if (html[lt + 1] === "!" || html[lt + 1] === "?") {
      flushText(lt);
      const end = html.indexOf(">", lt + 1);
      i = end === -1 ? len : end + 1;
      textStart = i;
      continue;
    }

    const isClose = html[lt + 1] === "/";
    const nameStart = isClose ? lt + 2 : lt + 1;
    if (!/[a-zA-Z]/.test(html[nameStart] ?? "")) {
      // Stray '<' not followed by a tag name - leave it as ordinary text.
      i = lt + 1;
      continue;
    }
    flushText(lt);

    let j = nameStart;
    while (j < len && /[a-zA-Z0-9:_-]/.test(html[j])) {
      j++;
    }
    const name = html.slice(nameStart, j);

    let k = j;
    let quote: string | null = null;
    while (k < len) {
      const c = html[k];
      if (quote) {
        if (c === quote) quote = null;
      } else if (c === '"' || c === "'") {
        quote = c;
      } else if (c === ">") {
        break;
      }
      k++;
    }
    const tagEnd = k;

    let selfClose = false;
    if (!isClose) {
      let p = tagEnd - 1;
      while (p > j && /\s/.test(html[p])) p--;
      if (html[p] === "/") selfClose = true;
    }

    i = tagEnd < len ? tagEnd + 1 : len;
    textStart = i;

    if (isClose) {
      nodes.push({ kind: "tag", name, type: 1 });
      continue;
    }

    nodes.push({ kind: "tag", name, type: selfClose ? 4 : 0 });

    const lowerName = name.toLowerCase();
    if (!selfClose && RAW_TEXT_TAGS.has(lowerName)) {
      const closeIdx = html.toLowerCase().indexOf("</" + lowerName, i);
      i = closeIdx === -1 ? len : closeIdx;
      textStart = i;
    }
  }
  flushText(len);
  return nodes;
}

export interface HtmlFeatures {
  hasMarkup: boolean;
  visibleText: number;
  visibleWordCount: number;
  tagNames: number;
}

function normalizeWhitespace(s: string): string {
  return s.replace(/\s+/g, " ");
}

export function extractHtmlFeatures(bodyBytes: Uint8Array): HtmlFeatures {
  const html = new TextDecoder("utf-8", { fatal: false }).decode(bodyBytes);
  const nodes = tokenizeHtml(html);
  const hasMarkup =
    nodes.length > 0 && !(nodes.length === 1 && nodes[0].kind === "text");

  if (!hasMarkup) {
    return { hasMarkup: false, visibleText: 0, visibleWordCount: 0, tagNames: 0 };
  }

  let text = "";
  let wordCount = 0;
  let tagStream = "";

  for (const node of nodes) {
    if (node.kind === "text") {
      text += node.text;
      wordCount += node.text.split(/\s+/).filter(Boolean).length;
    } else {
      tagStream += node.name + String.fromCharCode(node.type);
    }
  }

  return {
    hasMarkup: true,
    visibleText: crc32Chars(normalizeWhitespace(text)),
    visibleWordCount: wordCount,
    tagNames: crc32Chars(tagStream),
  };
}
