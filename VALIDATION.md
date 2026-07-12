# Static Golden Validation

This document describes how `src/backend/test/goldenValidation.test.ts` validates
the Burp-inspired scorer against hand-derived expected values, without any live
Burp Suite instance, Java runtime, or network dependency - fully offline and
CI-safe.

No decompiled Burp source is copied, embedded, or pasted anywhere in this repo.
The class names below (e.g. `Zvn2`, `Zkm8`) are cited only as reference
pointers to where the original reverse-engineered behavior was located during
independent reimplementation - not as source material.

## Algorithm being validated

For a cohort of responded entries, and for each of the 10 categorical
attributes described in `README.md`:

1. `k(a)` = number of distinct values of attribute `a` across the cohort.
2. An attribute is **dynamic** only if `k(a) > 1`; constant attributes
   contribute nothing (reference: `Zp9p`).
3. `weight(a) = 0.9 ^ k(a)` (reference: `Zzm`).
4. For a response `r`, `contribution(a, r) = weight(a) / frequency(a, value(a, r))`,
   where `frequency` counts how many cohort members share that same value.
5. `rawRank(r) = Math.round(10000 * Σ contribution(a, r))` over all dynamic
   attributes (reference: `Zvn2`, `Zkm8`).
6. Entries with no response score `rawRank = -1` and are excluded from every
   frequency table (reference: `Zkm8`).

Hashing (CRC32, `bodyContent`/`headerNames`/`visibleText`/`tagNames`) uses the
standard CRC-32/ISO-HDLC polynomial, fed one `char & 0xFF` (or raw byte) at a
time, cast to a signed 32-bit integer (reference: `Zi3h`).

## Why the golden fixtures don't need the literal CRC32 output

`rawRank` depends only on **how many cohort members share the same value** for
each attribute (the frequency table), not on the literal numeric value of a
hash. Two entries with byte-identical bodies always produce the same
`bodyContent`/`visibleText`/`tagNames` hash (determinism), and two entries with
different bytes are treated as distinct values (a CRC32 collision across the
handful of short, deliberately distinct fixture bodies used here is
astronomically unlikely, and would be immediately visible as a test failure).

So every scenario in `src/backend/test/fixtures/goldenFixtures.ts` is built to
make the **grouping** fully known by construction: each scenario holds every
input dimension constant across its entries except the one(s) the named
family targets. With two baseline entries (frequency 2) and one anomalous
entry (frequency 1) differing in `D` attributes:

- `weight = 0.9^2 = 0.81` for each of those `D` dynamic attributes.
- Baseline contribution per dynamic attribute: `0.81 / 2 = 0.405`.
- Anomalous contribution per dynamic attribute: `0.81 / 1 = 0.81`.
- `rawRank(baseline) = round(D * 0.405 * 10000) = D * 4050`.
- `rawRank(anomaly) = round(D * 0.81 * 10000) = D * 8100`.

This is derived directly from the formula above, for each scenario, entirely
by hand - see the per-`describe` comments in `goldenValidation.test.ts` for the
exact `D` count and reasoning per fixture family.

## Fixture families covered

| Family | Scenario | D (dynamic attributes) |
|---|---|---|
| Status-code anomaly | `status-code anomaly` | 1 (`statusCode`) |
| Content-Length anomaly | `content-length anomaly` | 1 (`contentLength`) |
| Word-count anomaly | `word-count anomaly` | 2 (`bodyContent`, `wordCount`) |
| Line-count anomaly | `line-count anomaly` | 2 (`bodyContent`, `lineCount`) |
| Colon-count anomaly | `colon-count anomaly` | 1 (`colonCount`) |
| Header-name diff | `header-name diff` | 1 (`headerNames`) |
| Reflected-payload nonce / one-unique-body | `reflected-payload nonce / one-unique-body` | 2 (`bodyContent`, `wordCount`) |
| HTML visible-text change | `HTML visible-text change` | 2 (`bodyContent`, `visibleText`) |
| HTML tag-structure change | `HTML tag-structure change` | 2 (`bodyContent`, `tagNames`) |
| Two-template (symmetric noise) | `two-template (symmetric, non-anomalous)` | 3 (`bodyContent`, `visibleText`, `tagNames`), all entries tie |
| Malformed HTML | `malformed HTML` | 3 (`bodyContent`, `visibleText`, `tagNames`); asserted not to throw |
| Empty/binary body | `empty/binary` | 2 (`bodyContent`, `wordCount`); asserted not to throw |

Each scenario asserts the exact `rawRank` per entry and that anomalous entries
rank strictly above the shared baseline (descending order), matching Burp's
`-Integer.compare(rank, other)` ordering intent (reference: `Zfi9`) - this
implementation sorts descending by `rawRank`, tie-broken by request id
ascending, for determinism (Burp itself does not sort).

## HTML tokenizer (v1.4)

`src/backend/src/features/htmlFeatures.ts` is a minimal, dependency-free
tokenizer (no `htmlparser2` or other npm dependency) that emits tag
open/self-close/close nodes (name + node-type byte) and text nodes, skipping
comments and `<script>`/`<style>` inner text. Detection of "is this body
HTML" is structural: the node stream must be non-empty and not just a single
text node (reference: `Zrz1`) - not `Content-Type` sniffing. Malformed markup
(unterminated tags, stray `<`, mismatched close tags) is consumed
deterministically to end-of-input and never throws; see
`src/backend/test/htmlFeatures.test.ts` for direct coverage of that behavior.
