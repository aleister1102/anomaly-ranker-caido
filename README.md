# Anomaly Ranker for Caido

# Anomaly Ranker for Caido

Anomaly Ranker is a Caido plugin inspired by the popular Burp Suite extension of the same name. it helps security researchers identify potentially interesting or vulnerable endpoints by calculating an "Anomaly Rank" for multiple HTTP requests simultaneously.

The plugin identifies outliers in your traffic using statistical analysis and structural similarity (SimHash), highlighting requests that deviate from the "normal" baseline of your selection.

## Features

- **Context Menu Integration**: Right-click requests and select **Apply Anomaly Rank**.
- **Advanced Ranking**: Statistical analysis and SimHash structural similarity to find outliers.
- **High Performance**: Optimized SimHash engine with body truncation for speed.
- **Unified Dashboard**: Sortable table with Crayon-compatible coloring and advanced filtering.
- **Integrated Viewer**: Side-by-side Request/Response viewer with vertical resizing.
- **Bulk Actions**: Separate Selection and Export menus for rapid data processing.

## Anomaly Ranking Algorithm

The final rank (0-100) is a weighted combination of two main components:

1.  **Statistical Outliers**:
    - Calculates the Z-score for **Response Length**.
    - Assigns rarity scores to **Status Codes** and **Content-Types** within the dataset.
2.  **Structural Similarity (SimHash)**:
    - Generates a SimHash fingerprint for every response body.
    - Calculates the **Hamming Distance** from the centroid (the average fingerprint of the group).
    - Responses with high distance from the centroid (unique structures) receive higher ranks.

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

1.  Download the `plugin_package.zip` from the latest release.
2.  Open Caido and navigate to the **Plugins** tab.
3.  Click **Install Plugin** and select the downloaded zip file.
4.  The **Anomaly Rank** sidebar item should appear immediately.

## Usage

1.  Navigate to **HTTP History** or **Search**.
2.  Select one or more requests you wish to analyze.
3.  Right-click and select **Apply Anomaly Rank**.
4.  The **Anomaly Rank** sidebar will open automatically.
5.  Use the **Actions** dropdown to process your findings.

## Development

Built using the Caido Plugin SDK.

- **Frontend**: TypeScript + Vite
- **Backend**: QuickJS
- **Bundler**: `@caido-community/dev`

### Commands
- `bun run build`: Bundle the plugin into `dist/plugin_package.zip`.
- `bun run package`: Zip the manifest and bundled files.

## Releasing

To publish a new version of the plugin, follow these steps:

1. **Bump Version**: Update the version in `package.json` and `manifest.json`.
   ```json
   "version": "1.0.x"
   ```
2. **Commit and Push**:
   ```bash
   git add package.json manifest.json
   git commit -m "chore: bump version to 1.0.x"
   git push origin main
   ```
3. **Create Tag**: Push a tag matching `v*` to trigger the release workflow.
   ```bash
   git tag v1.0.x
   git push origin v1.0.x
   ```
4. **Automated Release**: GitHub Actions will automatically:
   - Build the plugin.
   - Sign the package using the `PRIVATE_KEY` secret.
   - Create a new GitHub release with the signed `plugin_package.zip`.

## Credits

Based on the [Anomaly Ranker Burp Extension](https://github.com/aleister1102/AnomalyRankContextMenu) by aleister1102.
