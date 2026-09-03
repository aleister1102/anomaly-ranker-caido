# Anomaly Ranker for Caido

Anomaly Ranker is a Caido plugin that surfaces HTTP responses that differ from the rest of a selected comparison set. Its Burp-inspired categorical frequency scorer highlights unusual status codes, sizes, content, and structure without external machine-learning dependencies.

## Features

- **Scan full history**: Check every matching request with optional HTTPQL filtering, an in-scope-only option enabled by default, automatic media-file exclusion, and no fixed request cap.
- **Incremental results**: See ranked responses while a scan runs, cancel at any time, and keep the partial ranking.
- **Rank by selection**: Use the context menu, command palette, or `Ctrl+Shift+R` (`Cmd+Shift+R` on macOS).
- **Efficient large scans**: Rank the request and response records already returned by Caido history pages instead of fetching every record again.
- **Focused triage UI**: Review scan progress, high-signal counts, changing fields, status mix, plain-language comparison notes, and per-response signal details.

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

`bun run package` aliases `bun run build`; `bun run test` runs the Vitest suite (see `VALIDATION.md`).

## Anomaly Ranking Algorithm

Per response, sum `weight / frequency` over the attributes with more than one distinct value in the cohort, where `weight = 0.9^k` (`k` = distinct values for that attribute). `rawRank = round(10000 * sum)`; no-response entries score `-1` and are excluded. The 0-100 display rank is a min-max normalization of raw ranks across the cohort. Results sort by raw rank descending, then request id ascending.

The 10 attributes: status code, content length, body content, word count, line count, header names, colon count, visible text, visible word count, and tag names. The 3 HTML-derived attributes (visible text, visible word count, tag names) are computed only when the body is structurally HTML, else `0`. See [docs/algorithm.md](docs/algorithm.md) for the full per-attribute derivation and a worked example.

## Status markers

The response table uses a score rail to make high-signal rows easy to scan. A small status dot also follows standard security research colors:

| Condition | Color |
| :--- | :--- |
| **5xx** server error | Red |
| **4xx** client error | Amber |
| **3xx** redirect | Olive |
| **2xx** + JSON | Green |
| **2xx** + XML | Blue |
| **2xx** + HTML | Cyan |
| Other **2xx** | Neutral |

## Usage

1. Open **Anomaly Rank** from the Caido sidebar.
2. Optionally enter a **History filter** and choose whether to scan **In-scope only**, then select **Start**. Image, audio, video, and font resources are skipped.
3. Review ranked responses as they appear. Select **Pause** to keep the latest partial ranking, then select **Resume** to continue from the same cursor.
4. Use **High signal**, **Signals**, and **Status mix** to understand the current comparison.
5. Select a response to inspect its request and response. Use **Selection** and **Export** to process result groups.

You can also select requests in **HTTP History** or **Search**, then run **Anomaly Ranker: Rank Selection** from the context menu, command palette (`Ctrl+K` / `Cmd+K`), or `Ctrl+Shift+R` (`Cmd+Shift+R` on macOS).

## Limitations

- **Scores are relative, not absolute.** A score only compares a response with the other responses checked at the same time.
- **Similar requests give clearer results.** Filter to one endpoint or request family when possible. Mixing unrelated endpoints can make unusual responses harder to interpret.

## Development

- **Frontend**: TypeScript + Vite
- **Backend**: QuickJS
- **Bundler**: `@caido-community/dev`

## Releasing

Bump the version in `package.json` and `manifest.json`, then push a `v*` tag (e.g. `v1.4.x`). GitHub Actions builds the plugin, signs the package with the `PRIVATE_KEY` secret, and publishes a GitHub release with the signed `plugin_package.zip`.

## Attribution & License

This plugin is an independent reimplementation inspired by Burp Suite's anomaly-ranking behavior. It is not affiliated with or endorsed by PortSwigger. "Burp" and "Burp Suite" are trademarks of PortSwigger Ltd. No Burp Suite code is included in this project.

## Credits

Based on the [Anomaly Ranker Burp Extension](https://github.com/aleister1102/AnomalyRankContextMenu) by aleister1102.
