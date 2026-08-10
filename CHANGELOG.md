# Changelog

All notable changes to this project are documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.1.0/).

## v1.5

### Fixed
- Scan crash (`Scan failed: TextDecoder is not defined`) during HTML feature extraction: the backend plugin runs in QuickJS, which has no `TextDecoder` global. Replaced it with a dependency-free UTF-8 decoder that never throws.

## v1.4

### Added
- HTML-derived features: visible text, visible word count, and tag names, computed by a minimal dependency-free HTML tokenizer that detects real markup structurally (not via `Content-Type`).
- Static golden validation corpus (`src/backend/test/fixtures/`, see `VALIDATION.md`) to pin scorer output against known-good responses.

## v1.3

### Added
- Header-name and colon-count features (raw-response-derived attributes) alongside the existing byte-level features.
- Bounded-concurrency fetching (50 parallel requests) with a scan-generation guard so results from a superseded scan never overwrite a newer one.
- "Why anomalous?" explainability panel showing per-feature contribution breakdown for each ranked result.
- Cohort warnings for small (< 5 responses) and heterogeneous cohorts.

## v1.2

### Changed
- Replaced the SimHash + statistical hybrid scorer with the Burp-inspired categorical frequency scorer.
- Added low-complexity byte-level features (word count, line count) computed directly over raw bytes.

### Security
- Escaped `innerHTML` usage in the frontend to prevent XSS from response content rendered in the UI.
- CSV export now follows RFC 4180 quoting and guards against formula injection (leading `=`, `+`, `-`, `@`).
- cURL export uses POSIX-quoted arguments and includes the request body.
- Clipboard writes and clears are awaited instead of fired-and-forgotten.
- Replay now handles partial failures across a multi-request selection instead of aborting the whole batch.

### Added
- Vitest unit test suite and CI pipeline.
