# Anomaly Ranker for Caido

Anomaly Ranker is a Caido plugin inspired by the popular Burp Suite extension of the same name. It helps security researchers identify potentially interesting or vulnerable endpoints by calculating an "Anomaly Rank" for multiple HTTP requests simultaneously, so outliers in a cohort (a batch of similar requests) surface without manual diffing.

The plugin uses a Burp-inspired categorical frequency scorer (v1.4) that replicates the anomaly-ranking behavior of Burp Suite to highlight requests that deviate from the cohort baseline. SimHash and statistical hybrid scoring have been removed (see v1.2 in [CHANGELOG.md](CHANGELOG.md)).

## Features

- **Rank by selection**: Context menu, command palette, or `Ctrl+Shift+R` (`Cmd+Shift+R` on macOS).
- **Burp-inspired scoring**: Categorical frequency model with raw and normalized ranks, plus per-feature explainability.
- **Fast at scale**: Bounded concurrency (50 parallel fetches) with pure feature extraction and no external ML dependencies.
- **Productive UI**: Filterable table with Raw column, expandable "Why anomalous?" panel, cohort warnings, viewer, and bulk actions.

## Screenshots

![1769499802835](image/README/dashboard.png)

![1769499830103](image/README/commands.png)

![1769499906589](image/README/autocompletion.png)

## Installation

1. Download the `plugin_package.zip` from the latest release.
2. Open Caido and navigate to the **Plugins** tab.
3. Click **Install Plugin** and select the downloaded zip file.
4. The **Anomaly Rank** sidebar item should appear immediately.

## Build from source

```bash
bun install
bun run build   # bundles the plugin into dist/plugin_package.zip
```

`bun run package` is an alias for `bun run build` (both run `caido-dev build` and produce `dist/plugin_package.zip`). Other commands: `bun run test` (Vitest unit tests for the scorer, feature extractors, and static golden fixtures - see `src/backend/test/fixtures/` and `VALIDATION.md`).

## Anomaly Ranking Algorithm

The scorer replicates the anomaly-ranking behavior of Burp Suite Pro's ANOMALY ranker. For each cohort of responses:

1. Extract 10 categorical features per response (details below).
2. For each attribute with more than one distinct value across the cohort (`k > 1`), assign weight `0.9^k`. Attributes with `k <= 1` (every response shares the same value) contribute nothing - they carry no anomaly signal.
3. Per response, sum `weight / frequency` across the dynamic (`k > 1`) attributes, where `frequency` is how many cohort members share that response's value for that attribute. Rarer values (low frequency) push the sum up; common values push it down.
4. **Raw rank** = `Math.round(10000 * sum)`. No-response entries (request timed out or was never sent) score `-1` and are excluded from the frequency model entirely.
5. **Display rank** (0-100) min-max normalizes raw ranks across the cohort (`max === min` -> 0 for everyone). The `rank` field holds this normalized value; `rawRank` is kept alongside it for the Raw column.

Results sort by raw rank descending, then request id ascending. See [docs/algorithm.md](docs/algorithm.md) for a worked example and the exact derivation of each feature.

### The 10 attributes

| Attribute | What it measures |
| :--- | :--- |
| **Status code** | HTTP status integer. |
| **Content-Length** | Declared `Content-Length` header value; falls back to the response body's byte length when the header is absent (a malformed/non-numeric header value scores `0`). |
| **Body content** | CRC32 of the raw response body bytes (signed 32-bit). |
| **Word count** | Count of maximal runs of bytes `> 32` in the body (whitespace/control bytes as run boundaries). |
| **Line count** | Number of LF (`\n`) bytes in the body, plus one more if the body doesn't end with an LF (CR is ignored). |
| **Header names** | CRC32 of every header name (the substring before the first `:` on each header line) concatenated in raw-response order, case preserved, no separator; lines without a `:` are skipped. |
| **Colon count** | Count of the byte `0x3A` (`:`) across the *entire* raw response - status line, headers, and body. |
| **Visible text** | CRC32 of whitespace-normalized visible text gathered from HTML text nodes, excluding `<script>`/`<style>` inner content. |
| **Visible word count** | Sum of each visible text node's own whitespace-delimited word count (each node counted independently, not merged into one string first). |
| **Tag names** | CRC32 over the document-order sequence of tag names, each followed by a node-type byte (open/self-close/close). |

The three HTML-derived attributes (visible text, visible word count, tag names) are computed only when a minimal, dependency-free tokenizer (`src/backend/src/features/htmlFeatures.ts`) detects real markup - a non-empty node stream that isn't just a single text node - based on document structure, not the `Content-Type` header. Non-HTML and malformed bodies default these three attributes to `0` and never throw.

## Row Coloring (Crayon Rules)

The plugin uses standard security research color conventions:

| Condition | Color |
| :--- | :--- |
| **5xx** Server Error | Red |
| **4xx** Client Error | Amber |
| **3xx** Redirect | Olive |
| **2xx** + JSON | Green |
| **2xx** + XML | Blue |
| **2xx** + HTML | Cyan |
| Other **2xx** | Transparent |

## Usage

1. Navigate to **HTTP History** or **Search**.
2. Select one or more requests you wish to analyze.
3. Run **Anomaly Ranker: Rank Selection** via right-click menu (request row, request, or response context), command palette (`Ctrl+K` / `Cmd+K`), or the `Ctrl+Shift+R` (`Cmd+Shift+R` on macOS) shortcut.
4. The **Anomaly Rank** sidebar opens automatically with the results table.
5. The table shows both the normalized **Rank** (0-100) and the **Raw** score for each request. Three independent visual mechanisms are at play:
   - **Default row order** is the backend order: requests sorted by raw rank descending, tie-broken by request id ascending (`ranker.ts`). The table keeps this order (no column sort applied) until you click a column header; clicking cycles that column asc -> desc -> back to the default order.
   - **`rank-high` highlight** (bold red text on the Rank cell) fires when the normalized `rank > 70` - independent of the current sort/column-click state.
   - **Row left-border/background Crayon colors** (see above) come only from status code + content-type, independent of rank entirely.
6. Expand a row's **"Why anomalous?"** panel to see the per-feature contribution breakdown: each dynamic feature's value, its frequency in the cohort, distinct-value count, weight (`0.9^k`), and its contribution to the raw rank - sorted by contribution descending, so the biggest driver of the score is always first.
7. Watch for **cohort warnings** above the table: a small-cohort warning fires when fewer than 5 requests responded (rankings are statistically unreliable at that size), and a heterogeneous-cohort warning fires when 4 or more features vary across the cohort or the cohort spans 2+ status classes (2xx/3xx/4xx/5xx) - both signal that the cohort may not be a fair like-for-like comparison.
8. Use the **Selection** and **Export** dropdowns to process your findings.

## Limitations

- **Ranking is cohort-relative, not absolute.** A rank only means something in comparison to the other responses ranked alongside it - the same response scored in a different cohort will get a different rank.
- **Requires a comparable cohort.** Rank a batch of structurally similar requests (e.g. one endpoint under fuzzing, or one parameter varied across many values). Ranking dissimilar endpoints together produces a heterogeneous-cohort warning and a rank that's not meaningful.
- **HTML detection is structural, not `Content-Type`-based.** The tokenizer decides if a body is HTML by whether it contains real markup, not by trusting response headers - so a JSON body containing `<`-looking text can misclassify in rare edge cases, and a body served as `text/html` with no tags in it registers as plain text (all three HTML features default to `0`).

## Development

Built using the Caido Plugin SDK.

- **Frontend**: TypeScript + Vite
- **Backend**: QuickJS
- **Bundler**: `@caido-community/dev`

## Releasing

To publish a new version of the plugin, follow these steps:

1. **Bump Version**: Update the version in `package.json` and `manifest.json`.
   ```json
   "version": "1.4.x"
   ```
2. **Commit and Push**:
   ```bash
   git add package.json manifest.json
   git commit -m "chore: bump version to 1.4.x"
   git push origin main
   ```
3. **Create Tag**: Push a tag matching `v*` to trigger the release workflow.
   ```bash
   git tag v1.4.x
   git push origin v1.4.x
   ```
4. **Automated Release**: GitHub Actions will automatically:
   - Build the plugin.
   - Sign the package using the `PRIVATE_KEY` secret.
   - Create a new GitHub release with the signed `plugin_package.zip`.

## Attribution & License

This plugin is an independent reimplementation inspired by Burp Suite's anomaly-ranking behavior. It is not affiliated with or endorsed by PortSwigger. "Burp" and "Burp Suite" are trademarks of PortSwigger Ltd. No Burp Suite code is included in this project.

## Credits

Based on the [Anomaly Ranker Burp Extension](https://github.com/aleister1102/AnomalyRankContextMenu) by aleister1102.
