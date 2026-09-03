import type { Caido } from "@caido/sdk-frontend";
import type {
  BackendEndpoints,
  RankedResult,
  RankingSnapshot,
  ScanProgress,
  ScanStatus,
} from "../../../shared/types.js";
import { toCsv, toFfuf } from "../utils/export.js";
import { RequestViewer } from "./RequestViewer.js";
import { ResultsTable } from "./ResultsTable.js";
import { Toolbar } from "./Toolbar.js";

let httpqlFilter = "";
let inScopeOnly = true;
let scanSeq = 0;

export function createDashboard(caido: Caido<BackendEndpoints>) {
  const container = document.createElement("div");
  container.className = "anomaly-dashboard";

  const style = document.createElement("style");
  style.textContent = getStyles();
  container.appendChild(style);

  let currentSnapshot = emptySnapshot();
  let rateSampleCount = 0;
  let rateSampleTime = performance.now();
  let requestsPerSecond = 0;

  const viewer = new RequestViewer(caido, (visible) => {
    container.classList.toggle("viewer-open", visible);
  });
  const table = new ResultsTable((id) => {
    const ranked = currentSnapshot.results.find((result) => String(result.id) === id);
    void viewer.show(id, ranked);
  });

  const header = document.createElement("header");
  header.className = "anomaly-header";
  header.innerHTML = "<h1>Anomaly Ranker</h1>";
  const progress = document.createElement("section");
  progress.className = "anomaly-progress";
  progress.setAttribute("aria-live", "polite");
  progress.hidden = true;
  progress.innerHTML = `
    <div class="anomaly-progress-rail" role="progressbar" aria-label="Scan progress" aria-valuemin="0" aria-valuemax="100" aria-valuenow="0"><span></span></div>
    <div class="anomaly-progress-copy"></div>
  `;

  const metrics = document.createElement("section");
  metrics.className = "anomaly-metrics";
  metrics.innerHTML = [
    metricMarkup("high-signal", "High signal"),
    metricMarkup("changing", "Signals"),
    metricMarkup("status", "Status mix"),
  ].join("");

  const comparisonNote = document.createElement("section");
  comparisonNote.className = "anomaly-comparison-note";
  comparisonNote.hidden = true;

  const resultsSection = document.createElement("section");
  resultsSection.className = "anomaly-results";
  const resultsHeader = document.createElement("div");
  resultsHeader.className = "anomaly-section-header";
  resultsHeader.innerHTML = `
    <h2>Unique responses <span class="anomaly-result-count">0</span></h2>
  `;
  const tableElement = table.getElement();
  resultsSection.append(resultsHeader, tableElement);

  const notifyPaused = (count: number) => {
    caido.window.showToast(
      `Scan paused. Showing ${count.toLocaleString()} response groups.`,
      { variant: "info", duration: 3000 },
    );
  };

  const toolbar = new Toolbar(caido, {
    httpqlFilter,
    inScopeOnly,
    onScan: async (filter, scopeOnly, resume) => {
      const seq = ++scanSeq;
      rateSampleCount = resume ? currentSnapshot.progress.visitedCount : 0;
      rateSampleTime = performance.now();
      requestsPerSecond = 0;
      httpqlFilter = filter;
      inScopeOnly = scopeOnly;
      const scopeId = scopeOnly
        ? caido.httpHistory.getScopeId()
        : undefined;
      let matchingCount = resume
        ? currentSnapshot.progress.totalCount
        : undefined;
      const withMatchingCount = (
        value: RankingSnapshot,
      ): RankingSnapshot =>
        matchingCount === undefined
          ? value
          : {
              ...value,
              progress: {
                ...value.progress,
                totalCount: matchingCount,
              },
            };
      const matchingCountPromise = resume
        ? Promise.resolve(matchingCount)
        : caido.graphql
            .requestCount({ filter: filter || undefined, scopeId })
            .then((response) => response.requests.count.value)
            .catch(() => undefined);

      try {
        let snapshot = withMatchingCount(
          await (resume
            ? caido.backend.resumeScan()
            : caido.backend.scanHistory({
                filter: filter || undefined,
                inScopeOnly: scopeOnly,
                scopeId,
              })),
        );
        void matchingCountPromise.then((count) => {
          if (seq !== scanSeq || count === undefined) return;
          matchingCount = count;
          snapshot = withMatchingCount(snapshot);
          updateDashboard(snapshot);
        });
        if (seq !== scanSeq) return;
        updateDashboard(snapshot);

        while (
          seq === scanSeq &&
          snapshot.progress.status === "scanning"
        ) {
          const advance = await caido.backend.advanceScan();
          if (seq !== scanSeq) return;

          const progressState = advance.progress;
          if (
            advance.resultsChanged ||
            progressState.status !== "scanning"
          ) {
            snapshot = withMatchingCount(await caido.backend.getResults());
            if (seq !== scanSeq) return;
            updateDashboard(snapshot);
          } else {
            snapshot = withMatchingCount({
              ...snapshot,
              progress: {
                ...progressState,
                totalCount: snapshot.progress.totalCount,
              },
            });
            updateScanProgress(snapshot.progress);
          }
        }

        if (seq !== scanSeq) return;
        if (snapshot.progress.status === "cancelled") {
          notifyPaused(snapshot.results.length);
        } else if (snapshot.progress.status === "failed") {
          caido.window.showToast(
            `Scan failed: ${snapshot.progress.error ?? "Unknown error"}`,
            { variant: "error", duration: 5000 },
          );
        } else {
          caido.window.showToast(
            `Checked ${snapshot.progress.scannedCount} requests in ${formatDuration(snapshot.progress.elapsedMs)}.`,
            { variant: "success", duration: 3000 },
          );
        }
      } catch (error) {
        if (seq !== scanSeq) return;
        const message = error instanceof Error ? error.message : String(error);
        const partial = await caido.backend.getResults();
        updateDashboard(partial);
        caido.window.showToast(`Scan failed: ${message}`, {
          variant: "error",
          duration: 5000,
        });
        caido.log.error(`Scan history failed: ${message}`);
      }
    },
    onCancel: async () => {
      const cancelSeq = ++scanSeq;
      const stopped: RankingSnapshot = {
        ...currentSnapshot,
        progress: {
          ...currentSnapshot.progress,
          status: "cancelled",
        },
      };
      updateDashboard(stopped);
      notifyPaused(stopped.results.length);

      void caido.backend
        .cancelScan()
        .then((snapshot) => {
          if (cancelSeq !== scanSeq) return;
          updateDashboard({
            ...snapshot,
            progress: {
              ...snapshot.progress,
              totalCount: stopped.progress.totalCount,
            },
          });
        })
        .catch((error) => {
          caido.log.error(`Failed to cancel scan: ${String(error)}`);
        });
    },
    onBulkAction: (action) => {
      void handleBulkAction(action);
    },
  });
  resultsHeader.appendChild(toolbar.getResultActionsElement());

  container.append(
    header,
    toolbar.getElement(),
    progress,
    metrics,
    comparisonNote,
    resultsSection,
    viewer.getElement(),
  );
  updateDashboard(currentSnapshot);

  async function handleBulkAction(action: string): Promise<void> {
    if (action === "clear-results") {
      scanSeq++;
      await caido.backend.clearResults();
      updateDashboard(emptySnapshot());
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

    const selectedIds = table.getSelectedIds();
    const targets = selectedIds.length > 0
      ? currentSnapshot.results.filter((result) =>
          selectedIds.includes(String(result.id)),
        )
      : currentSnapshot.results;
    if (targets.length === 0) {
      caido.window.showToast("No responses to use yet.", {
        variant: "info",
        duration: 2000,
      });
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
        await copyFfuf(targets);
        break;
    }
  }

  async function sendToRepeater(targets: RankedResult[]): Promise<void> {
    let count = 0;
    let failed = 0;
    for (const result of targets) {
      try {
        await caido.replay.createSession({ type: "ID", id: result.id as string });
        count++;
      } catch {
        failed++;
      }
    }
    const suffix = failed > 0 ? ` (${failed} failed)` : "";
    caido.window.showToast(`Sent ${count} requests to Replay${suffix}.`, {
      variant: count > 0 ? "success" : "error",
      duration: 3000,
    });
  }

  async function copyUrls(targets: RankedResult[]): Promise<void> {
    await copyText(
      targets.map((result) => result.url).join("\n"),
      `${targets.length} URLs copied.`,
    );
  }

  async function copyCurls(targets: RankedResult[]): Promise<void> {
    const curls: string[] = [];
    for (const result of targets) {
      const record = await caido.graphql.request({ id: result.id as string });
      if (!record?.request?.raw) continue;

      const lines = record.request.raw.split("\r\n");
      const requestLine = lines[0].split(" ");
      const headerEnd = lines.indexOf("");
      const headerLines =
        headerEnd >= 0 ? lines.slice(1, headerEnd) : lines.slice(1);
      const body =
        headerEnd >= 0 ? lines.slice(headerEnd + 1).join("\r\n") : "";
      const parts = [
        "curl",
        "-X",
        shellQuote(requestLine[0] || "GET"),
      ];
      for (const header of headerLines) {
        if (header) parts.push("-H", shellQuote(header));
      }
      if (body) parts.push("--data", shellQuote(body));
      parts.push(shellQuote(requestLine[1] || result.url));
      curls.push(parts.join(" "));
    }
    await copyText(curls.join("\n\n"), `${curls.length} cURL commands copied.`);
  }

  async function copyFfuf(targets: RankedResult[]): Promise<void> {
    await copyText(toFfuf(targets), "FFUF command copied.");
  }

  async function copyText(text: string, success: string): Promise<void> {
    try {
      await navigator.clipboard.writeText(text);
      caido.window.showToast(success, { variant: "success", duration: 2000 });
    } catch {
      caido.window.showToast("Could not copy to the clipboard.", {
        variant: "error",
        duration: 3000,
      });
    }
  }

  function exportCsv(targets: RankedResult[]): void {
    const blob = new Blob([toCsv(targets)], { type: "text/csv;charset=utf-8;" });
    const link = document.createElement("a");
    const url = URL.createObjectURL(blob);
    link.href = url;
    link.download = `anomaly_results_${new Date().toISOString()}.csv`;
    link.hidden = true;
    document.body.appendChild(link);
    link.click();
    link.remove();
    URL.revokeObjectURL(url);
    caido.window.showToast(`Exported ${targets.length} responses to CSV.`, {
      variant: "success",
      duration: 2000,
    });
  }

  function updateDashboard(snapshot: RankingSnapshot): void {
    updateRate(snapshot.progress);
    currentSnapshot = snapshot;
    metrics.hidden = snapshot.progress.status === "idle";
    toolbar.setStatus(snapshot.progress.status);
    toolbar.setHasResults(snapshot.results.length > 0);
    table.update(snapshot.results);
    tableElement.setAttribute(
      "aria-busy",
      String(snapshot.progress.status === "scanning"),
    );
    updateProgress(snapshot);
    if (snapshot.results.length === 0) {
      if (
        snapshot.progress.status === "scanning" ||
        snapshot.progress.status === "cancelling"
      ) {
        table.setEmptyMessage(
          "Checking history… First results will appear momentarily.",
        );
      } else if (snapshot.progress.status === "idle") {
        table.renderEmpty();
      } else {
        table.setEmptyMessage(
          "No responses matched this filter. Try a broader filter.",
        );
      }
    }
    const count = resultsHeader.querySelector(".anomaly-result-count");
    if (count) count.textContent = snapshot.results.length.toLocaleString();
  }

  function updateScanProgress(state: ScanProgress): void {
    updateRate(state);
    currentSnapshot = { ...currentSnapshot, progress: state };
    metrics.hidden = state.status === "idle";
    toolbar.setStatus(state.status);
    tableElement.setAttribute(
      "aria-busy",
      String(state.status === "scanning"),
    );
    updateProgress(currentSnapshot);
  }
  function updateProgress(snapshot: RankingSnapshot): void {
    const { progress: state } = snapshot;
    progress.hidden = state.status === "idle";
    progress.dataset.status = state.status;
    const rail = progress.querySelector<HTMLElement>(".anomaly-progress-rail");
    const fill = rail?.querySelector<HTMLElement>("span");
    const percentage =
      state.totalCount && state.totalCount > 0
        ? Math.min(100, (state.visitedCount / state.totalCount) * 100)
        : state.status === "complete" ? 100 : 0;
    if (fill) fill.style.width = `${percentage}%`;
    if (rail) {
      rail.setAttribute("aria-valuenow", String(Math.round(percentage)));
      rail.setAttribute(
        "aria-valuetext",
        `${Math.round(percentage)}% complete`,
      );
    }
    const copy = progress.querySelector(".anomaly-progress-copy");
    if (!copy) return;

    const rate =
      requestsPerSecond > 0
        ? ` · ${Math.round(requestsPerSecond).toLocaleString()} req/s`
        : "";
    const messages: Record<ScanStatus, string> = {
      idle: "",
      scanning: state.totalCount === undefined
        ? `Reviewed ${state.visitedCount.toLocaleString()} requests · ${state.scannedCount.toLocaleString()} eligible · ${state.rankedCount.toLocaleString()} ranked${rate}`
        : `Reviewed ${state.visitedCount.toLocaleString()} of ${state.totalCount.toLocaleString()} matching requests · ${state.scannedCount.toLocaleString()} eligible · ${state.rankedCount.toLocaleString()} ranked${rate}`,
      cancelling:
        `Pausing… ${state.rankedCount.toLocaleString()} ranked responses will remain`,
      complete:
        `Reviewed ${state.visitedCount.toLocaleString()} requests; ${state.scannedCount.toLocaleString()} were eligible in ${formatDuration(state.elapsedMs)}`,
      cancelled:
        `Scan paused after ${state.visitedCount.toLocaleString()} requests. Showing ${state.rankedCount.toLocaleString()} ranked responses.`,
      failed:
        `Scan could not finish${state.error ? `: ${state.error}` : "."}`,
    };
    copy.textContent = messages[state.status];
  }

  function updateRate(state: ScanProgress): void {
    if (state.status !== "scanning") return;
    const now = performance.now();
    const elapsed = now - rateSampleTime;
    const processed = state.visitedCount - rateSampleCount;
    if (processed < 0) {
      rateSampleCount = state.visitedCount;
      rateSampleTime = now;
      requestsPerSecond = 0;
      return;
    }
    if (elapsed < 250 || processed === 0) return;

    const currentRate = (processed * 1000) / elapsed;
    requestsPerSecond =
      requestsPerSecond === 0
        ? currentRate
        : requestsPerSecond * 0.65 + currentRate * 0.35;
    rateSampleCount = state.visitedCount;
    rateSampleTime = now;
  }

  function updateMetrics(snapshot: RankingSnapshot): void {
    const highSignal = snapshot.results.filter((result) => result.rank > 70).length;
    const statuses = new Map<string, number>();
    for (const result of snapshot.results) {
      const group = `${Math.floor(result.statusCode / 100)}xx`;
      statuses.set(
        group,
        (statuses.get(group) ?? 0) + result.occurrences,
      );
    }

    setMetric("high-signal", highSignal.toLocaleString());
    setMetric("changing", snapshot.summary.dynamicFeatureCount.toLocaleString());
    setStatusMix(statuses);
  }

  function setMetric(name: string, value: string): void {
    const node = metrics.querySelector(`[data-metric="${name}"] strong`);
    if (node) node.textContent = value;
  }

  function setStatusMix(statuses: Map<string, number>): void {
    const node = metrics.querySelector<HTMLElement>(
      '[data-metric="status"] strong',
    );
    if (!node) return;

    node.className = "anomaly-status-mix";
    node.replaceChildren();
    if (statuses.size === 0) {
      node.textContent = "No responses";
      return;
    }

    for (const [group, count] of [...statuses.entries()].sort(
      ([left], [right]) => left.localeCompare(right),
    )) {
      const item = document.createElement("span");
      item.className = `anomaly-status-group anomaly-status-${group[0]}`;
      item.textContent = `${group} ${count.toLocaleString()}`;
      node.appendChild(item);
    }
  }

  function updateComparisonNote(snapshot: RankingSnapshot): void {
    const warning = snapshot.summary.warnings.join(" ");
    comparisonNote.hidden = warning.length === 0;
    comparisonNote.textContent = warning;
  }



  return {
    element: container,
    onEnter: async () => {
      toolbar.setFilter(httpqlFilter);
      const snapshot = await caido.backend.getResults();
      if (!isRankingSnapshot(snapshot)) {
        caido.window.showToast(
          "The plugin backend is out of date. Reinstall the package or restart Caido.",
          { variant: "error", duration: 5000 },
        );
        return;
      }
      updateDashboard(snapshot);
    },
    rankRequests: async (ids: string[]) => {
      const seq = ++scanSeq;
      updateDashboard(emptySnapshot("scanning"));
      try {
        const snapshot = await caido.backend.rankRequests(ids);
        if (seq === scanSeq) updateDashboard(snapshot);
      } catch (error) {
        caido.log.error(`Failed to rank requests: ${String(error)}`);
      }
    },
  };
}


function getStyles(): string {
  return `
    .anomaly-dashboard {
      --ar-canvas: var(--p-surface-900, #24262d);
      --ar-surface: var(--p-surface-800, #30333b);
      --ar-surface-muted: var(--p-surface-700, #474a54);
      --ar-text: var(--p-text-color, #edeae8);
      --ar-muted: var(--p-text-muted-color, #929292);
      --ar-rule: var(--p-content-border-color, #474a54);
      --ar-focus: var(--p-text-color, #edeae8);
      --ar-page-padding: 12px;
      --ar-accent: var(--p-text-color, #edeae8);
      --ar-accent-hover: var(--p-text-muted-color, #b8b8b8);
      --ar-accent-contrast: var(--p-surface-900, #24262d);
      box-sizing: border-box;
      position: relative;
      display: flex;
      height: 100%;
      min-height: 0;
      flex-direction: column;
      gap: 8px;
      padding: var(--ar-page-padding);
      overflow: hidden;
      color: var(--ar-text);
      background: var(--ar-canvas);
      font: 14px/1.45 -apple-system, BlinkMacSystemFont, "Segoe UI", "DejaVu Sans", sans-serif;
    }

    .anomaly-dashboard *,
    .anomaly-dashboard *::before,
    .anomaly-dashboard *::after {
      box-sizing: border-box;
    }

    .anomaly-dashboard:focus,
    .anomaly-dashboard:focus-visible {
      outline: none !important;
    }

    .anomaly-dashboard :focus-visible {
      outline: 1px solid var(--ar-focus) !important;
      outline-offset: 0;
    }

    .anomaly-header {
      flex: 0 0 auto;
    }


    .anomaly-header h1,
    .anomaly-section-header h2 {
      margin: 2px 0 0;
      color: var(--ar-text);
      font-family: "DejaVu Sans", -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif;
    }

    .anomaly-header h1 {
      font-size: 20px;
      line-height: 24px;
      letter-spacing: -.02em;
    }


    .anomaly-toolbar {
      display: grid;
      grid-template-columns: minmax(0, 1fr) auto;
      align-items: end;
      gap: 8px;
      padding: 8px;
      border: 1px solid var(--ar-rule);
      border-radius: 6px;
      background: var(--ar-surface);
    }

    .anomaly-filter-field {
      position: relative;
    }

    .anomaly-filter-suggestions {
      position: absolute;
      z-index: 100;
      top: calc(100% + 4px);
      left: 0;
      width: min(520px, 100%);
      max-height: 240px;
      padding: 4px;
      overflow-y: auto;
      border: 1px solid var(--ar-rule);
      border-radius: 6px;
      background: var(--ar-surface);
      box-shadow: 0 8px 20px rgb(0 0 0 / 24%);
    }

    .anomaly-filter-suggestions[hidden] {
      display: none;
    }

    .anomaly-filter-suggestion {
      display: block;
      width: 100%;
      padding: 7px 8px;
      overflow: hidden;
      border: 0;
      border-radius: 4px;
      color: var(--ar-text);
      background: transparent;
      font: 12px/1.4 ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, monospace;
      text-align: left;
      text-overflow: ellipsis;
      white-space: nowrap;
      cursor: pointer;
    }

    .anomaly-filter-suggestion:hover,
    .anomaly-filter-suggestion.active {
      background: var(--ar-surface-muted);
    }

    .anomaly-filter-field label {
      display: block;
      margin-bottom: 4px;
      color: var(--ar-text);
      font-size: 12px;
      font-weight: 650;
    }

    .anomaly-filter-field label span {
      color: var(--ar-muted);
      font-weight: 400;
    }

    .httpql-error-message {
      margin-top: 4px;
      color: var(--c-border-danger, #f58e97);
      font-size: 11px;
    }


    .anomaly-scope-toggle {
      display: inline-flex !important;
      width: 136px;
      height: 36px;
      align-items: center;
      justify-content: center;
      gap: 7px;
      margin: 0 !important;
      padding: 0 10px;
      border: 1px solid var(--ar-rule);
      border-radius: 6px;
      color: var(--ar-text) !important;
      background: var(--ar-canvas);
      font-weight: 600 !important;
      white-space: nowrap;
      cursor: pointer;
    }

    .anomaly-scope-toggle input {
      width: 15px;
      height: 15px;
      margin: 0;
      accent-color: var(--ar-accent);
      cursor: pointer;
    }

    .anomaly-control {
      min-height: 36px;
      padding: 0 10px;
      border: 1px solid var(--ar-rule);
      border-radius: 6px;
      color: var(--ar-text);
      background: var(--ar-canvas);
      font: inherit;
    }

    .anomaly-httpql-input-wrap {
      position: relative;
      height: 36px;
    }

    .anomaly-httpql-highlight {
      position: absolute;
      z-index: 0;
      inset: 0;
      display: flex;
      align-items: center;
      margin: 0;
      padding: 0 10px;
      overflow: hidden;
      color: var(--ar-text);
      background: var(--ar-canvas);
      font: inherit;
      white-space: pre;
      pointer-events: none;
    }

    .anomaly-httpql-input {
      position: relative;
      z-index: 1;
      width: 100%;
      color: transparent !important;
      background: transparent !important;
      caret-color: var(--ar-text);
      -webkit-text-fill-color: transparent;
    }

    .anomaly-httpql-input::placeholder {
      color: var(--ar-muted);
      -webkit-text-fill-color: var(--ar-muted);
    }

    .httpql-token-field {
      color: #8ab4f8;
    }

    .httpql-token-operator {
      color: #c6a0f6;
    }

    .httpql-token-string {
      color: #9ecb91;
    }

    .httpql-token-number {
      color: #f9c97c;
    }

    .httpql-token-keyword {
      color: #82d2ce;
      font-weight: 650;
    }

    .anomaly-control::placeholder {
      color: var(--ar-muted);
      opacity: .75;
    }

    .anomaly-control:hover {
      border-color: color-mix(in srgb, var(--ar-rule) 45%, var(--ar-text));
    }

    .anomaly-control:focus,
    .anomaly-control:focus-visible {
      border-color: var(--ar-focus);
      outline: none !important;
      box-shadow: none !important;
    }

    .anomaly-control:disabled {
      cursor: not-allowed;
      opacity: .48;
    }

    .anomaly-filter-field #history-filter {
      width: 100%;
    }

    .anomaly-scan-actions,
    .anomaly-bulk-actions {
      display: flex;
      align-items: center;
      gap: 6px;
    }

    .anomaly-section-header .anomaly-bulk-actions {
      margin-left: auto;
    }

    .anomaly-button {
      display: inline-flex;
      min-height: 36px;
      align-items: center;
      justify-content: center;
      padding: 0 12px;
      border: 1px solid transparent;
      border-radius: 6px;
      font: inherit;
      font-weight: 650;
      white-space: nowrap;
      cursor: pointer;
      transition: background-color 120ms ease, border-color 120ms ease;
    }

    .anomaly-button:disabled {
      cursor: not-allowed;
      opacity: .5;
    }

    .anomaly-button-primary {
      width: 96px;
      border-color: var(--ar-accent);
      color: var(--ar-accent-contrast);
      background: var(--ar-accent);
    }

    .anomaly-button-primary:hover:not(:disabled) {
      border-color: var(--ar-accent-hover);
      background: var(--ar-accent-hover);
    }

    .anomaly-button-pause {
      border-color: var(--ar-rule);
      color: var(--ar-text);
      background: var(--ar-canvas);
    }

    .anomaly-button-pause:hover:not(:disabled) {
      background: var(--ar-surface-muted);
    }

    .anomaly-select {
      min-width: 128px;
      cursor: pointer;
    }

    .anomaly-visually-hidden {
      position: absolute;
      width: 1px;
      height: 1px;
      padding: 0;
      margin: -1px;
      overflow: hidden;
      clip: rect(0, 0, 0, 0);
      white-space: nowrap;
      border: 0;
    }

    .anomaly-progress {
      display: grid;
      flex: 0 0 auto;
      grid-template-columns: minmax(90px, 140px) 1fr;
      align-items: center;
      gap: 8px;
      min-height: 28px;
      padding: 4px 8px;
      border: 1px solid var(--ar-rule);
      border-radius: 5px;
      color: var(--ar-muted);
      background: color-mix(in srgb, var(--ar-surface) 72%, transparent);
      font-size: 11px;
    }

    .anomaly-progress[hidden],
    .anomaly-metrics[hidden],
    .anomaly-comparison-note[hidden] {
      display: none;
    }

    .anomaly-progress-rail {
      height: 3px;
      overflow: hidden;
      border-radius: 999px;
      background: var(--ar-rule);
    }

    .anomaly-progress-rail span {
      display: block;
      width: 0;
      height: 100%;
      border-radius: inherit;
      background: var(--ar-accent);
      transition: width 160ms linear;
    }

    .anomaly-metrics {
      display: grid;
      flex: 0 0 auto;
      grid-template-columns: minmax(110px, 1fr) minmax(110px, 1fr) minmax(240px, 3fr);
      overflow: hidden;
      border: 1px solid var(--ar-rule);
      border-radius: 8px;
      background: var(--ar-surface);
    }

    .anomaly-metric {
      min-width: 0;
      padding: 6px 10px;
      border-right: 1px solid var(--ar-rule);
    }

    .anomaly-metric:last-child {
      border-right: 0;
    }

    .anomaly-metric span {
      display: block;
      color: var(--ar-muted);
      font-size: 11px;
    }
    .anomaly-metric strong {
      display: block;
      margin-top: 1px;
      overflow: hidden;
      color: var(--ar-text);
      font: 700 14px/18px ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, monospace;
      text-overflow: ellipsis;
      white-space: nowrap;
    }

    .anomaly-status-mix {
      display: flex !important;
      align-items: center;
      gap: 12px;
    }

    .anomaly-status-group {
      display: inline-flex !important;
    }

    .anomaly-status-1 {
      color: #60a5fa !important;
    }

    .anomaly-status-2 {
      color: #4ade80 !important;
    }

    .anomaly-status-3 {
      color: #facc15 !important;
    }

    .anomaly-status-4 {
      color: #fb923c !important;
    }

    .anomaly-status-5 {
      color: #f87171 !important;
    }

    .anomaly-comparison-note {
      flex: 0 0 auto;
      padding: 6px 10px;
      border: 1px solid var(--ar-rule);
      border-radius: 5px;
      color: var(--ar-muted);
      background: color-mix(in srgb, var(--ar-surface) 76%, transparent);
      font-size: 11px;
    }

    .anomaly-results {
      display: flex;
      flex: 1 1 auto;
      min-height: 180px;
      flex-direction: column;
      overflow: hidden;
    }

    .anomaly-dashboard.viewer-open .anomaly-metrics,
    .anomaly-dashboard.viewer-open .anomaly-comparison-note {
      display: none;
    }

    .anomaly-dashboard.viewer-open .anomaly-results {
      min-height: 80px;
    }

    .anomaly-section-header {
      display: flex;
      flex: 0 0 auto;
      align-items: end;
      justify-content: space-between;
      gap: 8px;
      padding: 0 2px 6px;
    }

    .anomaly-section-header h2 {
      font-size: 15px;
      line-height: 20px;
      letter-spacing: -.01em;
    }

    .anomaly-result-count {
      margin-left: 5px;
      color: var(--ar-muted);
      font-family: ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, monospace;
      font-size: 13px;
      font-weight: 500;
    }

    .anomaly-table-empty-notice {
      display: flex;
      align-items: center;
      justify-content: center;
      height: 120px;
      padding: 20px 12px;
      color: var(--ar-muted);
      font-size: 13px;
      text-align: center;
    }

    .anomaly-table-container {
      display: flex;
      flex: 1 1 auto;
      min-height: 0;
      flex-direction: column;
      overflow: hidden;
      border: 1px solid var(--ar-rule);
      border-radius: 8px;
      background: var(--ar-surface);
    }

    .caido-table-header {
      display: flex;
      align-items: center;
      border-bottom: 1px solid var(--ar-rule);
      color: var(--ar-muted);
      background: var(--ar-surface) !important;
      font-size: 13px;
    }

    .caido-table-row {
      color: var(--ar-text);
      background: var(--ar-canvas) !important;
      font: 12px/16px ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, monospace;
    }

    .caido-table-row:hover {
      background: color-mix(in srgb, var(--ar-surface-muted) 34%, var(--ar-canvas)) !important;
    }

    .caido-table-row.selected {
      background: color-mix(in srgb, var(--ar-accent) 14%, var(--ar-canvas)) !important;
    }

    .rank-high {
      color: var(--ar-text);
      font-weight: 750;
    }

    .anomaly-column-sort {
      width: 100%;
      min-height: 44px;
      padding: 10px 12px;
      border: 0;
      color: inherit;
      background: transparent;
      font: inherit;
      font-weight: 650;
      text-align: left;
      cursor: pointer;
    }

    .resize-handle {
      position: absolute;
      z-index: 1;
      top: 0;
      right: 0;
      bottom: 0;
      width: 6px;
      cursor: col-resize;
    }



    .anomaly-status-dot {
      display: inline-block;
      width: 7px;
      height: 7px;
      margin-right: 6px;
      border-radius: 50%;
    }

    .anomaly-viewer-container {
      position: absolute;
      z-index: 20;
      right: var(--ar-page-padding);
      bottom: 0;
      left: var(--ar-page-padding);
      display: none;
      max-height: calc(100% - 24px);
      min-height: 200px;
      flex-direction: column;
      overflow: hidden;
      border: 1px solid var(--ar-rule);
      border-radius: 8px 8px 0 0;
      background: var(--ar-surface);
    }

    .anomaly-viewer-resizer {
      position: absolute;
      z-index: 5;
      top: 0;
      right: 0;
      left: 0;
      height: 10px;
      cursor: row-resize;
      touch-action: none;
    }

    .anomaly-viewer-resizer::after {
      position: absolute;
      top: 2px;
      left: 50%;
      width: 48px;
      height: 2px;
      border-radius: 999px;
      background: var(--ar-rule);
      content: "";
      transform: translateX(-50%);
    }

    .anomaly-viewer-resizer:hover::after,
    .anomaly-viewer-resizer:focus-visible::after {
      background: var(--ar-text);
    }

    .anomaly-viewer-header {
      display: flex;
      align-items: center;
      justify-content: space-between;
      min-height: 44px;
      padding: 8px 14px;
      border-bottom: 1px solid var(--ar-rule);
      font-weight: 650;
    }

    .anomaly-viewer-close {
      min-width: 32px;
      min-height: 32px;
      border: 0;
      border-radius: 4px;
      color: var(--ar-text);
      background: transparent;
      font-size: 20px;
      cursor: pointer;
    }

    .anomaly-viewer-close:hover {
      background: var(--ar-surface-muted);
    }

    .anomaly-viewer-body {
      display: flex;
      min-height: 0;
      flex: 1;
      gap: 1px;
      background: var(--ar-rule);
      overflow: hidden;
    }

    .anomaly-viewer-body > div {
      width: 50%;
      min-width: 0;
      flex: 1;
      overflow: hidden;
      background: var(--ar-surface);
    }

    .anomaly-viewer-body caido-sdk-editor-http-request,
    .anomaly-viewer-body caido-sdk-editor-http-response {
      display: block;
      width: 100%;
      height: 100%;
      min-height: 0;
    }

    .anomaly-viewer-error {
      padding: 10px 14px;
      border-top: 1px solid var(--ar-rule);
      color: var(--c-border-danger, #f58e97);
    }



    @media (max-width: 980px) {
      .anomaly-toolbar {
        grid-template-columns: 1fr;
      }

      .anomaly-filter-field,
      .anomaly-scan-actions {
        grid-column: 1;
      }

      .anomaly-scan-actions {
        padding-top: 8px;
      }

      .anomaly-metrics {
        grid-template-columns: repeat(3, 1fr);
      }

    }

    @media (max-width: 680px) {
      .anomaly-dashboard {
        --ar-page-padding: 8px;
        gap: 8px;
        padding: var(--ar-page-padding);
      }

      .anomaly-header h1 {
        font-size: 19px;
      }

      .anomaly-toolbar {
        padding: 8px;
      }

      .anomaly-scan-actions,
      .anomaly-bulk-actions {
        flex-wrap: wrap;
      }

      .anomaly-progress {
        grid-template-columns: 1fr 1fr;
      }

      .anomaly-metrics {
        grid-template-columns: repeat(3, minmax(0, 1fr));
      }


      .anomaly-section-header {
        align-items: start;
        flex-direction: column;
        gap: 2px;
      }

      .anomaly-viewer-body {
        flex-direction: column;
      }

      .anomaly-viewer-body > div {
        width: 100%;
        min-height: 180px;
      }

      .anomaly-viewer-container {
        right: var(--ar-page-padding);
        bottom: 0;
        left: var(--ar-page-padding);
        max-height: calc(100% - 12px);
      }
    }


    @media (max-width: 480px) {
      .anomaly-scan-actions,
      .anomaly-bulk-actions {
        flex-wrap: nowrap;
      }

      .anomaly-select {
        min-width: 96px;
      }
    }
    @media (prefers-reduced-motion: reduce) {
      .anomaly-progress-rail span {
        transition: none;
      }
      .anomaly-button {
        transition: none;
      }
    }
  `;
}

function emptySnapshot(status: ScanStatus = "idle"): RankingSnapshot {
  return {
    results: [],
    summary: { size: 0, dynamicFeatureCount: 0, warnings: [] },
    progress: {
      status,
      scannedCount: 0,
      visitedCount: 0,
      rankedCount: 0,
      elapsedMs: 0,
    },
  };
}

function metricMarkup(name: string, label: string): string {
  return `
    <div class="anomaly-metric" data-metric="${name}">
      <span>${label}</span>
      <strong>0</strong>
    </div>
  `;
}

function shellQuote(value: string): string {
  return `'${value.replace(/'/g, `'\\''`)}'`;
}

function formatDuration(durationMs: number): string {
  if (durationMs < 1000) return `${Math.round(durationMs)} ms`;
  return `${(durationMs / 1000).toFixed(1)} s`;
}


function isRankingSnapshot(value: unknown): value is RankingSnapshot {
  if (!value || typeof value !== "object") return false;
  const candidate = value as Partial<RankingSnapshot>;
  return (
    Array.isArray(candidate.results) &&
    typeof candidate.summary === "object" &&
    candidate.summary !== null &&
    typeof candidate.progress === "object" &&
    candidate.progress !== null
  );
}
