import { describe, expect, it } from "vitest";
import { crc32Chars } from "../src/features/crc32.js";
import { extractHtmlFeatures, tokenizeHtml } from "../src/features/htmlFeatures.js";

function bytes(s: string): Uint8Array {
  return new TextEncoder().encode(s);
}

describe("extractHtmlFeatures", () => {
  it("excludes script/style inner text from visible text and word count", () => {
    const withScript = extractHtmlFeatures(
      bytes("<html><body><p>hello world</p><script>var secret='leak';</script></body></html>"),
    );
    const withoutScript = extractHtmlFeatures(
      bytes("<html><body><p>hello world</p></body></html>"),
    );
    expect(withScript.visibleText).toBe(withoutScript.visibleText);
    expect(withScript.visibleWordCount).toBe(withoutScript.visibleWordCount);

    const withStyle = extractHtmlFeatures(
      bytes("<html><body><p>hello world</p><style>.a{color:red}</style></body></html>"),
    );
    expect(withStyle.visibleText).toBe(withoutScript.visibleText);
    expect(withStyle.visibleWordCount).toBe(withoutScript.visibleWordCount);
  });

  it("is unaffected by whitespace-only markup changes", () => {
    const a = extractHtmlFeatures(bytes("<div><p>hello   world</p></div>"));
    const b = extractHtmlFeatures(bytes("<div>\n  <p>hello\nworld</p>\n</div>"));
    expect(a.visibleText).toBe(b.visibleText);
  });

  it("changes the tag fingerprint on structural change", () => {
    const a = extractHtmlFeatures(bytes("<div><p>hi</p></div>"));
    const b = extractHtmlFeatures(bytes("<div><span>hi</span></div>"));
    expect(a.tagNames).not.toBe(b.tagNames);
  });

  it("changes the visible-text fingerprint on text change", () => {
    const a = extractHtmlFeatures(bytes("<div>hello</div>"));
    const b = extractHtmlFeatures(bytes("<div>goodbye</div>"));
    expect(a.visibleText).not.toBe(b.visibleText);
  });

  it("processes malformed HTML deterministically without throwing", () => {
    const malformed = [
      "<div><p>unterminated",
      "<div class=\"a<b\">text</div>",
      "<<<>>>",
      "<div>a<span>b</div>c</span>",
      "<!-- unterminated comment <div>",
    ];
    for (const html of malformed) {
      expect(() => extractHtmlFeatures(bytes(html))).not.toThrow();
      const first = extractHtmlFeatures(bytes(html));
      const second = extractHtmlFeatures(bytes(html));
      expect(first).toEqual(second);
    }
  });

  it("treats non-markup bodies as not-HTML (all zero)", () => {
    expect(extractHtmlFeatures(bytes(""))).toEqual({
      hasMarkup: false,
      visibleText: 0,
      visibleWordCount: 0,
      tagNames: 0,
    });
    expect(extractHtmlFeatures(bytes("just plain text, no markup"))).toEqual({
      hasMarkup: false,
      visibleText: 0,
      visibleWordCount: 0,
      tagNames: 0,
    });
  });
});

describe("utf-8 decoding (no TextDecoder)", () => {
  it("decodes 2-byte sequences without mojibake", () => {
    const f = extractHtmlFeatures(bytes("<p>café</p>"));
    expect(f.hasMarkup).toBe(true);
    expect(f.visibleWordCount).toBe(1);
    expect(f.visibleText).toBe(crc32Chars("café"));
  });

  it("decodes 4-byte code points", () => {
    const f = extractHtmlFeatures(bytes("<p>🎉</p>"));
    expect(f.hasMarkup).toBe(true);
    expect(f.visibleWordCount).toBe(1);
  });

  it("does not throw on invalid lead bytes", () => {
    const f = extractHtmlFeatures(new Uint8Array([0xff, 0xfe, 0x3c, 0x70, 0x3e]));
    expect(f.hasMarkup).toBe(true);
  });

  it("does not throw on truncated multi-byte sequences", () => {
    const f = extractHtmlFeatures(new Uint8Array([0xf0, 0x9f, 0x8e]));
    expect(f.hasMarkup).toBe(false);
  });
});

describe("tokenizeHtml", () => {
  it("emits open/close/self-close node types", () => {
    const nodes = tokenizeHtml("<div>hi<br/></div>");
    expect(nodes).toEqual([
      { kind: "tag", name: "div", type: 0 },
      { kind: "text", text: "hi" },
      { kind: "tag", name: "br", type: 4 },
      { kind: "tag", name: "div", type: 1 },
    ]);
  });

  it("excludes comments from the node stream", () => {
    const nodes = tokenizeHtml("<div>a<!-- comment -->b</div>");
    const text = nodes
      .filter((n) => n.kind === "text")
      .map((n) => (n as { text: string }).text)
      .join("");
    expect(text).toBe("ab");
  });
});
