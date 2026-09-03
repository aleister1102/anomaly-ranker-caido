import type { Caido } from "@caido/sdk-frontend";
import type {
  BackendEndpoints,
  ScanStatus,
} from "../../../shared/types.js";

const STRING_FIELDS: Array<[string, string]> = [
  ["req.ext", ".js"],
  ["req.host", "example.com"],
  ["req.method", "GET"],
  ["req.path", "/api/"],
  ["req.header", "content-type"],
  ["req.query", "token"],
  ["req.raw", "search text"],
  ["resp.header", "content-type"],
  ["resp.raw", "search text"],
];
const INTEGER_FIELDS: Array<[string, number]> = [
  ["req.len", 1024],
  ["req.port", 443],
  ["resp.code", 400],
  ["resp.len", 1024],
  ["resp.roundtrip", 500],
  ["row.id", 1000],
];
const STRING_OPERATORS = [
  "eq",
  "ne",
  "cont",
  "ncont",
  "like",
  "nlike",
  "regex",
  "nregex",
];
const NUMBER_OPERATORS = ["eq", "ne", "gt", "gte", "lt", "lte"];
const HTTPQL_SUGGESTIONS = [
  ...STRING_FIELDS.flatMap(([field, value]) =>
    STRING_OPERATORS.map((operator) => `${field}.${operator}:"${value}"`),
  ),
  ...INTEGER_FIELDS.flatMap(([field, value]) =>
    NUMBER_OPERATORS.map((operator) => `${field}.${operator}:${value}`),
  ),
  "req.tls.eq:true",
  "req.tls.ne:false",
  'req.created_at.gt:"2026-01-01T00:00:00Z"',
  'req.created_at.lt:"2026-12-31T23:59:59Z"',
  'req.header["content-type"].cont:"application/json"',
  'resp.header["content-type"].cont:"application/json"',
  'preset:"no-images"',
  '(req.method.eq:"POST" AND resp.code.gte:400)',
];

const HTTPQL_TOKEN =
  /"(?:\\.|[^"\\])*"|\b(?:AND|OR|NOT|true|false)\b|\b\d+\b|(?:req|resp)\.[a-zA-Z0-9_-]+(?=\.(?:eq|ne|cont|ncont|like|nlike|regex|nregex|gt|gte|lt|lte):)|\.(?:eq|ne|cont|ncont|like|nlike|regex|nregex|gt|gte|lt|lte)(?=:)|preset:[a-zA-Z0-9_-]+/g;

interface ToolbarConfig {
  httpqlFilter: string;
  inScopeOnly: boolean;
  onScan: (filter: string, inScopeOnly: boolean, resume: boolean) => Promise<void>;
  onCancel: () => Promise<void>;
  onBulkAction: (action: string) => void;
}

export class Toolbar {
  private readonly container: HTMLElement;
  private readonly resultActions: HTMLElement;
  private readonly caido: Caido<BackendEndpoints>;
  private readonly config: ToolbarConfig;
  private readonly filterInput: HTMLInputElement;
  private readonly filterHighlight: HTMLElement;
  private readonly suggestionsMenu: HTMLElement;
  private readonly filterError: HTMLElement;
  private readonly inScopeOnlyCheckbox: HTMLInputElement;
  private readonly scanButton: HTMLButtonElement;
  private readonly selectionAction: HTMLSelectElement;
  private readonly exportAction: HTMLSelectElement;
  private validationTimeout?: ReturnType<typeof setTimeout>;
  private filterIsValid = true;
  private filteredSuggestions: string[] = [];
  private activeSuggestionIndex = -1;
  private status: ScanStatus = "idle";

  constructor(caido: Caido<BackendEndpoints>, config: ToolbarConfig) {
    this.caido = caido;
    this.config = config;
    this.container = this.createToolbar();
    this.resultActions = this.createResultActions();
    this.filterInput = this.container.querySelector("#history-filter")!;
    this.filterHighlight = this.container.querySelector(
      "#history-filter-highlight",
    )!;
    this.suggestionsMenu = this.container.querySelector(
      "#history-filter-suggestions",
    )!;
    this.filterError = this.container.querySelector("#history-filter-error")!;
    this.inScopeOnlyCheckbox = this.container.querySelector("#in-scope-only")!;
    this.scanButton = this.container.querySelector("#scan-button")!;
    this.selectionAction = this.resultActions.querySelector("#selection-action")!;
    this.exportAction = this.resultActions.querySelector("#export-action")!;
    this.filterInput.value = config.httpqlFilter;
    this.inScopeOnlyCheckbox.checked = config.inScopeOnly;
    this.renderFilterHighlight();
    this.attachEventListeners();
  }

  public getElement(): HTMLElement {
    return this.container;
  }

  public getResultActionsElement(): HTMLElement {
    return this.resultActions;
  }


  public setFilter(filter: string): void {
    this.filterInput.value = filter;
    this.renderFilterHighlight();
  }

  public setStatus(status: ScanStatus): void {
    this.status = status;
    this.scanButton.classList.toggle(
      "anomaly-button-pause",
      status === "scanning",
    );
    if (status === "scanning") {
      this.scanButton.textContent = "Pause";
      this.scanButton.disabled = false;
    } else if (status === "cancelling") {
      this.scanButton.textContent = "Pausing…";
      this.scanButton.disabled = true;
    } else {
      this.scanButton.textContent = status === "cancelled" ? "Resume" : "Start";
      this.scanButton.disabled = !this.filterIsValid;
    }
    this.container.setAttribute(
      "aria-busy",
      String(status === "scanning" || status === "cancelling"),
    );
  }

  public setHasResults(hasResults: boolean): void {
    this.selectionAction.disabled = !hasResults;
    this.exportAction.disabled = !hasResults;
  }

  private createToolbar(): HTMLElement {
    const toolbar = document.createElement("section");
    toolbar.className = "anomaly-toolbar";
    toolbar.setAttribute("aria-label", "Scan controls");
    toolbar.innerHTML = `
      <div class="anomaly-filter-field">
        <label for="history-filter">History filter <span>(optional)</span></label>
        <div class="anomaly-httpql-input-wrap">
          <pre id="history-filter-highlight" class="anomaly-httpql-highlight" aria-hidden="true"></pre>
          <input
            id="history-filter"
            class="anomaly-control anomaly-httpql-input"
            type="text"
            placeholder='req.path.ncont:".js"'
            autocomplete="off"
            spellcheck="false"
            aria-controls="history-filter-suggestions"
            aria-autocomplete="list"
            aria-expanded="false"
            aria-describedby="history-filter-error"
          />
        </div>
        <div id="history-filter-suggestions" class="anomaly-filter-suggestions" role="listbox" hidden></div>
        <div
          id="history-filter-error"
          class="httpql-error-message"
          role="alert"
          hidden
        ></div>
      </div>
      <div class="anomaly-scan-actions">
        <label class="anomaly-scope-toggle" for="in-scope-only">
          <input id="in-scope-only" type="checkbox" />
          <span>In-scope only</span>
        </label>
        <button id="scan-button" class="anomaly-button anomaly-button-primary" type="button">
          Start
        </button>
      </div>
    `;
    return toolbar;
  }


  private createResultActions(): HTMLElement {
    const actions = document.createElement("div");
    actions.className = "anomaly-bulk-actions";
    actions.setAttribute("aria-label", "Result actions");
    actions.innerHTML = `
      <label>
        <span class="anomaly-visually-hidden">Selection actions</span>
        <select id="selection-action" class="anomaly-control anomaly-select">
          <option value="">Selection</option>
          <option value="select-all">Select all responses</option>
          <option value="deselect-all">Clear selection</option>
          <option value="clear-results">Clear results</option>
        </select>
      </label>
      <label>
        <span class="anomaly-visually-hidden">Export actions</span>
        <select id="export-action" class="anomaly-control anomaly-select">
          <option value="">Export</option>
          <option value="repeater">Send to Replay</option>
          <option value="copy-urls">Copy URLs</option>
          <option value="copy-curls">Copy as cURL</option>
          <option value="csv">Export CSV</option>
          <option value="ffuf">Copy FFUF command</option>
        </select>
      </label>
    `;
    return actions;
  }

  private attachEventListeners(): void {
    this.scanButton.addEventListener("click", async () => {
      if (this.status === "scanning") {
        this.setStatus("cancelling");
        await this.config.onCancel();
        return;
      }
      if (this.status === "cancelling" || !this.filterIsValid) {
        return;
      }
      await this.config.onScan(
        this.filterInput.value.trim(),
        this.inScopeOnlyCheckbox.checked,
        this.status === "cancelled",
      );
    });


    for (const id of ["selection-action", "export-action"]) {
      const select = this.resultActions.querySelector(`#${id}`) as HTMLSelectElement;
      select.addEventListener("change", () => {
        if (select.value) {
          this.config.onBulkAction(select.value);
          select.value = "";
        }
      });
    }

    this.filterInput.addEventListener("input", () => {
      this.renderFilterHighlight();
      this.activeSuggestionIndex = -1;
      this.renderSuggestions();
      if (this.status === "cancelled") {
        this.setStatus("idle");
      }
      clearTimeout(this.validationTimeout);
      this.validationTimeout = setTimeout(() => {
        void this.validateFilter();
      }, 300);
    });
    this.filterInput.addEventListener("scroll", () => {
      this.filterHighlight.scrollLeft = this.filterInput.scrollLeft;
    });
    this.filterInput.addEventListener("focus", () => {
      this.renderSuggestions();
    });
    this.filterInput.addEventListener("blur", () => {
      setTimeout(() => this.hideSuggestions(), 100);
    });
    this.filterInput.addEventListener("keydown", (event) => {
      if (event.key === "Escape") {
        this.hideSuggestions();
        return;
      }
      if (event.key === "ArrowDown" || event.key === "ArrowUp") {
        event.preventDefault();
        const direction = event.key === "ArrowDown" ? 1 : -1;
        const count = this.filteredSuggestions.length;
        if (count === 0) {
          this.renderSuggestions();
          return;
        }
        this.activeSuggestionIndex =
          (this.activeSuggestionIndex + direction + count) % count;
        this.renderSuggestions();
        return;
      }
      if (event.key === "Enter" && this.activeSuggestionIndex >= 0) {
        event.preventDefault();
        this.applySuggestion(
          this.filteredSuggestions[this.activeSuggestionIndex],
        );
      }
    });
    this.inScopeOnlyCheckbox.addEventListener("change", () => {
      if (this.status === "cancelled") {
        this.setStatus("idle");
      }
    });
  }

  private renderSuggestions(): void {
    const { term } = this.getCompletionContext();
    const needle = term.toLowerCase();
    this.filteredSuggestions = HTTPQL_SUGGESTIONS.filter((suggestion) =>
      suggestion.toLowerCase().startsWith(needle),
    ).slice(0, 10);
    if (this.filteredSuggestions.length === 0) {
      this.hideSuggestions();
      return;
    }

    if (this.activeSuggestionIndex >= this.filteredSuggestions.length) {
      this.activeSuggestionIndex = -1;
    }
    this.suggestionsMenu.replaceChildren(
      ...this.filteredSuggestions.map((suggestion, index) => {
        const option = document.createElement("button");
        option.type = "button";
        option.id = `history-filter-suggestion-${index}`;
        option.className = "anomaly-filter-suggestion";
        option.classList.toggle(
          "active",
          index === this.activeSuggestionIndex,
        );
        option.setAttribute("role", "option");
        option.setAttribute(
          "aria-selected",
          String(index === this.activeSuggestionIndex),
        );
        option.textContent = suggestion;
        option.addEventListener("mousedown", (event) => {
          event.preventDefault();
          this.applySuggestion(suggestion);
        });
        return option;
      }),
    );
    this.suggestionsMenu.hidden = false;
    this.filterInput.setAttribute("aria-expanded", "true");
    if (this.activeSuggestionIndex >= 0) {
      this.filterInput.setAttribute(
        "aria-activedescendant",
        `history-filter-suggestion-${this.activeSuggestionIndex}`,
      );
    } else {
      this.filterInput.removeAttribute("aria-activedescendant");
    }
  }

  private getCompletionContext(): { start: number; term: string } {
    const cursor = this.filterInput.selectionStart ?? this.filterInput.value.length;
    const beforeCursor = this.filterInput.value.slice(0, cursor);
    const upper = beforeCursor.toUpperCase();
    const andIndex = upper.lastIndexOf(" AND ");
    const orIndex = upper.lastIndexOf(" OR ");
    const openParenIndex = beforeCursor.lastIndexOf("(");
    const start = Math.max(
      andIndex === -1 ? 0 : andIndex + 5,
      orIndex === -1 ? 0 : orIndex + 4,
      openParenIndex === -1 ? 0 : openParenIndex + 1,
    );
    return {
      start,
      term: beforeCursor.slice(start).trimStart(),
    };
  }

  private applySuggestion(suggestion: string): void {
    const { start } = this.getCompletionContext();
    const end = this.filterInput.selectionEnd ?? this.filterInput.value.length;
    const prefix = this.filterInput.value.slice(0, start);
    const suffix = this.filterInput.value.slice(end);
    this.filterInput.value = `${prefix}${suggestion}${suffix}`;
    const cursor = prefix.length + suggestion.length;
    this.filterInput.setSelectionRange(cursor, cursor);
    this.renderFilterHighlight();
    this.hideSuggestions();
    void this.validateFilter();
  }

  private hideSuggestions(): void {
    this.filteredSuggestions = [];
    this.activeSuggestionIndex = -1;
    this.suggestionsMenu.hidden = true;
    this.filterInput.setAttribute("aria-expanded", "false");
    this.filterInput.removeAttribute("aria-activedescendant");
  }

  private renderFilterHighlight(): void {
    const value = this.filterInput.value;
    const fragment = document.createDocumentFragment();
    let cursor = 0;

    HTTPQL_TOKEN.lastIndex = 0;
    for (const match of value.matchAll(HTTPQL_TOKEN)) {
      const index = match.index ?? 0;
      if (index > cursor) {
        fragment.append(document.createTextNode(value.slice(cursor, index)));
      }
      const token = document.createElement("span");
      token.textContent = match[0];
      if (match[0].startsWith('"')) {
        token.className = "httpql-token-string";
      } else if (match[0].startsWith("req.") || match[0].startsWith("resp.")) {
        token.className = "httpql-token-field";
      } else if (match[0].startsWith(".") || match[0].startsWith("preset:")) {
        token.className = "httpql-token-operator";
      } else if (/^\d+$/.test(match[0])) {
        token.className = "httpql-token-number";
      } else {
        token.className = "httpql-token-keyword";
      }
      fragment.append(token);
      cursor = index + match[0].length;
    }
    if (cursor < value.length) {
      fragment.append(document.createTextNode(value.slice(cursor)));
    }
    this.filterHighlight.replaceChildren(fragment);
  }

  private async validateFilter(): Promise<void> {
    const filter = this.filterInput.value.trim();
    if (!filter) {
      this.setFilterValidity(true);
      return;
    }

    const result = await this.caido.backend.validateHttpql(filter);
    this.setFilterValidity(result.valid, result.error);
  }

  private setFilterValidity(valid: boolean, error?: string): void {
    this.filterIsValid = valid;
    this.filterInput.setAttribute("aria-invalid", String(!valid));
    this.filterError.hidden = valid;
    this.filterError.textContent = valid ? "" : error ?? "This history filter is not valid.";
    this.scanButton.disabled =
      this.status === "cancelling" ||
      (!valid && this.status !== "scanning");
  }
}
