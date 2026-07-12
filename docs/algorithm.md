# Algorithm Deep Dive

This document is the detailed reference for the scoring model implemented in `src/backend/src/ranking/`. See the [README](../README.md) for the user-facing summary.

## Scoring model

For a cohort (a batch of responses ranked together):

1. Extract the 10 feature values for every response that got one (see [Features](#features) below). Responses with no response (`hasResponse: false`) are excluded from the frequency model and score `rawRank = -1`.
2. For each of the 10 attributes, build a frequency table over the cohort: value -> count of responses sharing that value.
3. Count `k`, the number of distinct values for that attribute across the cohort. If `k <= 1` (every responded request has the same value), the attribute is static and contributes nothing - it carries no anomaly signal.
4. For each attribute with `k > 1`, its weight is `0.9^k`. A larger `k` (more variety in the cohort for that attribute) lowers the weight; this keeps any single attribute from dominating when it's highly fragmented.
5. For a given response, its contribution from a dynamic attribute is `weight / frequency`, where `frequency` is how many cohort members share this response's own value. Rarer values (lower frequency) get a bigger contribution.
6. `rawRank = Math.round(10000 * sum of contributions across all dynamic attributes)`.
7. Results sort by `rawRank` descending, then request id ascending, for determinism.

Source: `src/backend/src/ranking/burpScorer.ts` (`buildFrequencyTables`, `scoreOne`, `scoreFeatureSets`).

## Worked example

Three responses in one cohort, identical in every attribute except status code:

| Request | Status | Everything else |
| :--- | :--- | :--- |
| A | 200 | identical |
| B | 200 | identical |
| C | 500 | identical |

Only `statusCode` varies (`k = 2`: values `{200, 500}`). Every other attribute has `k <= 1` and is excluded.

- `weight = 0.9^2 = 0.81`
- A and B share value `200`, `frequency = 2` -> `contribution = 0.81 / 2 = 0.405` -> `sum = 0.405` -> `rawRank = round(10000 * 0.405) = 4050`
- C is alone with value `500`, `frequency = 1` -> `contribution = 0.81 / 1 = 0.81` -> `sum = 0.81` -> `rawRank = round(10000 * 0.81) = 8100`

Result: A and B both rank `4050`, C ranks `8100` - the one response that broke from the pack (the 500) is scored twice as anomalous as the two identical 200s, exactly reflecting that it's the rarer, more interesting outlier.

## Features

Extraction lives in `src/backend/src/ranking/featureExtractor.ts` unless noted. All ten are always computed (the three HTML ones may resolve to `0`, see below); which ones actually affect ranking depends on which have `k > 1` in the cohort.

1. **`statusCode`** - the response's HTTP status integer as-is (`resp.getCode() || 0` in `ranker.ts`).

2. **`contentLength`** (`extractContentLength`) - if a `Content-Length` header is present, its trimmed value is parsed as an integer (`parseInt(trimmed, 10)`); a non-numeric value yields `0`. If the header is absent, falls back to `bodyBytes.length` (the actual body byte length).

3. **`bodyContent`** (`crc32(bodyBytes)`) - standard CRC-32 (polynomial `0xEDB88320`, the same table-driven algorithm as zlib/PKZIP) computed over the raw response body bytes, then cast to a signed 32-bit integer (`| 0`) so the value fits a normal JS number range consistently with the other CRC features.

4. **`wordCount`** (`extractWordCount`) - scans the body bytes and counts maximal runs of bytes with value `> 32` (i.e. anything above the ASCII space/control range) as "words." A byte `<= 32` (space, tab, LF, CR, control chars) ends the current run.

5. **`lineCount`** (`extractLineCount`) - counts LF bytes (`0x0A`) in the body, then adds one more if the last byte of the body is not itself an LF (an unterminated trailing line still counts). An empty body is `0`. CR bytes are not treated specially.

6. **`headerNames`** (`extractHeaderNames`) - splits the *raw* response into lines (`splitRawResponseLines`, which handles both `\n` and `\r\n` line endings and treats CR as part of the line terminator, not the header text), stops at the first blank line (end of headers), and for each header line takes the substring before its first `:` (lines without a `:` are skipped). All those name substrings are concatenated with no separator, in raw-response order, case preserved, then CRC32'd via `crc32Chars` (same algorithm as `crc32`, but reading a string's char codes masked to a byte, `charCodeAt(i) & 0xff`, instead of a `Uint8Array`).

7. **`colonCount`** (`extractColonCount`) - a single pass over the *entire* raw response bytes (status line + headers + blank line + body, i.e. everything Caido gives back via `getRaw().toBytes()`), counting every occurrence of the byte `0x3A` (`:`). Unlike `headerNames`, this is not limited to the header section.

8. **`visibleText`**, 9. **`visibleWordCount`**, 10. **`tagNames`** - see [HTML features](#html-features) below.

### CRC32 detail

`src/backend/src/features/crc32.ts` implements the standard CRC-32 algorithm (IEEE 802.3 polynomial, reflected, `0xFFFFFFFF` init/final XOR) with a precomputed 256-entry table. Two entry points share the table:

- `crc32(bytes: Uint8Array)` - feeds raw body bytes directly, used for `bodyContent`.
- `crc32Chars(s: string)` - feeds a JS string's character codes, each masked with `& 0xFF` before mixing into the CRC, used for `headerNames`, `visibleText`, and `tagNames` where the input is text assembled in-memory (header name substrings, normalized visible text, tag-name stream) rather than a byte buffer.

Both return the CRC cast to a signed 32-bit integer via `| 0`, so two features are equal only if their underlying byte/char sequences are bit-for-bit identical.

### HTML features

Implemented in `src/backend/src/features/htmlFeatures.ts`. `extractHtmlFeatures(bodyBytes)`:

1. Decodes the body as UTF-8 (`TextDecoder("utf-8", { fatal: false })` - never throws, replaces invalid sequences).
2. Runs a minimal, dependency-free tokenizer (`tokenizeHtml`) over the decoded string. It walks the string looking for `<`: skips comments (`<!-- ... -->`, consumed to `-->` or end-of-input if unterminated) and declarations/processing instructions (`<!` / `<?`, consumed to the next `>`); a `<` not followed by a letter (and not a comment/declaration) is left as ordinary text. A recognized tag is parsed for its name (`[a-zA-Z0-9:_-]+`), scanned to its closing `>` while respecting quoted attribute values (so a `>` inside a quoted attribute doesn't end the tag early), and classified as a close tag (`type 1`, e.g. `</div>`), self-closing (`type 4`, e.g. `<br/>`), or open (`type 0`, e.g. `<div>`). `<script>` and `<style>` open tags additionally skip their raw inner content up to (not including) the matching `</script`/`</style`, so script/style bodies never become text nodes.
3. **Structural HTML detection**: the body is considered HTML only if the tokenizer produced at least one node and it isn't just a single bare text node (`hasMarkup = nodes.length > 0 && !(nodes.length === 1 && nodes[0].kind === "text")`). This is a structural check on the token stream, not a `Content-Type` header check. If `hasMarkup` is false, all three HTML features resolve to `0` and the function returns immediately - no exceptions are thrown for malformed markup.
4. When markup is detected, the tokenizer's node stream is walked once:
   - Each **text node**'s raw text is appended to a running `text` buffer (used for `visibleText`) and also split independently on `/\s+/` (filtering empty strings) to add to a running `wordCount` - **per node**, not after concatenating all text together, so word boundaries never merge across tag boundaries (e.g. `<b>foo</b>bar` counts `foo` and `bar` as two words even though nothing separates them once tags are stripped).
   - Each **tag node** appends `name + String.fromCharCode(type)` to a `tagStream` string (tag name immediately followed by the raw type byte 0/1/4, no separator).
5. Final values:
   - **`visibleText`** = `crc32Chars(normalizeWhitespace(text))`, where `normalizeWhitespace` collapses all whitespace runs (`/\s+/gu`) to a single space and trims the ends.
   - **`visibleWordCount`** = the accumulated per-node word count (an integer, not a hash).
   - **`tagNames`** = `crc32Chars(tagStream)`, hashing the full document-order sequence of tag name + type-byte pairs.

## Cohort and normalization effects

- **`rawRank`** is the raw, unbounded score described above; it is meaningful for comparing responses *within the same cohort* only, since weights and frequencies are recomputed per cohort.
- **Display `rank`** (0-100) is a min-max normalization of `rawRank` across the cohort: `round(((rawRank - min) / (max - min)) * 100)`, or `0` for every response if `max === min` (a fully uniform cohort). This is what drives default table sorting and is stored in the `rank` field; `rawRank` is retained separately for the Raw column and as the actual sort/tie-break key.
- **Cohort composition changes results.** Because `k` (distinct-value count) and `frequency` are both recomputed from whichever responses are in the current cohort, ranking the same response in a different batch of responses will generally produce a different `rawRank` and `rank`. This is inherent to a cohort-relative anomaly model, not a bug - see [Limitations](../README.md#limitations) in the README.
- **Small and heterogeneous cohorts get flagged** (`buildCohortSummary` in `src/backend/src/ranker.ts`): fewer than 5 responded requests triggers a small-cohort warning; 4 or more dynamic (`k > 1`) features or 2+ distinct status classes (2xx/3xx/4xx/5xx) among responded requests triggers a heterogeneous-cohort warning. Both are advisory - the ranking still computes, but the result is less trustworthy as a like-for-like comparison.
