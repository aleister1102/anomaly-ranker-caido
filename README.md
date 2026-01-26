# Anomaly Ranker for Caido

# Anomaly Ranker for Caido

Anomaly Ranker is a Caido plugin inspired by the popular Burp Suite extension of the same name. it helps security researchers identify potentially interesting or vulnerable endpoints by calculating an "Anomaly Rank" for multiple HTTP requests simultaneously.

The plugin identifies outliers in your traffic using statistical analysis and structural similarity (SimHash), highlighting requests that deviate from the "normal" baseline of your selection.

## Features

- **Context Menu Integration**: Right-click any selection of requests in HTTP History or Search and select **Apply Anomaly Rank**.
- **Advanced Ranking Engine**:
  - **Statistical Analysis**: Detects outliers based on response length, status codes, and content-types.
  - **SimHash Similarity**: Computes 64-bit structural fingerprints of response bodies to find unique page layouts.
- **High Performance**:
  - **Optimized SimHash**: Uses a popcount lookup table for fast bitwise comparisons.
  - **Memory Efficient**: Uses typed arrays and character-scanning tokenization.
  - **Scalable**: Automatically truncates large response bodies (50KB limit) for ranking to ensure smooth UI performance with large datasets.
- **Unified Dashboard**:
  - **Sortable Table**: View results ranked from 0 to 100.
  - **Crayon-Compatible Coloring**: Rows are color-coded based on status codes and content-types (matches Crayon plugin rules).
  - **Multi-Select Support**: Use Shift+Click or Ctrl/Cmd+Click to manage subsets of results.
  - **Power Filtering**: Search by URL, Method, Status, or Content-Type.
- **Integrated Request Viewer**: Side-by-side Request and Response viewer for rapid analysis. Now vertically resizable to adjust layout.
- **Improved Bulk Actions**:
  - **Selection Controls**: Dedicated dropdown for Select All and Deselect All.
  - **Export Actions**: Dedicated dropdown for data export.
    - **Send to Replay**: Create Replay sessions for selected or all results.
    - **Copy URLs/Curls**: Quickly grab data for external tools.
    - **Export to CSV**: Download results as a CSV file for external analysis.
    - **FFUF Snippet**: Generate a command template for fuzzing.

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

## Credits

Based on the [Anomaly Ranker Burp Extension](https://github.com/aleister1102/AnomalyRankContextMenu) by aleister1102.
