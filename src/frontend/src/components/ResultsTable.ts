import type { RankedResult } from "../../../shared/types.js";
import { getRowColor, getRowBackgroundColor } from "../utils/colors.js";

const ROW_HEIGHT = 41;
const BUFFER_ROWS = 10;

interface ColumnConfig {
  field: keyof RankedResult;
  label: string;
  width: number;
  minWidth: number;
  flex?: boolean;
}

export class ResultsTable {
  private container: HTMLElement;
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
  
  // Column configuration with resizable widths
  private columns: ColumnConfig[] = [
    { field: "id", label: "ID", width: 240, minWidth: 140 },
    { field: "rank", label: "Rank", width: 60, minWidth: 40 },
    { field: "method", label: "Method", width: 70, minWidth: 50 },
    { field: "statusCode", label: "Status", width: 60, minWidth: 50 },
    { field: "contentLength", label: "Length", width: 80, minWidth: 50 },
    { field: "contentType", label: "Type", width: 120, minWidth: 60 },
    { field: "location", label: "Location", width: 200, minWidth: 80 },
    { field: "url", label: "URL", width: 400, minWidth: 100 },
  ];

  // Resize state
  private resizing: { colIndex: number; startX: number; startWidth: number } | null = null;

  constructor(onSelect: (id: string) => void) {
    this.container = document.createElement("div");
    this.container.className = "anomaly-table-container";
    this.container.style.width = "100%";
    
    this.scrollContainer = document.createElement("div");
    this.scrollContainer.style.flex = "1";
    this.scrollContainer.style.overflow = "auto";
    this.scrollContainer.style.position = "relative";
    this.scrollContainer.style.width = "100%";
    
    this.tableWrapper = document.createElement("div");
    this.tableWrapper.style.position = "relative";
    this.tableWrapper.style.width = "100%";
    this.tableWrapper.style.minWidth = "100%";
    
    this.scrollContainer.appendChild(this.tableWrapper);
    this.container.appendChild(this.scrollContainer);
    
    this.onSelect = onSelect;
    
    // Global mouse handlers for resizing
    document.addEventListener("mousemove", this.handleMouseMove.bind(this));
    document.addEventListener("mouseup", this.handleMouseUp.bind(this));
  }

  public getElement(): HTMLElement {
    return this.container;
  }

  public update(results: RankedResult[]) {
    this.results = [...results];
    this.originalResults = [...results];
    this.sort();
    this.render();
  }

  public getSelectedIds(): string[] {
    return Array.from(this.selectedIds);
  }

  public selectAll() {
    this.selectedIds = new Set(this.results.map(r => r.id as unknown as string));
    this.updateVisibleRows();
  }

  public deselectAll() {
    this.selectedIds.clear();
    this.updateVisibleRows();
  }

  private sort() {
    if (this.sortDirection === "none" || !this.sortField) {
      this.results = [...this.originalResults];
      return;
    }

    const field = this.sortField;
    this.results.sort((a, b) => {
      const v1 = a[field];
      const v2 = b[field];
      if (v1 === undefined || v2 === undefined) return 0;
      
      if (typeof v1 === "string" && typeof v2 === "string") {
        return this.sortDirection === "asc" 
          ? v1.localeCompare(v2)
          : v2.localeCompare(v1);
      }

      if (v1 < v2) return this.sortDirection === "asc" ? -1 : 1;
      if (v1 > v2) return this.sortDirection === "asc" ? 1 : -1;
      return 0;
    });
  }

  private setSort(field: keyof RankedResult) {
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
    this.updateVisibleRows();
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
    // Update header widths
    const header = this.tableWrapper.querySelector(".caido-table-header");
    if (header) {
      this.columns.forEach((col, i) => {
        const headerCol = header.children[i] as HTMLElement;
        if (headerCol) {
          headerCol.style.width = this.getColumnWidthPercent(i);
          headerCol.style.minWidth = `${col.minWidth}px`;
        }
      });
    }
    
    // Update row widths
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
    
    // Build header HTML
    const headerCols = this.columns.map((col, i) => {
      const widthStyle = `width: ${this.getColumnWidthPercent(i)}; min-width: ${col.minWidth}px; flex-shrink: 0;`;
      const resizeHandle = `<div class="resize-handle" data-col="${i}" style="position: absolute; right: 0; top: 0; bottom: 0; width: 6px; cursor: col-resize; z-index: 1;"></div>`;
      return `<div data-field="${col.field}" style="${widthStyle} padding: 12px; font-weight: 600; cursor: pointer; position: relative; box-sizing: border-box;">${col.label} ${this.getSortIcon(col.field)}${resizeHandle}</div>`;
    }).join("");
    
    this.tableWrapper.innerHTML = `
      <div class="caido-table-header" style="display: flex; align-items: center; border-bottom: 1px solid var(--border-color); background: var(--background, #1e1e1e); position: sticky; top: 0; z-index: 10;">
        ${headerCols}
      </div>
      <div class="virtual-scroll-body" style="position: relative; height: ${totalHeight}px; width: 100%;">
      </div>
    `;

    this.tbody = this.tableWrapper.querySelector(".virtual-scroll-body");

    // Attach sort handlers (but not on resize handles)
    this.tableWrapper.querySelectorAll("[data-field]").forEach(th => {
      th.addEventListener("click", (e) => {
        if ((e.target as HTMLElement).classList.contains("resize-handle")) return;
        const field = th.getAttribute("data-field") as keyof RankedResult;
        this.setSort(field);
        this.render(); // Re-render to update sort icons
      });
    });

    // Attach resize handlers
    this.tableWrapper.querySelectorAll(".resize-handle").forEach(handle => {
      handle.addEventListener("mousedown", (e) => {
        const colIndex = parseInt((handle as HTMLElement).getAttribute("data-col") || "0");
        this.startResize(colIndex, e as MouseEvent);
      });
    });

    this.scrollHandler = () => this.updateVisibleRows();
    this.scrollContainer.addEventListener("scroll", this.scrollHandler);
    this.updateVisibleRows();
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
    const end = Math.min(
      this.results.length,
      Math.ceil((scrollTop + viewportHeight) / ROW_HEIGHT) + BUFFER_ROWS
    );

    if (start === this.visibleStart && end === this.visibleEnd) {
      this.tbody.querySelectorAll(".caido-table-row").forEach(row => {
        const id = row.getAttribute("data-id");
        if (id) {
          row.classList.toggle("selected", this.selectedIds.has(id));
        }
      });
      return;
    }

    this.visibleStart = start;
    this.visibleEnd = end;

    const visibleResults = this.results.slice(start, end);
    
    this.tbody.innerHTML = visibleResults.map((r, i) => {
      const actualIndex = start + i;
      const topOffset = actualIndex * ROW_HEIGHT;
      const rowBgColor = getRowBackgroundColor(r.statusCode, r.contentType);
      const indicatorColor = getRowColor(r.statusCode, r.contentType);
      
      const cells = this.columns.map((col, colIdx) => {
        const widthStyle = `width: ${this.getColumnWidthPercent(colIdx)}; min-width: ${col.minWidth}px; flex-shrink: 0;`;
        const value = this.getCellValue(r, col.field);
        const extraStyle = colIdx === 0 
          ? `border-left: 4px solid ${indicatorColor};` 
          : "";
        const rankClass = col.field === "rank" && r.rank > 70 ? "rank-high" : "";
        return `<div class="${rankClass}" style="${widthStyle} ${extraStyle} padding: 12px; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; box-sizing: border-box;">${value}</div>`;
      }).join("");
      
      return `
        <div class="caido-table-row ${this.selectedIds.has(r.id as unknown as string) ? 'selected' : ''}" 
            data-id="${r.id}" 
            data-index="${actualIndex}"
            style="position: absolute; top: ${topOffset}px; width: 100%; height: ${ROW_HEIGHT}px; display: flex; align-items: center; border-bottom: 1px solid var(--border-color); cursor: pointer; box-sizing: border-box; background-color: ${rowBgColor};">
          ${cells}
        </div>
      `;
    }).join("");

    this.tbody.querySelectorAll(".caido-table-row").forEach(row => {
      row.addEventListener("click", ((event: Event) => {
        const mouseEvent = event as MouseEvent;
        const id = (row as HTMLElement).getAttribute("data-id");
        const indexStr = (row as HTMLElement).getAttribute("data-index");
        if (!id || !indexStr) return;

        const currentIndex = parseInt(indexStr);

        if (mouseEvent.shiftKey && this.lastClickedId) {
          const lastIndex = this.results.findIndex(r => r.id === this.lastClickedId);
          const rangeStart = Math.min(currentIndex, lastIndex);
          const rangeEnd = Math.max(currentIndex, lastIndex);
          
          if (!mouseEvent.ctrlKey && !mouseEvent.metaKey) {
            this.selectedIds.clear();
          }
          
          for (let idx = rangeStart; idx <= rangeEnd; idx++) {
            this.selectedIds.add(this.results[idx].id as unknown as string);
          }
        } else if (mouseEvent.ctrlKey || mouseEvent.metaKey) {
          if (this.selectedIds.has(id)) {
            this.selectedIds.delete(id);
          } else {
            this.selectedIds.add(id);
          }
        } else {
          this.selectedIds.clear();
          this.selectedIds.add(id);
        }

        this.lastClickedId = id;
        this.onSelect(id);
        this.updateVisibleRows();
      }) as EventListener);
    });
  }

  private getCellValue(r: RankedResult, field: keyof RankedResult): string {
    switch (field) {
      case "rank": return String(r.rank);
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
