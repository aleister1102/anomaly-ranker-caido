import type { Caido } from "@caido/sdk-frontend";
import type { FeatureContribution, RankedResult } from "../../../shared/types.js";

const FEATURE_LABELS: Record<string, string> = {
  statusCode: "Status Code",
  contentLength: "Content Length",
  bodyContent: "Body Content",
  wordCount: "Word Count",
  lineCount: "Line Count",
  headerNames: "Header Names",
  colonCount: "Colon Count",
};

export class RequestViewer {
  private container: HTMLElement;
  private caido: Caido<any>;
  private requestEditor: any;
  private responseEditor: any;
  private viewerHeight = 400;
  private resizer: HTMLElement;
  private explainPanel: HTMLElement | null = null;

  constructor(caido: Caido<any>) {
    this.caido = caido;
    this.container = document.createElement("div");
    this.container.className = "anomaly-viewer-container";
    this.container.style.height = `${this.viewerHeight}px`;

    this.resizer = document.createElement("div");
    this.resizer.className = "anomaly-viewer-resizer";
    this.container.appendChild(this.resizer);

    this.setupResizer();

    this.requestEditor = caido.ui.httpRequestEditor();
    this.responseEditor = caido.ui.httpResponseEditor();
  }

  private setupResizer() {
    let isResizing = false;
    let startY: number;
    let startHeight: number;

    this.resizer.addEventListener("mousedown", (e) => {
      isResizing = true;
      startY = e.clientY;
      startHeight = this.container.offsetHeight;
      document.body.style.cursor = "row-resize";
      document.body.style.userSelect = "none";
    });

    window.addEventListener("mousemove", (e) => {
      if (!isResizing) return;

      const deltaY = e.clientY - startY;
      let newHeight = startHeight - deltaY;

      if (newHeight < 200) newHeight = 200;

      const dashboard = this.container.parentElement;
      const table = dashboard?.querySelector(".anomaly-table-container") as HTMLElement;
      if (table && dashboard) {
        const dashboardHeight = dashboard.offsetHeight;
        const otherElementsHeight = dashboardHeight - table.offsetHeight - this.container.offsetHeight;
        const maxViewerHeight = dashboardHeight - otherElementsHeight - 100;
        if (newHeight > maxViewerHeight) newHeight = maxViewerHeight;
      }

      this.viewerHeight = newHeight;
      this.container.style.height = `${newHeight}px`;
    });

    window.addEventListener("mouseup", () => {
      if (isResizing) {
        isResizing = false;
        document.body.style.cursor = "";
        document.body.style.userSelect = "";
      }
    });
  }

  public getElement(): HTMLElement {
    return this.container;
  }

  public async show(id: string, ranked?: RankedResult) {
    this.container.style.display = "flex";
    this.container.style.height = `${this.viewerHeight}px`;
    
    Array.from(this.container.childNodes).forEach(node => {
      if (node !== this.resizer) this.container.removeChild(node);
    });

    const viewerHeader = document.createElement("div");
    viewerHeader.className = "anomaly-viewer-header";
    const idLabel = document.createElement("span");
    idLabel.textContent = `Request ID: ${id}`;
    viewerHeader.appendChild(idLabel);
    
    const closeBtn = document.createElement("button");
    closeBtn.innerHTML = "&times;";
    closeBtn.style.cssText = "background: none; border: none; font-size: 20px; cursor: pointer; color: var(--color-foreground);";
    closeBtn.addEventListener("click", () => this.hide());
    viewerHeader.appendChild(closeBtn);
    
    const viewerBody = document.createElement("div");
    viewerBody.className = "anomaly-viewer-body";
    
    const wrapperStyle = "flex: 1; width: 50%; min-width: 0; overflow: hidden;";
    const requestWrapper = document.createElement("div");
    requestWrapper.style.cssText = wrapperStyle;
    requestWrapper.appendChild(this.requestEditor.getElement());

    const responseWrapper = document.createElement("div");
    responseWrapper.style.cssText = wrapperStyle;
    responseWrapper.appendChild(this.responseEditor.getElement());

    viewerBody.appendChild(requestWrapper);
    viewerBody.appendChild(responseWrapper);
    
    this.container.appendChild(viewerHeader);
    this.container.appendChild(viewerBody);

    if (ranked) {
      this.explainPanel = this.buildExplainPanel(ranked);
      this.container.appendChild(this.explainPanel);
    } else {
      this.explainPanel = null;
    }

    const record = await this.caido.graphql.request({ id });
    if (record?.request?.raw) {
      this.setEditorRaw(this.requestEditor, record.request.raw);
    }

    if (record?.request?.response?.id) {
      const respRecord = await this.caido.graphql.response({ id: record.request.response.id });
      if (respRecord?.response?.raw) {
        this.setEditorRaw(this.responseEditor, respRecord.response.raw);
      }
    } else {
      this.setEditorRaw(this.responseEditor, "");
    }
  }

  private buildExplainPanel(ranked: RankedResult): HTMLElement {
    const panel = document.createElement("div");
    panel.className = "anomaly-explain-panel";

    const toggle = document.createElement("button");
    toggle.type = "button";
    toggle.className = "anomaly-explain-toggle";
    toggle.textContent = "Why anomalous?";
    toggle.setAttribute("aria-expanded", "false");

    const body = document.createElement("div");
    body.className = "anomaly-explain-body";
    body.style.display = "none";

    toggle.addEventListener("click", () => {
      const open = body.style.display === "none";
      body.style.display = open ? "block" : "none";
      toggle.setAttribute("aria-expanded", String(open));
    });

    const contributions = ranked.contributions ?? [];
    const top3 = contributions.slice(0, 3);

    if (top3.length > 0) {
      const topSection = document.createElement("div");
      topSection.className = "anomaly-explain-top";
      const topTitle = document.createElement("strong");
      topTitle.textContent = "Top contributors";
      topSection.appendChild(topTitle);

      const topList = document.createElement("ol");
      for (const c of top3) {
        const li = document.createElement("li");
        li.textContent = `${this.formatFeature(c)} (contribution ${c.contribution.toFixed(4)})`;
        topList.appendChild(li);
      }
      topSection.appendChild(topList);
      body.appendChild(topSection);
    } else {
      const none = document.createElement("p");
      none.textContent = "No dynamic features contributed to this rank (cohort may be uniform).";
      body.appendChild(none);
    }

    if (contributions.length > 0) {
      const table = document.createElement("table");
      table.className = "anomaly-explain-table";

      const thead = document.createElement("thead");
      const headerRow = document.createElement("tr");
      for (const label of ["Feature", "Value", "Frequency", "Distinct", "Weight", "Contribution"]) {
        const th = document.createElement("th");
        th.textContent = label;
        headerRow.appendChild(th);
      }
      thead.appendChild(headerRow);
      table.appendChild(thead);

      const tbody = document.createElement("tbody");
      for (const c of contributions) {
        tbody.appendChild(this.buildContributionRow(c));
      }
      table.appendChild(tbody);
      body.appendChild(table);
    }

    if (ranked.cohortSummary) {
      const cohort = document.createElement("div");
      cohort.className = "anomaly-explain-cohort";
      const cohortTitle = document.createElement("strong");
      cohortTitle.textContent = "Cohort summary";
      cohort.appendChild(cohortTitle);

      const cohortText = document.createElement("p");
      cohortText.textContent =
        `${ranked.cohortSummary.size} responses, ${ranked.cohortSummary.dynamicFeatureCount} varying features.`;
      cohort.appendChild(cohortText);

      if (ranked.cohortSummary.warnings.length > 0) {
        const warnList = document.createElement("ul");
        for (const w of ranked.cohortSummary.warnings) {
          const li = document.createElement("li");
          li.textContent = w;
          warnList.appendChild(li);
        }
        cohort.appendChild(warnList);
      }

      body.appendChild(cohort);
    }

    panel.appendChild(toggle);
    panel.appendChild(body);
    return panel;
  }

  private formatFeature(c: FeatureContribution): string {
    return FEATURE_LABELS[c.feature] ?? c.feature;
  }

  private buildContributionRow(c: FeatureContribution): HTMLTableRowElement {
    const row = document.createElement("tr");
    const cells = [
      this.formatFeature(c),
      String(c.value),
      String(c.frequency),
      String(c.distinctValues),
      c.weight.toFixed(4),
      c.contribution.toFixed(4),
    ];
    for (const text of cells) {
      const td = document.createElement("td");
      td.textContent = text;
      row.appendChild(td);
    }
    return row;
  }

  public hide() {
    this.container.style.display = "none";
  }

  private setEditorRaw(editor: any, raw: string | null | undefined) {
    const view = editor.getEditorView();
    if (view) {
      view.dispatch({
        changes: {
          from: 0,
          to: view.state.doc.length,
          insert: raw || ""
        }
      });
    }
  }
}
