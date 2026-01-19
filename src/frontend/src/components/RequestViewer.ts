import type { Caido } from "@caido/sdk-frontend";

export class RequestViewer {
  private container: HTMLElement;
  private caido: Caido<any>;
  private requestEditor: any;
  private responseEditor: any;

  constructor(caido: Caido<any>) {
    this.caido = caido;
    this.container = document.createElement("div");
    this.container.className = "anomaly-viewer-container";

    this.requestEditor = caido.ui.httpRequestEditor();
    this.responseEditor = caido.ui.httpResponseEditor();
  }

  public getElement(): HTMLElement {
    return this.container;
  }

  public async show(id: string) {
    this.container.style.display = "flex";
    this.container.innerHTML = "";

    const viewerHeader = document.createElement("div");
    viewerHeader.className = "anomaly-viewer-header";
    viewerHeader.innerHTML = `<span>Request ID: ${id}</span>`;
    
    const closeBtn = document.createElement("button");
    closeBtn.innerHTML = "&times;";
    closeBtn.style.background = "none";
    closeBtn.style.border = "none";
    closeBtn.style.fontSize = "20px";
    closeBtn.style.cursor = "pointer";
    closeBtn.style.color = "var(--color-foreground)";
    closeBtn.addEventListener("click", () => {
      this.hide();
    });
    viewerHeader.appendChild(closeBtn);
    
    const viewerBody = document.createElement("div");
    viewerBody.className = "anomaly-viewer-body";
    
    const requestWrapper = document.createElement("div");
    requestWrapper.style.cssText = "flex: 1; width: 50%; min-width: 0; overflow: hidden;";
    requestWrapper.appendChild(this.requestEditor.getElement());

    const responseWrapper = document.createElement("div");
    responseWrapper.style.cssText = "flex: 1; width: 50%; min-width: 0; overflow: hidden;";
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
