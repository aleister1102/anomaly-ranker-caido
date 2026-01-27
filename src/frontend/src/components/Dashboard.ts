import type { Caido } from "@caido/sdk-frontend";
import { BackendEndpoints, RankedResult } from "../../../shared/types.js";
import { ResultsTable } from "./ResultsTable.js";
import { RequestViewer } from "./RequestViewer.js";
import { Toolbar } from "./Toolbar.js";
import { toCsv, toFfuf } from "../utils/export.js";

// Module-level state for scan settings persistence
let scanLimit = 500;
let scanAll = false;
let httpqlFilter = "";

export function createDashboard(caido: Caido<BackendEndpoints>) {
  const container = document.createElement("div");
  container.className = "anomaly-dashboard";
  container.style.cssText = "display: flex; flex-direction: column; height: 100%; padding: 8px; box-sizing: border-box; gap: 8px; outline: none;";
  container.setAttribute("tabindex", "-1");

  // Prevent focus outline on modifier keys
  container.addEventListener("keydown", (e) => {
    if (["Shift", "CapsLock", "Control", "Alt", "Meta"].includes(e.key)) {
      const activeElement = document.activeElement;
      if (activeElement && ["INPUT", "SELECT", "TEXTAREA"].includes(activeElement.tagName)) {
        return;
      }
      (activeElement as HTMLElement)?.blur();
    }
  });

  // Add styles
  const style = document.createElement("style");
  style.textContent = getStyles();
  container.appendChild(style);

  // Components
  const viewer = new RequestViewer(caido);
  const table = new ResultsTable((id) => viewer.show(id));
  
  let currentResults: RankedResult[] = [];

  // Toolbar
  const toolbar = new Toolbar(caido, {
    scanLimit,
    scanAll,
    httpqlFilter,
    onScan: async (limit, all, filter) => {
      progressContainer.style.display = "flex";
      try {
        const start = performance.now();
        const results = await caido.backend.scanHistory({
          limit: all ? 100000 : limit,
          scanAll: all,
          filter: filter || undefined,
        });
        const durationMs = Math.max(0, performance.now() - start);

        if (results.length === 0) {
          caido.window.showToast(
            `No requests found (took ${durationMs.toFixed(0)} ms)`,
            { variant: "info", duration: 3000 }
          );
        } else {
          caido.window.showToast(
            `Scanned ${results.length} requests in ${durationMs.toFixed(0)} ms`,
            { variant: "success", duration: 3000 }
          );
        }
        
        // Update persisted state
        const values = toolbar.getValues();
        scanLimit = values.scanLimit;
        scanAll = values.scanAll;
        httpqlFilter = values.httpqlFilter;
        
        updateDashboard(results);
      } catch (err) {
        const errorMsg = err instanceof Error ? err.message : String(err);
        caido.window.showToast(`Scan failed: ${errorMsg}`, { variant: "error", duration: 5000 });
        caido.log.error("Scan history failed: " + errorMsg);
      } finally {
        progressContainer.style.display = "none";
      }
    },
    onBulkAction: (action) => handleBulkAction(action),
  });

  // Header
  const header = createHeader();

  // Progress indicator
  const progressContainer = document.createElement("div");
  progressContainer.style.cssText = "display: none; align-items: center; gap: 10px;";
  progressContainer.innerHTML = `<i class="fas fa-spinner fa-spin"></i> <span>Ranking requests...</span>`;

  // Table container
  const tableContainer = document.createElement("div");
  tableContainer.className = "anomaly-table-container";
  tableContainer.appendChild(table.getElement());

  // Assemble dashboard
  container.appendChild(header);
  container.appendChild(toolbar.getElement());
  container.appendChild(progressContainer);
  container.appendChild(tableContainer);
  container.appendChild(viewer.getElement());

  // Bulk action handler
  async function handleBulkAction(action: string) {
    const selectedIds = table.getSelectedIds();

    if (action === "clear-results") {
      caido.backend.clearResults();
      updateDashboard([]);
      return;
    }

    if (action === "select-all") {
      table.selectAll();
      return;
    }
    
    if (action === "deselect-all") {
      table.deselectAll();
      return;
    }
    
    const targets = selectedIds.length > 0 
      ? currentResults.filter(r => selectedIds.includes(r.id as unknown as string))
      : currentResults;

    if (targets.length === 0) {
      caido.window.showToast("No results to process", { variant: "info", duration: 2000 });
      return;
    }

    switch (action) {
      case "repeater":
        await sendToRepeater(targets);
        break;
      case "copy-urls":
        await copyUrls(targets);
        break;
      case "copy-curls":
        await copyCurls(targets);
        break;
      case "csv":
        exportCsv(targets);
        break;
      case "ffuf":
        alert(toFfuf(targets));
        break;
    }
  }

  async function sendToRepeater(targets: RankedResult[]) {
    let count = 0;
    for (const r of targets) {
      if (r.id) {
        await caido.replay.createSession({ type: "ID", id: r.id as string });
        count++;
      }
    }
    caido.window.showToast(`Sent ${count} requests to Replay`, { variant: "success", duration: 2000 });
  }

  async function copyUrls(targets: RankedResult[]) {
    const urls = targets.map(r => r.url).join("\n");
    navigator.clipboard.writeText(urls);
    caido.window.showToast(`${targets.length} URLs copied`, { variant: "success", duration: 2000 });
  }

  async function copyCurls(targets: RankedResult[]) {
    const curls: string[] = [];
    for (const r of targets) {
      const record = await caido.graphql.request({ id: r.id as string });
      if (record?.request?.raw) {
        const raw = record.request.raw;
        const lines = raw.split("\r\n");
        const [method] = lines[0].split(" ");
        const headers = lines.slice(1, lines.indexOf("")).map(h => `-H "${h}"`).join(" ");
        curls.push(`curl -X ${method} ${headers} "${r.url}"`);
      }
    }
    navigator.clipboard.writeText(curls.join("\n\n"));
    caido.window.showToast(`${curls.length} cURL commands copied`, { variant: "success", duration: 2000 });
  }

  function exportCsv(targets: RankedResult[]) {
    const csv = toCsv(targets);
    const blob = new Blob([csv], { type: "text/csv;charset=utf-8;" });
    const link = document.createElement("a");
    const url = URL.createObjectURL(blob);
    link.setAttribute("href", url);
    link.setAttribute("download", `anomaly_results_${new Date().toISOString()}.csv`);
    link.style.visibility = "hidden";
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    URL.revokeObjectURL(url);
    caido.window.showToast(`Exported ${targets.length} results to CSV`, { variant: "success", duration: 2000 });
  }

  function updateDashboard(results: RankedResult[]) {
    currentResults = results;
    table.update(currentResults);
  }

  return {
    element: container,
    onEnter: async () => {
      toolbar.setValues(scanLimit, scanAll, httpqlFilter);
      const results = await caido.backend.getResults();
      updateDashboard(results);
    },
    rankRequests: async (ids: string[]) => {
      progressContainer.style.display = "flex";
      try {
        const results = await caido.backend.rankRequests(ids);
        updateDashboard(results);
      } catch (err) {
        caido.log.error("Failed to rank requests: " + err);
      } finally {
        progressContainer.style.display = "none";
      }
    }
  };
}

function createHeader(): HTMLElement {
  const header = document.createElement("div");
  header.className = "anomaly-header";
  
  const title = document.createElement("h2");
  title.textContent = "Anomaly Ranker";
  title.style.margin = "0";
  header.appendChild(title);

  return header;
}

function getStyles(): string {
  return `
    .anomaly-dashboard,
    .anomaly-dashboard:focus,
    .anomaly-dashboard:focus-visible,
    .anomaly-dashboard:focus-within {
      outline: none !important;
      box-shadow: none !important;
    }
    .anomaly-dashboard *:focus {
      outline: none !important;
    }
    .anomaly-dashboard ::selection {
      background: var(--background-active, rgba(59, 130, 246, 0.3));
      color: inherit;
    }
    .anomaly-dashboard,
    .anomaly-dashboard input,
    .anomaly-dashboard button,
    .anomaly-dashboard select,
    .anomaly-dashboard textarea {
      font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, Helvetica,
        Arial, sans-serif;
    }
    .anomaly-dashboard .caido-table-header [data-field]:hover {
      background-color: var(--background-hover);
    }
    .anomaly-dashboard .caido-table-header .resize-handle {
      transition: background-color 0.2s;
    }
    .anomaly-dashboard .caido-table-header .resize-handle:hover {
      background-color: var(--color-primary, #3b82f6);
      opacity: 0.2;
    }
    .anomaly-dashboard .caido-table-header .resize-handle::after {
      content: "";
      position: absolute;
      right: 2px;
      top: 8px;
      bottom: 8px;
      width: 2px;
      background-color: var(--color-primary, #3b82f6);
      opacity: 0.6;
      border-radius: 1px;
    }
    .anomaly-dashboard .caido-table-header .resize-handle:hover::after {
      opacity: 1;
    }
    .anomaly-dashboard .caido-table-row {
      cursor: pointer;
      transition: background-color 0.1s;
    }
    .anomaly-dashboard .caido-table-row:focus {
      outline: none;
    }
    .anomaly-dashboard .caido-table-row:hover {
      background-color: var(--background-hover);
    }
    .anomaly-dashboard .caido-table-row.selected {
      background-color: rgba(59, 130, 246, 0.35) !important;
      box-shadow: inset 0 0 0 1px rgba(59, 130, 246, 0.6);
      color: var(--color-foreground);
    }
    .anomaly-dashboard .rank-high {
      font-weight: bold;
      color: #ef4444;
    }
    .anomaly-header {
      display: flex;
      justify-content: space-between;
      align-items: center;
      flex-shrink: 0;
      padding-bottom: 8px;
      border-bottom: 1px solid var(--border-color);
    }
    .anomaly-toolbar {
      display: flex;
      align-items: stretch;
      gap: 16px;
      padding: 10px 16px;
      background: var(--background-overlay);
      border: 1px solid var(--border-color);
      border-radius: 8px;
      flex-shrink: 0;
      box-shadow: 0 2px 4px rgba(0,0,0,0.1);
    }
    .anomaly-toolbar-group {
      display: flex;
      flex-direction: column;
      gap: 8px;
    }
    .anomaly-toolbar-controls {
      display: flex;
      align-items: center;
      gap: 8px;
    }
    .anomaly-toolbar-divider {
      align-self: stretch;
      width: 1px;
      background: var(--border-color);
      margin: 4px 0;
    }
    .anomaly-toolbar-label {
      font-size: 12px;
      font-weight: 700;
      text-transform: uppercase;
      letter-spacing: 0.05em;
      color: var(--color-foreground-secondary, #888);
      white-space: nowrap;
    }
    .anomaly-table-container {
      flex: 1;
      overflow-y: auto;
      display: flex;
      flex-direction: column;
      border: 1px solid var(--border-color);
      border-radius: 4px;
      outline: none !important;
      background: var(--background);
      font-size: 14px;
    }
    .anomaly-table-container:focus-within {
      outline: none !important;
    }
    .anomaly-viewer-container {
      height: 400px;
      min-height: 200px;
      border: 1px solid var(--border-color);
      border-radius: 4px;
      display: none;
      flex-direction: column;
      box-shadow: 0 -2px 10px rgba(0,0,0,0.2);
      position: relative;
    }
    .anomaly-viewer-resizer {
      height: 8px;
      margin-top: -4px;
      cursor: row-resize;
      z-index: 1001;
      position: absolute;
      top: 0;
      left: 0;
      right: 0;
      transition: background-color 0.2s;
    }
    .anomaly-viewer-resizer:hover {
      background-color: var(--color-primary, #3b82f6);
      opacity: 0.5;
    }
    .anomaly-viewer-header {
      padding: 10px;
      background: var(--background-overlay);
      border-bottom: 1px solid var(--border-color);
      display: flex;
      justify-content: space-between;
      align-items: center;
    }
    .anomaly-viewer-body {
      flex: 1;
      display: flex;
      width: 100%;
      overflow: hidden;
    }
    .anomaly-viewer-body > div {
      flex: 1;
      min-width: 0;
      overflow: hidden;
    }
    .caido-input {
      background: var(--background);
      color: var(--color-foreground);
      border: 1px solid var(--border-color);
      border-radius: 4px;
      padding: 6px 12px;
      font-size: 14px;
      transition: border-color 0.2s, box-shadow 0.2s;
      color-scheme: dark light;
    }
    .caido-input:hover {
      border-color: var(--border-color-hover, #555);
    }
    .caido-input:focus {
      border-color: var(--color-primary, #3b82f6);
      box-shadow: 0 0 0 2px rgba(59, 130, 246, 0.2);
    }
    .caido-input.invalid {
      border-color: #ef4444 !important;
    }
    .caido-input.invalid:focus {
      box-shadow: 0 0 0 2px rgba(239, 68, 68, 0.2) !important;
    }
    .caido-input.valid {
      border-color: #10b981 !important;
    }
    .httpql-error-message {
      color: #ef4444;
      font-size: 12px;
      margin-top: 4px;
      display: none;
    }
    .caido-input::placeholder {
      color: var(--color-foreground-secondary, #666);
    }
    .caido-checkbox-wrapper {
      display: flex;
      align-items: center;
      gap: 6px;
      cursor: pointer;
      user-select: none;
      padding: 4px 8px;
      border-radius: 4px;
      transition: background-color 0.2s;
      font-size: 14px;
    }
    .caido-checkbox-wrapper:hover {
      background-color: var(--background-hover);
    }
    .caido-checkbox-wrapper input {
      cursor: pointer;
      width: 14px;
      height: 14px;
    }
    .caido-checkbox-wrapper label {
      cursor: pointer;
      font-size: 14px;
      white-space: nowrap;
    }
    .custom-dropdown {
      position: relative;
      display: inline-block;
    }
    .custom-dropdown-trigger {
      background: var(--background);
      color: var(--color-foreground);
      border: 1px solid var(--border-color);
      border-radius: 4px;
      padding: 6px 32px 6px 12px;
      cursor: pointer;
      min-width: 120px;
      font-size: 14px;
      position: relative;
      transition: border-color 0.2s;
    }
    .custom-dropdown-trigger:hover {
      border-color: var(--color-primary, #3b82f6);
    }
    .custom-dropdown-trigger::after {
      content: "▼";
      position: absolute;
      right: 12px;
      top: 50%;
      transform: translateY(-50%);
      pointer-events: none;
      font-size: 10px;
    }
    .custom-dropdown-menu {
      position: absolute;
      top: 100%;
      left: 0;
      background: #1e1e1e;
      color: #e0e0e0;
      border: 1px solid #3a3a3a;
      border-radius: 4px;
      box-shadow: 0 4px 12px rgba(0,0,0,0.5);
      z-index: 1000;
      display: none;
      min-width: 100%;
      margin-top: 4px;
    }
    .custom-dropdown-menu.open {
      display: block;
    }
    .custom-dropdown-item {
      padding: 8px 12px;
      cursor: pointer;
      white-space: nowrap;
      font-size: 14px;
      color: #e0e0e0;
      transition: background-color 0.1s, color 0.1s;
    }
    .custom-dropdown-item:hover {
      background: #2a2a2a;
      color: #ffffff;
    }
    .custom-dropdown-item.disabled {
      color: #666666;
      cursor: default;
    }
    .custom-dropdown-item.disabled:hover {
      background: transparent;
      color: #666666;
    }
    .custom-dropdown-divider {
      border-top: 1px solid #3a3a3a;
      margin: 4px 0;
    }
  `;
}
