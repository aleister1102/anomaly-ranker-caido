# Anomaly Ranker for Caido

Anomaly Ranker is a Caido plugin inspired by the popular Burp Suite extension of the same name. It helps security researchers identify potentially interesting or vulnerable endpoints by calculating an "Anomaly Rank" for multiple HTTP requests simultaneously.

The plugin uses a Burp-inspired categorical frequency scorer (v1.3) that replicates the anomaly-ranking behavior of Burp Suite to highlight requests that deviate from the cohort baseline. SimHash and statistical hybrid scoring have been removed.

## Features

- **Rank by selection**: Context menu, command palette, or `Ctrl+Shift+R` (`Cmd+Shift+R` on macOS).
- **Burp-inspired scoring**: Categorical frequency model with raw and normalized ranks, plus per-feature explainability.
- **Fast at scale**: Bounded concurrency (50 parallel fetches) with pure feature extraction and no external ML dependencies.
- **Productive UI**: Filterable table with Raw column, expandable "Why anomalous?" panel, cohort warnings, viewer, and bulk actions.

## Screenshots

![1769499802835](image/README/dashboard.png)

![1769499830103](image/README/commands.png)

![1769499906589](image/README/autocompletion.png)

## Anomaly Ranking Algorithm

The scorer replicates the anomaly-ranking behavior of Burp Suite Pro's ANOMALY ranker. For each cohort of responses:

1. Extract categorical features per response (v1.3 implements seven attributes):
   - **Status code** - HTTP status integer
   - **Content-Length** - declared header value, or body byte length when absent (malformed header → 0)
   - **Body content** - CRC32 of raw body bytes (signed 32-bit)
   - **Word count** - maximal runs of bytes `> 32` in the body
   - **Line count** - LF count plus one when the body does not end with LF (CR ignored)
   - **Header names** - CRC32 of header name substrings (before the first `:`) concatenated in raw-response line order, case preserved, no separator; lines without `:` are skipped
   - **Colon count** - count of byte `0x3A` over the entire raw response (status line, headers, and body)
2. For each attribute with more than one distinct value (`k > 1`), assign weight `0.9^k`.
3. Per response, sum `weight / frequency` across dynamic attributes.
4. **Raw rank** = `Math.round(10000 * sum)`. No-response entries score `-1` and are excluded from the frequency model.
5. **Display rank** (0-100) min-max normalizes raw ranks across the cohort (`max === min` → 0). The existing `rank` field holds this value for coloring and sorting defaults.

Results sort by raw rank descending, then request id ascending. The UI shows per-feature contributions (value, frequency, distinct count, weight, contribution) and warns when the cohort is small (< 5 responses) or heterogeneous.

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

## Installation

1. Download the `plugin_package.zip` from the latest release.
2. Open Caido and navigate to the **Plugins** tab.
3. Click **Install Plugin** and select the downloaded zip file.
4. The **Anomaly Rank** sidebar item should appear immediately.

## Usage

1. Navigate to **HTTP History** or **Search**.
2. Select one or more requests you wish to analyze.
3. Run **Anomaly Ranker: Rank Selection** via right-click menu, command palette, or `Ctrl+Shift+R` (`Cmd+Shift+R` on macOS).
4. The **Anomaly Rank** sidebar opens automatically.
5. Use the **Selection** and **Export** dropdowns to process your findings.

## Development

Built using the Caido Plugin SDK.

- **Frontend**: TypeScript + Vite
- **Backend**: QuickJS
- **Bundler**: `@caido-community/dev`

### Commands
- `bun run build`: Bundle the plugin into `dist/plugin_package.zip`.
- `bun run package`: Zip the manifest and bundled files.
- `bun run test`: Run Vitest unit tests for the Burp scorer.

## Releasing

To publish a new version of the plugin, follow these steps:

1. **Bump Version**: Update the version in `package.json` and `manifest.json`.
   ```json
   "version": "1.3.x"
   ```
2. **Commit and Push**:
   ```bash
   git add package.json manifest.json
   git commit -m "chore: bump version to 1.3.x"
   git push origin main
   ```
3. **Create Tag**: Push a tag matching `v*` to trigger the release workflow.
   ```bash
   git tag v1.3.x
   git push origin v1.3.x
   ```
4. **Automated Release**: GitHub Actions will automatically:
   - Build the plugin.
   - Sign the package using the `PRIVATE_KEY` secret.
   - Create a new GitHub release with the signed `plugin_package.zip`.

## Attribution & License

This plugin is an independent reimplementation inspired by Burp Suite's anomaly-ranking behavior. It is not affiliated with or endorsed by PortSwigger. "Burp" and "Burp Suite" are trademarks of PortSwigger Ltd. No Burp Suite code is included in this project.

## Credits

Based on the [Anomaly Ranker Burp Extension](https://github.com/aleister1102/AnomalyRankContextMenu) by aleister1102.
