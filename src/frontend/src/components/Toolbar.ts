import type { Caido } from "@caido/sdk-frontend";
import { BackendEndpoints } from "../../../shared/types.js";

export interface ToolbarConfig {
  scanLimit: number;
  scanAll: boolean;
  httpqlFilter: string;
  onScan: (limit: number, scanAll: boolean, filter: string) => Promise<void>;
  onBulkAction: (action: string) => void;
}

export class Toolbar {
  private container: HTMLElement;
  private caido: Caido<BackendEndpoints>;
  private config: ToolbarConfig;
  private limitInput: HTMLInputElement;
  private scanAllCheckbox: HTMLInputElement;
  private httpqlFilterInput: HTMLInputElement;
  private httpqlErrorMsg: HTMLElement;
  private validationTimeout?: ReturnType<typeof setTimeout>;

  constructor(caido: Caido<BackendEndpoints>, config: ToolbarConfig) {
    this.caido = caido;
    this.config = config;
    this.container = this.createToolbar();
    this.limitInput = this.container.querySelector("#scan-limit-input")!;
    this.scanAllCheckbox = this.container.querySelector("#scan-all-checkbox")!;
    this.httpqlFilterInput = this.container.querySelector("#httpql-filter-input")!;
    this.httpqlErrorMsg = this.container.querySelector(".httpql-error-message")!;
    
    this.attachEventListeners();
  }

  public getElement(): HTMLElement {
    return this.container;
  }

  public getValues() {
    return {
      scanLimit: parseInt(this.limitInput.value) || this.config.scanLimit,
      scanAll: this.scanAllCheckbox.checked,
      httpqlFilter: this.httpqlFilterInput.value,
    };
  }

  public setValues(scanLimit: number, scanAll: boolean, httpqlFilter: string) {
    this.limitInput.value = scanLimit.toString();
    this.scanAllCheckbox.checked = scanAll;
    this.httpqlFilterInput.value = httpqlFilter;
  }

  private createToolbar(): HTMLElement {
    const toolbar = document.createElement("div");
    toolbar.className = "anomaly-toolbar";
    toolbar.innerHTML = `
      ${this.createScanGroup()}
      <div class="anomaly-toolbar-divider"></div>
      ${this.createFilterGroup()}
      <div class="anomaly-toolbar-divider"></div>
      ${this.createActionsGroup()}
    `;
    return toolbar;
  }

  private createScanGroup(): string {
    return `
      <div class="anomaly-toolbar-group">
        <div class="anomaly-toolbar-label">Scan History</div>
        <div class="anomaly-toolbar-controls" style="align-items: flex-start; flex-direction: column; gap: 4px;">
          <div style="display: flex; align-items: center; gap: 8px;">
            <button id="scan-button" class="caido-button caido-button-primary caido-button-small" 
                    style="background: #3b82f6; color: white; font-weight: 600; padding: 8px 16px; border-radius: 6px;">Scan</button>
            <input type="number" id="scan-limit-input" class="caido-input" 
                   style="width: 90px; border: 2px solid #3b82f6; font-weight: 600; font-size: 14px; padding: 8px 12px;" 
                   min="1" max="100000" value="${this.config.scanLimit}" 
                   placeholder="Limit" title="Maximum requests to scan" />
            <div class="caido-checkbox-wrapper" style="margin: 0;">
              <input type="checkbox" id="scan-all-checkbox" ${this.config.scanAll ? "checked" : ""} />
              <label for="scan-all-checkbox" title="Scan all requests (ignores limit)">Scan all requests</label>
            </div>
          </div>
          <div style="font-size: 11px; color: var(--color-foreground-secondary, #888); font-style: italic; padding-left: 175px;">
            Scans in-scope requests by default
          </div>
        </div>
      </div>
    `;
  }

  private createFilterGroup(): string {
    const httpqlKeywords = [
      "host:", "path:", "method:", "status:", "ext:", "query:", "header:",
      "body:", "port:", "scheme:", "length:", "time:", "source:",
      "AND", "OR", "NOT", "preset:",
      "host:example.com", "method:GET", "method:POST", "status:200", "status:404",
      "ext:js", "ext:json", "path:/api", "scheme:https"
    ];
    
    const datalistOptions = httpqlKeywords.map(kw => `<option value="${kw}"></option>`).join("");
    
    return `
      <div class="anomaly-toolbar-group" style="flex: 1;">
        <div class="anomaly-toolbar-label">HTTPQL Filter</div>
        <div class="anomaly-toolbar-controls" style="flex-direction: column; align-items: stretch;">
          <datalist id="httpql-suggestions">${datalistOptions}</datalist>
          <input type="text" id="httpql-filter-input" class="caido-input" 
                 style="width: 100%; min-width: 300px; border: 2px solid #10b981; padding: 8px 12px;" 
                 value="${this.config.httpqlFilter}"
                 placeholder="e.g., host:example.com AND method:POST"
                 title="Filter requests using HTTPQL syntax"
                 list="httpql-suggestions"
                 autocomplete="off" />
          <div class="httpql-error-message"></div>
        </div>
      </div>
    `;
  }

  private createActionsGroup(): string {
    return `
      <div class="anomaly-toolbar-group">
        <div class="anomaly-toolbar-label">Bulk Actions</div>
        <div style="display: flex; align-items: center; gap: 8px;">
          <div class="custom-dropdown" id="selection-dropdown">
            <div class="custom-dropdown-trigger" style="background: #8b5cf6; color: white; border-color: #8b5cf6; border-radius: 6px;">Selection</div>
            <div class="custom-dropdown-menu">
              <div class="custom-dropdown-item" data-action="select-all">Select All</div>
              <div class="custom-dropdown-item" data-action="deselect-all">Deselect All</div>
              <div class="custom-dropdown-divider"></div>
              <div class="custom-dropdown-item" data-action="clear-results">Clear Results</div>
            </div>
          </div>
          <div class="custom-dropdown" id="export-dropdown">
            <div class="custom-dropdown-trigger" style="background: #f59e0b; color: white; border-color: #f59e0b; border-radius: 6px;">Export</div>
            <div class="custom-dropdown-menu">
              <div class="custom-dropdown-item" data-action="repeater">Send to Replay</div>
              <div class="custom-dropdown-item" data-action="copy-urls">Copy URLs</div>
              <div class="custom-dropdown-item" data-action="copy-curls">Copy as cURL</div>
              <div class="custom-dropdown-item" data-action="csv">Export CSV</div>
              <div class="custom-dropdown-item" data-action="ffuf">FFUF Snippet</div>
            </div>
          </div>
        </div>
      </div>
    `;
  }

  private attachEventListeners() {
    // Scan button
    const scanButton = this.container.querySelector("#scan-button") as HTMLButtonElement;
    scanButton.addEventListener("click", async () => {
      const limit = parseInt(this.limitInput.value);
      if (isNaN(limit) || limit < 1 || limit > 100000) {
        this.caido.window.showToast("Limit must be between 1 and 100000", { variant: "error", duration: 3000 });
        return;
      }

      scanButton.disabled = true;
      try {
        await this.config.onScan(limit, this.scanAllCheckbox.checked, this.httpqlFilterInput.value);
      } finally {
        scanButton.disabled = false;
      }
    });

    // HTTPQL filter validation
    this.httpqlFilterInput.addEventListener("input", () => {
      clearTimeout(this.validationTimeout);
      this.validationTimeout = setTimeout(async () => {
        const filter = this.httpqlFilterInput.value.trim();
        
        if (!filter) {
          this.httpqlFilterInput.classList.remove("valid", "invalid");
          this.httpqlErrorMsg.style.display = "none";
          return;
        }

        const result = await this.caido.backend.validateHttpql(filter);
        if (result.valid) {
          this.httpqlFilterInput.classList.remove("invalid");
          this.httpqlFilterInput.classList.add("valid");
          this.httpqlErrorMsg.style.display = "none";
        } else {
          this.httpqlFilterInput.classList.remove("valid");
          this.httpqlFilterInput.classList.add("invalid");
          this.httpqlErrorMsg.textContent = result.error || "Invalid HTTPQL filter";
          this.httpqlErrorMsg.style.display = "block";
        }
      }, 300);
    });

    // Dropdown menus
    this.setupDropdowns();
  }

  private setupDropdowns() {
    const dropdowns = this.container.querySelectorAll(".custom-dropdown");
    
    dropdowns.forEach(dropdown => {
      const trigger = dropdown.querySelector(".custom-dropdown-trigger")!;
      const menu = dropdown.querySelector(".custom-dropdown-menu")!;
      
      trigger.addEventListener("click", (e) => {
        e.stopPropagation();
        document.querySelectorAll(".custom-dropdown-menu").forEach(m => {
          if (m !== menu) m.classList.remove("open");
        });
        menu.classList.toggle("open");
      });

      menu.querySelectorAll(".custom-dropdown-item").forEach(item => {
        item.addEventListener("click", () => {
          const action = (item as HTMLElement).getAttribute("data-action");
          if (action) {
            this.config.onBulkAction(action);
            menu.classList.remove("open");
          }
        });
      });
    });

    document.addEventListener("click", () => {
      document.querySelectorAll(".custom-dropdown-menu").forEach(m => m.classList.remove("open"));
    });
  }
}
