import type { Caido } from "@caido/sdk-frontend";
import { BackendEndpoints, RankedResult } from "../../../shared/types.js";
import { ResultsTable } from "./ResultsTable.js";
import { RequestViewer } from "./RequestViewer.js";
import { toCsv, toFfuf } from "../utils/export.js";

// Module-level state for scan settings persistence
let scanLimit = 500;
let scanAll = false;
let httpqlFilter = "";

export function createDashboard(caido: Caido<BackendEndpoints>) {
  const container = document.createElement("div");
  container.className = "anomaly-dashboard";
  container.style.display = "flex";
  container.style.flexDirection = "column";
  container.style.height = "100%";
  container.style.padding = "20px";
  container.style.boxSizing = "border-box";
  container.style.gap = "20px";
  container.style.outline = "none";
  container.style.boxShadow = "none";
  container.setAttribute("tabindex", "-1");

  container.addEventListener("keydown", (e) => {
    if (e.key === "Shift" || e.key === "CapsLock" || e.key === "Control" || e.key === "Alt" || e.key === "Meta") {
      const activeElement = document.activeElement;
      if (activeElement && (activeElement.tagName === "INPUT" || activeElement.tagName === "SELECT" || activeElement.tagName === "TEXTAREA")) {
        return;
      }
      (activeElement as HTMLElement)?.blur();
    }
  });

  const style = document.createElement("style");
  style.textContent = `
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
      align-items: flex-end;
      gap: 16px;
      padding: 16px;
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
      content: "\f0d7";
      font-family: "Font Awesome 5 Free";
      font-weight: 900;
      position: absolute;
      right: 12px;
      top: 50%;
      transform: translateY(-50%);
      pointer-events: none;
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
  container.appendChild(style);

  // --- Components ---
  const viewer = new RequestViewer(caido);
  const table = new ResultsTable((id) => viewer.show(id));

  // --- Header ---
  const header = document.createElement("div");
  header.className = "anomaly-header";
  
  const title = document.createElement("h2");
  title.textContent = "Anomaly Ranker";
  title.style.margin = "0";
  header.appendChild(title);

  const clearBtn = caido.ui.button({
    label: "Clear Results",
    variant: "tertiary",
    size: "small",
  });
  clearBtn.addEventListener("click", async () => {
    await caido.backend.clearResults();
    updateDashboard([]);
  });
  header.appendChild(clearBtn);

  container.appendChild(header);

  // --- Toolbar ---
  const toolbar = document.createElement("div");
  toolbar.className = "anomaly-toolbar";

  // Scan Group
  const scanGroup = document.createElement("div");
  scanGroup.className = "anomaly-toolbar-group";
  
  const scanLabel = document.createElement("div");
  scanLabel.className = "anomaly-toolbar-label";
  scanLabel.textContent = "Scan History";
  scanGroup.appendChild(scanLabel);

  const scanControls = document.createElement("div");
  scanControls.className = "anomaly-toolbar-controls";

  const scanButton = caido.ui.button({
    label: "Scan",
    variant: "primary",
    size: "small",
  });

  const limitInput = document.createElement("input");
  limitInput.type = "number";
  limitInput.className = "caido-input";
  limitInput.style.width = "75px";
  limitInput.min = "1";
  limitInput.max = "100000";
  limitInput.value = scanLimit.toString();
  limitInput.placeholder = "Limit";
  limitInput.title = "Maximum requests to scan";

  const scanAllWrapper = document.createElement("div");
  scanAllWrapper.className = "caido-checkbox-wrapper";
  
  const scanAllCheckbox = document.createElement("input");
  scanAllCheckbox.type = "checkbox";
  scanAllCheckbox.id = "scan-all-checkbox";
  scanAllCheckbox.checked = scanAll;

  const scanAllLabel = document.createElement("label");
  scanAllLabel.htmlFor = "scan-all-checkbox";
  scanAllLabel.textContent = "All";
  scanAllLabel.title = "Scan all requests (ignores limit)";

  scanAllWrapper.appendChild(scanAllCheckbox);
  scanAllWrapper.appendChild(scanAllLabel);

  scanControls.appendChild(scanButton);
  scanControls.appendChild(limitInput);
  scanControls.appendChild(scanAllWrapper);
  scanGroup.appendChild(scanControls);

  // Divider
  const divider1 = document.createElement("div");
  divider1.className = "anomaly-toolbar-divider";

  // Filter Group
  const filterGroup = document.createElement("div");
  filterGroup.className = "anomaly-toolbar-group";
  filterGroup.style.flex = "1";

  const filterLabel = document.createElement("div");
  filterLabel.className = "anomaly-toolbar-label";
  filterLabel.textContent = "Scope Filter";
  filterGroup.appendChild(filterLabel);

  const filterControls = document.createElement("div");
  filterControls.className = "anomaly-toolbar-controls";

  const httpqlFilterInput = document.createElement("input");
  httpqlFilterInput.type = "text";
  httpqlFilterInput.className = "caido-input";
  httpqlFilterInput.style.width = "100%";
  httpqlFilterInput.style.minWidth = "200px";
  httpqlFilterInput.value = httpqlFilter;
  httpqlFilterInput.placeholder = "HTTPQL filter (e.g., host:example.com)";
  httpqlFilterInput.title = "Filter requests using HTTPQL syntax before scanning";

  const httpqlErrorMsg = document.createElement("div");
  httpqlErrorMsg.className = "httpql-error-message";

  filterControls.appendChild(httpqlFilterInput);
  filterControls.style.flexDirection = "column";
  filterControls.style.alignItems = "stretch";
  filterControls.appendChild(httpqlErrorMsg);
  filterGroup.appendChild(filterControls);

  // Divider
  const divider2 = document.createElement("div");
  divider2.className = "anomaly-toolbar-divider";

  // Actions Group
  const actionsGroup = document.createElement("div");
  actionsGroup.className = "anomaly-toolbar-group";

  const actionsLabel = document.createElement("div");
  actionsLabel.className = "anomaly-toolbar-label";
  actionsLabel.textContent = "Bulk Actions";
  actionsGroup.appendChild(actionsLabel);

  const actionsControls = document.createElement("div");
  actionsControls.className = "anomaly-toolbar-controls";

  const createCustomDropdown = (label: string, options: { label: string, value: string, disabled?: boolean, divider?: boolean }[]) => {
    const dropdown = document.createElement("div");
    dropdown.className = "custom-dropdown";
    
    const trigger = document.createElement("div");
    trigger.className = "custom-dropdown-trigger";
    trigger.textContent = label;
    dropdown.appendChild(trigger);

    const menu = document.createElement("div");
    menu.className = "custom-dropdown-menu";
    dropdown.appendChild(menu);

    options.forEach(opt => {
      if (opt.divider) {
        const divider = document.createElement("div");
        divider.className = "custom-dropdown-divider";
        menu.appendChild(divider);
        return;
      }

      const item = document.createElement("div");
      item.className = "custom-dropdown-item";
      if (opt.disabled) item.classList.add("disabled");
      item.textContent = opt.label;
      
      if (!opt.disabled) {
        item.addEventListener("click", () => {
          handleBulkAction(opt.value);
          menu.classList.remove("open");
        });
      }
      
      menu.appendChild(item);
    });

    trigger.addEventListener("click", (e) => {
      e.stopPropagation();
      // Close all other dropdowns
      document.querySelectorAll(".custom-dropdown-menu").forEach(m => {
        if (m !== menu) m.classList.remove("open");
      });
      menu.classList.toggle("open");
    });

    return dropdown;
  };

  const selectionDropdown = createCustomDropdown("Selection", [
    { label: "Select All", value: "select-all" },
    { label: "Deselect All", value: "deselect-all" },
  ]);

  const exportDropdown = createCustomDropdown("Export", [
    { label: "Send to Replay", value: "repeater" },
    { label: "Copy URLs", value: "copy-urls" },
    { label: "Copy as cURL", value: "copy-curls" },
    { label: "Export CSV", value: "csv" },
    { label: "FFUF Snippet", value: "ffuf" },
  ]);

  document.addEventListener("click", () => {
    document.querySelectorAll(".custom-dropdown-menu").forEach(m => m.classList.remove("open"));
  });

  actionsControls.appendChild(selectionDropdown);
  actionsControls.appendChild(exportDropdown);
  actionsGroup.appendChild(actionsControls);

  toolbar.appendChild(scanGroup);
  toolbar.appendChild(divider1);
  toolbar.appendChild(filterGroup);
  toolbar.appendChild(divider2);
  toolbar.appendChild(actionsGroup);

  container.appendChild(toolbar);

  // Scan button click handler
  scanButton.addEventListener("click", async () => {
    // Validate limit
    const limit = parseInt(limitInput.value);
    if (isNaN(limit) || limit < 1 || limit > 100000) {
      caido.window.showToast("Limit must be between 1 and 100000", { variant: "error", duration: 3000 });
      return;
    }

    // Show loading indicator and disable button
    (scanButton as HTMLButtonElement).disabled = true;
    progressContainer.style.display = "flex";

    try {
      const start = performance.now();
      // Call backend scanHistory
      const results = await caido.backend.scanHistory({
        limit: scanAll ? 100000 : limit,
        scanAll: scanAll,
        filter: httpqlFilter || undefined,
      });
      const durationMs = Math.max(0, performance.now() - start);

      // Update results table
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
      updateDashboard(results);
    } catch (err) {
      // Show error message
      const errorMsg = err instanceof Error ? err.message : String(err);
      caido.window.showToast(`Scan failed: ${errorMsg}`, { variant: "error", duration: 5000 });
      caido.log.error("Scan history failed: " + errorMsg);
    } finally {
      // Re-enable button and hide loading indicator
      (scanButton as HTMLButtonElement).disabled = false;
      progressContainer.style.display = "none";
    }
  });

  // Settings persistence - update state variables when inputs change
  limitInput.addEventListener("input", () => {
    const value = parseInt(limitInput.value);
    if (!isNaN(value)) {
      scanLimit = value;
    }
  });

  let validationTimeout: ReturnType<typeof setTimeout>;
  httpqlFilterInput.addEventListener("input", () => {
    httpqlFilter = httpqlFilterInput.value;

    clearTimeout(validationTimeout);
    validationTimeout = setTimeout(async () => {
      const result = await caido.backend.validateHttpql(httpqlFilter);
      if (result.valid) {
        httpqlFilterInput.classList.remove("invalid");
        httpqlFilterInput.classList.add("valid");
        httpqlErrorMsg.style.display = "none";
      } else {
        httpqlFilterInput.classList.remove("valid");
        httpqlFilterInput.classList.add("invalid");
        httpqlErrorMsg.textContent = result.error || "Invalid HTTPQL filter";
        httpqlErrorMsg.style.display = "block";
      }

      if (!httpqlFilter.trim()) {
        httpqlFilterInput.classList.remove("valid", "invalid");
        httpqlErrorMsg.style.display = "none";
      }
    }, 300);
  });

  const handleBulkAction = async (val: string) => {
    if (!val) return;

    const selectedIds = table.getSelectedIds();

    if (val === "select-all") {
      table.selectAll();
      return;
    } else if (val === "deselect-all") {
      table.deselectAll();
      return;
    }
    
    const targets = selectedIds.length > 0 
      ? filteredResults.filter(r => selectedIds.includes(r.id as unknown as string))
      : filteredResults;

    if (targets.length === 0) {
      caido.window.showToast("No results to process", { variant: "info", duration: 2000 });
      return;
    }

    if (val === "repeater") {
      let count = 0;
      for (const r of targets) {
        if (r.id) {
          await caido.replay.createSession({ type: "ID", id: r.id as string });
          count++;
        }
      }
      caido.window.showToast(`Sent ${count} requests to Replay`, { variant: "success", duration: 2000 });
    } else if (val === "copy-urls") {
      const urls = targets.map(r => r.url).join("\n");
      navigator.clipboard.writeText(urls);
      caido.window.showToast(`${targets.length} URLs copied`, { variant: "success", duration: 2000 });
    } else if (val === "copy-curls") {
      const curls: string[] = [];
      for (const r of targets) {
        const record = await caido.graphql.request({ id: r.id as string });
        if (record?.request?.raw) {
          const raw = record.request.raw;
          const lines = raw.split("\r\n");
          const [method, path] = lines[0].split(" ");
          const headers = lines.slice(1, lines.indexOf("")).map(h => `-H "${h}"`).join(" ");
          const url = r.url;
          curls.push(`curl -X ${method} ${headers} "${url}"`);
        }
      }
      navigator.clipboard.writeText(curls.join("\n\n"));
      caido.window.showToast(`${curls.length} cURL commands copied`, { variant: "success", duration: 2000 });
    } else if (val === "csv") {
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
    } else if (val === "ffuf") {
      alert(toFfuf(targets));
    }
  };

  scanAllCheckbox.addEventListener("change", () => {
    scanAll = scanAllCheckbox.checked;
  });

  // --- Results Filter ---
  const filterInput = document.createElement("input");
  filterInput.type = "text";
  filterInput.placeholder = "Filter results (e.g. url:example, method:POST, status:404)...";
  filterInput.className = "caido-input";
  filterInput.style.width = "100%";
  container.appendChild(filterInput);

  const progressContainer = document.createElement("div");
  progressContainer.style.display = "none";
  progressContainer.style.alignItems = "center";
  progressContainer.style.gap = "10px";
  progressContainer.innerHTML = `<i class="fas fa-spinner fa-spin"></i> <span>Ranking requests...</span>`;
  container.appendChild(progressContainer);

  container.appendChild(table.getElement());
  container.appendChild(viewer.getElement());

  let currentResults: RankedResult[] = [];
  let filteredResults: RankedResult[] = [];

  function updateDashboard(results: RankedResult[]) {
    currentResults = results;
    applyFilter();
  }

  function applyFilter() {
    const query = filterInput.value.toLowerCase();
    filteredResults = currentResults.filter(r => {
      if (!query) return true;
      if (query.includes(":")) {
        const [key, val] = query.split(":");
        if (key === "url") return r.url.toLowerCase().includes(val);
        if (key === "method") return r.method.toLowerCase().includes(val);
        if (key === "status") return r.statusCode.toString().includes(val);
        if (key === "type") return r.contentType.toLowerCase().includes(val);
      }
      return (
        r.url.toLowerCase().includes(query) ||
        r.method.toLowerCase().includes(query) ||
        r.statusCode.toString().includes(query) ||
        r.contentType.toLowerCase().includes(query)
      );
    });

    table.update(filteredResults);
  }

  filterInput.addEventListener("input", applyFilter);

  return {
    element: container,
    onEnter: async () => {
      // Restore persisted scan settings
      limitInput.value = scanLimit.toString();
      httpqlFilterInput.value = httpqlFilter;
      scanAllCheckbox.checked = scanAll;

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
