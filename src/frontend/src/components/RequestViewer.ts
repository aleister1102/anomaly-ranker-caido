import type { Caido } from "@caido/sdk-frontend";

export class RequestViewer {
  private container: HTMLElement;
  private caido: Caido<any>;
  private requestEditor: any;
  private responseEditor: any;
  private viewerHeight = 400;
  private resizer: HTMLElement;

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

      // Min height
      if (newHeight < 200) newHeight = 200;

      // Max height - keep table visible
      const dashboard = this.container.parentElement;
      const table = dashboard?.querySelector(".anomaly-table-container") as HTMLElement;
      if (table && dashboard) {
        const dashboardHeight = dashboard.offsetHeight;
        // Total height minus the space taken by other elements (excluding table and viewer)
        // We want table to be at least 100px
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

  public async show(id: string) {
    this.container.style.display = "flex";
    this.container.style.height = `${this.viewerHeight}px`;
    
    // Clear everything except resizer
    Array.from(this.container.childNodes).forEach(node => {
      if (node !== this.resizer) this.container.removeChild(node);
    });

    const viewerHeader = document.createElement("div");
    viewerHeader.className = "anomaly-viewer-header";
    viewerHeader.innerHTML = `<span>Request ID: ${id}</span>`;
    
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
