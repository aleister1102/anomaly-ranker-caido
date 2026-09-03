import type { RankedResult } from "../../../shared/types.js";
import { getStatusColor } from "../utils/colors.js";

const ROW_HEIGHT = 41;
const BUFFER_ROWS = 10;

interface ColumnConfig {
  field: keyof RankedResult;
  label: string;
  width: number;
  minWidth: number;
}

export class ResultsTable {
  private container: HTMLElement;
  private headerWrap: HTMLElement;
  private scrollContainer: HTMLElement;
  private tableWrapper: HTMLElement;
  private tbody: HTMLElement | null = null;
  private results: RankedResult[] = [];
  private originalResults: RankedResult[] = [];
  private onSelect: (id: string) => void;
  private sortField: keyof RankedResult | null = null;
  private sortDirection: "asc" | "desc" | "none" = "none";
  private selectedIds: Set<string> = new Set();
  private lastClickedId: string | null = null;
  private visibleStart = 0;
  private visibleEnd = 0;
  private scrollHandler: (() => void) | null = null;
  
  private emptyMessage = "No scan yet. Choose your filter and select Start.";

  private columns: ColumnConfig[] = [
    { field: "id", label: "Request", width: 180, minWidth: 120 },
    { field: "rank", label: "Score", width: 70, minWidth: 55 },
    { field: "occurrences", label: "Count", width: 70, minWidth: 55 },
    { field: "rawRank", label: "Base score", width: 90, minWidth: 70 },
    { field: "method", label: "Method", width: 70, minWidth: 55 },
    { field: "statusCode", label: "Status", width: 80, minWidth: 65 },
    { field: "contentLength", label: "Size", width: 90, minWidth: 65 },
    { field: "contentType", label: "Type", width: 130, minWidth: 80 },
    { field: "location", label: "Redirect target", width: 200, minWidth: 100 },
    { field: "url", label: "URL", width: 420, minWidth: 160 },
  ];

  private resizing: { colIndex: number; startX: number; startWidth: number } | null = null;

  constructor(onSelect: (id: string) => void) {
    this.container = document.createElement("div");
    this.container.className = "anomaly-table-container";
    this.container.style.cssText =
      "width: 100%; display: flex; flex-direction: column; overflow: hidden; position: relative;";

    this.headerWrap = document.createElement("div");
    this.headerWrap.className = "anomaly-table-header-wrap";
    this.headerWrap.style.cssText =
      "width: 100%; overflow: hidden; flex: 0 0 auto;";

    this.scrollContainer = document.createElement("div");
    this.scrollContainer.className = "anomaly-table-scroll";
    this.scrollContainer.style.cssText =
      "width: 100%; flex: 1 1 auto; overflow: auto; position: relative;";

    this.tableWrapper = document.createElement("div");
    this.tableWrapper.style.cssText =
      "position: relative; width: 100%; min-width: 100%;";

    this.scrollContainer.appendChild(this.tableWrapper);
    this.container.appendChild(this.headerWrap);
    this.container.appendChild(this.scrollContainer);

    this.onSelect = onSelect;

    document.addEventListener("mousemove", this.handleMouseMove.bind(this));
    document.addEventListener("mouseup", this.handleMouseUp.bind(this));
    this.render();
  }

  public getElement(): HTMLElement {
    return this.container;
  }

  public update(results: RankedResult[]): void {
    this.originalResults = results;
    this.sort();
    this.render();
  }

  public setEmptyMessage(message: string): void {
    this.emptyMessage = message;
    if (this.results.length === 0) this.renderEmpty();
  }

  public getSelectedIds(): string[] {
    return Array.from(this.selectedIds);
  }

  public selectAll(): void {
    this.selectedIds = new Set(this.results.map((result) => String(result.id)));
    this.updateVisibleRows();
  }

  public deselectAll(): void {
    this.selectedIds.clear();
    this.updateVisibleRows();
  }

  private sort(): void {
    this.results = [...this.originalResults];
    if (this.sortDirection === "none" || !this.sortField) return;

    const field = this.sortField;
    const direction = this.sortDirection === "asc" ? 1 : -1;
    this.results.sort((left, right) => {
      const leftValue = left[field];
      const rightValue = right[field];
      if (leftValue === undefined || rightValue === undefined) return 0;
      if (
        typeof leftValue === "string" &&
        typeof rightValue === "string"
      ) {
        return direction * leftValue.localeCompare(rightValue);
      }
      if (leftValue < rightValue) return -direction;
      if (leftValue > rightValue) return direction;
      return 0;
    });
  }

  private setSort(field: keyof RankedResult): void {
    if (this.sortField === field) {
      if (this.sortDirection === "asc") {
        this.sortDirection = "desc";
      } else if (this.sortDirection === "desc") {
        this.sortDirection = "none";
        this.sortField = null;
      } else {
        this.sortDirection = "asc";
      }
    } else {
      this.sortField = field;
      this.sortDirection = "asc";
    }
    this.sort();
    this.scrollContainer.scrollTop = 0;
  }

  private handleMouseMove(e: MouseEvent) {
    if (!this.resizing) return;
    
    const delta = e.clientX - this.resizing.startX;
    
    const totalWeight = this.columns.reduce((sum, col) => sum + col.width, 0);
    const tablePixelWidth = this.scrollContainer.clientWidth;
    const weightPerPixel = totalWeight / tablePixelWidth;
    
    const weightDelta = delta * weightPerPixel;
    const newWeight = Math.max(this.columns[this.resizing.colIndex].minWidth * weightPerPixel, this.resizing.startWidth + weightDelta);
    
    this.columns[this.resizing.colIndex].width = newWeight;
    this.updateColumnWidths();
  }

  private handleMouseUp() {
    if (this.resizing) {
      this.resizing = null;
      document.body.style.cursor = "";
      document.body.style.userSelect = "";
    }
  }

  private startResize(colIndex: number, e: MouseEvent) {
    e.preventDefault();
    e.stopPropagation();
    
    this.resizing = {
      colIndex,
      startX: e.clientX,
      startWidth: this.columns[colIndex].width,
    };
    
    document.body.style.cursor = "col-resize";
    document.body.style.userSelect = "none";
  }

  private updateColumnWidths() {
    const header = this.headerWrap.querySelector(".caido-table-header");
    if (header) {
      this.columns.forEach((col, i) => {
        const headerCol = header.children[i] as HTMLElement;
        if (headerCol) {
          headerCol.style.width = this.getColumnWidthPercent(i);
          headerCol.style.minWidth = `${col.minWidth}px`;
        }
      });
    }
    this.syncScrollbarGutter();
    if (this.tbody) {
      this.tbody.querySelectorAll(".caido-table-row").forEach(row => {
        this.columns.forEach((col, i) => {
          const cell = row.children[i] as HTMLElement;
          if (cell) {
            cell.style.width = this.getColumnWidthPercent(i);
            cell.style.minWidth = `${col.minWidth}px`;
          }
        });
      });
    }
  }

  private render() {
    this.visibleStart = -1;
    this.visibleEnd = -1;

    if (this.scrollHandler) {
      this.scrollContainer.removeEventListener("scroll", this.scrollHandler);
    }

    const totalHeight = this.results.length * ROW_HEIGHT;
    
    const headerCols = this.columns.map((col, i) => {
      const isLast = i === this.columns.length - 1;
      const widthStyle = `width: ${this.getColumnWidthPercent(i)}; min-width: ${col.minWidth}px; flex-shrink: 0;${isLast ? "" : " border-right: 1px solid var(--ar-rule);"}`;
      const ariaSort =
        this.sortField !== col.field || this.sortDirection === "none"
          ? "none"
          : this.sortDirection === "asc" ? "ascending" : "descending";
      const resizeHandle = isLast
        ? ""
        : `<div
            class="resize-handle"
            data-col="${i}"
            role="separator"
            aria-label="Resize ${col.label} column"
            aria-orientation="vertical"
          ></div>`;
      return `
        <div role="columnheader" aria-sort="${ariaSort}" style="${widthStyle} position: relative;">
          <button type="button" data-field="${col.field}" class="anomaly-column-sort">
            ${col.label} ${this.getSortIcon(col.field)}
          </button>
          ${resizeHandle}
        </div>
      `;
    }).join("");

    this.headerWrap.innerHTML = `
      <div class="caido-table-header" role="row">
        ${headerCols}
      </div>
    `;

    this.tableWrapper.setAttribute("role", "grid");
    this.tableWrapper.setAttribute("aria-label", "Ranked response signals");
    this.tableWrapper.setAttribute("aria-rowcount", String(this.results.length));
    this.tableWrapper.innerHTML = `
      <div class="virtual-scroll-body" role="rowgroup" style="position: relative; height: ${totalHeight}px; width: 100%;"></div>
    `;

    this.tbody = this.tableWrapper.querySelector(".virtual-scroll-body");

    this.headerWrap.querySelectorAll<HTMLButtonElement>("[data-field]").forEach(button => {
      button.addEventListener("click", () => {
        this.setSort(button.dataset.field as keyof RankedResult);
        this.render();
      });
    });

    this.headerWrap.querySelectorAll(".resize-handle").forEach(handle => {
      handle.addEventListener("mousedown", (e) => {
        const colIndex = parseInt((handle as HTMLElement).getAttribute("data-col") || "0");
        this.startResize(colIndex, e as MouseEvent);
      });
    });

    this.scrollHandler = () => {
      this.headerWrap.scrollLeft = this.scrollContainer.scrollLeft;
      this.updateVisibleRows();
    };
    this.scrollContainer.addEventListener("scroll", this.scrollHandler);
    this.syncScrollbarGutter();
    this.updateVisibleRows();
  }

  private syncScrollbarGutter(): void {
    const scrollbarWidth =
      this.scrollContainer.offsetWidth - this.scrollContainer.clientWidth;
    this.headerWrap.style.paddingRight = `${Math.max(0, scrollbarWidth)}px`;
  }
  private getColumnWidthPercent(colIndex: number): string {
    const totalWeight = this.columns.reduce((sum, col) => sum + col.width, 0);
    const percent = (this.columns[colIndex].width / totalWeight) * 100;
    return `${percent}%`;
  }

  private updateVisibleRows() {
    if (!this.tbody) return;

    const scrollTop = this.scrollContainer.scrollTop;
    const viewportHeight = this.scrollContainer.clientHeight;
    
    const start = Math.max(0, Math.floor(scrollTop / ROW_HEIGHT) - BUFFER_ROWS);
    const end = Math.min(this.results.length, Math.ceil((scrollTop + viewportHeight) / ROW_HEIGHT) + BUFFER_ROWS);

    if (start === this.visibleStart && end === this.visibleEnd) {
      this.tbody.querySelectorAll(".caido-table-row").forEach(row => {
        const id = row.getAttribute("data-id");
        if (id) row.classList.toggle("selected", this.selectedIds.has(id));
      });
      return;
    }

    this.visibleStart = start;
    this.visibleEnd = end;

    if (this.results.length === 0) {
      this.renderEmpty();
      return;
    }

    const visibleResults = this.results.slice(start, end);

    this.tbody.replaceChildren();
    for (let i = 0; i < visibleResults.length; i++) {
      const result = visibleResults[i];
      const actualIndex = start + i;
      const topOffset = actualIndex * ROW_HEIGHT;
      const id = String(result.id);

      const row = document.createElement("div");
      row.className = `caido-table-row${this.selectedIds.has(id) ? " selected" : ""}`;
      row.dataset.id = id;
      row.dataset.index = String(actualIndex);
      row.style.cssText = `position: absolute; top: ${topOffset}px; width: 100%; height: ${ROW_HEIGHT}px; display: flex; align-items: center; border-bottom: 1px solid var(--ar-rule); cursor: pointer;`;
      row.setAttribute("role", "row");
      row.setAttribute("aria-rowindex", String(actualIndex + 1));
      row.setAttribute("aria-selected", String(this.selectedIds.has(id)));
      row.tabIndex = 0;


      this.columns.forEach((column, columnIndex) => {
        const cell = document.createElement("div");
        cell.setAttribute("role", "gridcell");
        const widthStyle = `width: ${this.getColumnWidthPercent(columnIndex)}; min-width: ${column.minWidth}px; flex-shrink: 0;`;
        if (column.field === "rank" && result.rank > 70) {
          cell.className = "rank-high";
        }
        cell.style.cssText = `${widthStyle} padding: 12px; overflow: hidden; text-overflow: ellipsis; white-space: nowrap;`;
        if (column.field === "statusCode") {
          const dot = document.createElement("span");
          dot.className = "anomaly-status-dot";
          dot.style.background = getStatusColor(result.statusCode);
          dot.setAttribute("aria-hidden", "true");
          cell.append(dot, document.createTextNode(String(result.statusCode)));
        } else {
          cell.textContent = this.getCellValue(result, column.field);
        }
        row.appendChild(cell);
      });

      const selectRow = (mouseEvent?: MouseEvent) => {
        const currentIndex = Number(row.dataset.index);
        const additive = Boolean(mouseEvent?.ctrlKey || mouseEvent?.metaKey);
        if (mouseEvent?.shiftKey && this.lastClickedId) {
          const lastIndex = this.results.findIndex(
            (item) => String(item.id) === this.lastClickedId,
          );
          if (!additive) this.selectedIds.clear();
          for (
            let index = Math.min(currentIndex, lastIndex);
            index <= Math.max(currentIndex, lastIndex);
            index++
          ) {
            this.selectedIds.add(String(this.results[index].id));
          }
        } else if (additive) {
          if (this.selectedIds.has(id)) this.selectedIds.delete(id);
          else this.selectedIds.add(id);
        } else {
          this.selectedIds.clear();
          this.selectedIds.add(id);
        }
        this.lastClickedId = id;
        this.onSelect(id);
        this.updateVisibleRows();
      };

      row.addEventListener("click", (event) => selectRow(event));
      row.addEventListener("keydown", (event) => {
        if (event.key !== "Enter" && event.key !== " ") return;
        event.preventDefault();
        selectRow();
      });
      this.tbody.appendChild(row);
    }
  }

  public renderEmpty(): void {
    if (!this.tbody) return;
    const row = document.createElement("div");
    row.className = "anomaly-table-empty-notice";
    row.textContent = this.emptyMessage;
    this.tbody.replaceChildren(row);
  }

  private getCellValue(r: RankedResult, field: keyof RankedResult): string {
    switch (field) {
      case "rank": return String(r.rank);
      case "occurrences": return String(r.occurrences);
      case "rawRank": return String(r.rawRank);
      case "method": return r.method;
      case "statusCode": return String(r.statusCode);
      case "contentLength": return String(r.contentLength);
      case "contentType": return r.contentType;
      case "location": return r.location || "-";
      case "id": return String(r.id);
      case "url": return r.url;
      default: return "";
    }
  }

  private getSortIcon(field: keyof RankedResult): string {
    if (this.sortField !== field || this.sortDirection === "none") return "";
    return this.sortDirection === "asc" ? '<i class="fas fa-sort-up"></i>' : '<i class="fas fa-sort-down"></i>';
  }
}
