import type { Caido } from "@caido/sdk-frontend";
import type {
  BackendEndpoints,
  RankedResult,
} from "../../../shared/types.js";


export class RequestViewer {
  private readonly container: HTMLElement;
  private readonly caido: Caido<BackendEndpoints>;
  private readonly requestEditor: ReturnType<Caido<BackendEndpoints>["ui"]["httpRequestEditor"]>;
  private readonly responseEditor: ReturnType<Caido<BackendEndpoints>["ui"]["httpResponseEditor"]>;
  private readonly resizer: HTMLElement;
  private readonly onVisibilityChange: (visible: boolean) => void;
  private viewerHeight = 320;
  private showSequence = 0;

  constructor(
    caido: Caido<BackendEndpoints>,
    onVisibilityChange: (visible: boolean) => void = () => {},
  ) {
    this.caido = caido;
    this.onVisibilityChange = onVisibilityChange;
    this.container = document.createElement("section");
    this.container.className = "anomaly-viewer-container";
    this.container.style.height = `${this.viewerHeight}px`;

    this.resizer = document.createElement("div");
    this.resizer.className = "anomaly-viewer-resizer";
    this.resizer.tabIndex = 0;
    this.resizer.setAttribute("role", "separator");
    this.resizer.setAttribute("aria-label", "Resize request details");
    this.resizer.setAttribute("aria-orientation", "horizontal");
    this.container.appendChild(this.resizer);
    this.setupResizer();

    this.requestEditor = caido.ui.httpRequestEditor();
    this.responseEditor = caido.ui.httpResponseEditor();
  }

  public getElement(): HTMLElement {
    return this.container;
  }

  public async show(
    id: string,
    ranked?: RankedResult,
  ): Promise<void> {
    const sequence = ++this.showSequence;
    this.container.style.display = "flex";
    this.onVisibilityChange(true);
    this.setHeight(this.viewerHeight);
    this.container.setAttribute("aria-label", `Request ${id} details`);
    for (const node of Array.from(this.container.childNodes)) {
      if (node !== this.resizer) node.remove();
    }

    const header = document.createElement("div");
    header.className = "anomaly-viewer-header";
    const title = document.createElement("span");
    title.textContent = ranked
      ? `Request ${id} · Score ${ranked.rank}`
      : `Request ${id}`;
    const close = document.createElement("button");
    close.type = "button";
    close.className = "anomaly-viewer-close";
    close.setAttribute("aria-label", "Close request details");
    close.textContent = "×";
    close.addEventListener("click", () => this.hide());
    header.append(title, close);

    const body = document.createElement("div");
    body.className = "anomaly-viewer-body";
    const requestWrapper = document.createElement("div");
    const responseWrapper = document.createElement("div");
    requestWrapper.appendChild(this.requestEditor.getElement());
    responseWrapper.appendChild(this.responseEditor.getElement());
    body.append(requestWrapper, responseWrapper);
    this.container.append(header, body);
    const recordPromise = this.caido.graphql.request({ id });

    try {
      await Promise.all([
        this.setEditorRaw(this.requestEditor, "", sequence),
        this.setEditorRaw(this.responseEditor, "", sequence),
      ]);
      const record = await recordPromise;
      if (sequence !== this.showSequence) return;
      await this.setEditorRaw(
        this.requestEditor,
        record?.request?.raw ?? "",
        sequence,
      );

      if (record?.request?.response?.id) {
        const response = await this.caido.graphql.response({
          id: record.request.response.id,
        });
        if (sequence !== this.showSequence) return;
        await this.setEditorRaw(
          this.responseEditor,
          response?.response?.raw ?? "",
          sequence,
        );
      } else {
        await this.setEditorRaw(
          this.responseEditor,
          "No response was captured for this request.",
          sequence,
        );
      }

    } catch (error) {
      if (sequence !== this.showSequence) return;
      this.caido.log.error(
        `Could not load request ${id} details: ${String(error)}`,
      );
      const errorMessage = document.createElement("div");
      errorMessage.className = "anomaly-viewer-error";
      errorMessage.textContent =
        "Request details could not be loaded. Select the row again or run the scan again.";
      this.container.appendChild(errorMessage);
    }
  }

  public hide(): void {
    this.showSequence++;
    this.container.style.display = "none";
    this.onVisibilityChange(false);
  }

  private setupResizer(): void {
    let startY = 0;
    let startHeight = 0;

    const finishResize = (event: PointerEvent) => {
      if (!this.resizer.hasPointerCapture(event.pointerId)) return;
      this.resizer.releasePointerCapture(event.pointerId);
      document.body.style.cursor = "";
      document.body.style.userSelect = "";
    };

    this.resizer.addEventListener("pointerdown", (event) => {
      if (event.button !== 0) return;
      event.preventDefault();
      startY = event.clientY;
      startHeight = this.container.offsetHeight;
      this.resizer.setPointerCapture(event.pointerId);
      document.body.style.cursor = "row-resize";
      document.body.style.userSelect = "none";
    });
    this.resizer.addEventListener("pointermove", (event) => {
      if (!this.resizer.hasPointerCapture(event.pointerId)) return;
      this.setHeight(startHeight - (event.clientY - startY));
    });
    this.resizer.addEventListener("pointerup", finishResize);
    this.resizer.addEventListener("pointercancel", finishResize);
    this.resizer.addEventListener("keydown", (event) => {
      if (event.key !== "ArrowUp" && event.key !== "ArrowDown") return;
      event.preventDefault();
      this.setHeight(
        this.viewerHeight + (event.key === "ArrowUp" ? 24 : -24),
      );
    });
  }

  private setHeight(height: number): void {
    const dashboardHeight = this.container.parentElement?.clientHeight ?? 800;
    const maxHeight = Math.max(320, dashboardHeight - 48);
    this.viewerHeight = Math.min(Math.max(height, 240), maxHeight);
    this.container.style.height = `${this.viewerHeight}px`;
  }


  private async setEditorRaw(
    editor: typeof this.requestEditor | typeof this.responseEditor,
    raw: string,
    sequence: number,
  ): Promise<void> {
    for (let attempt = 0; attempt < 20; attempt++) {
      if (sequence !== this.showSequence) return;
      try {
        const view = editor.getEditorView();
        if (view) {
          view.dispatch({
            changes: {
              from: 0,
              to: view.state.doc.length,
              insert: raw,
            },
          });
          return;
        }
      } catch {
        // The editor can be unavailable for a frame while Caido mounts it.
      }
      await new Promise((resolve) => setTimeout(resolve, 16));
    }
    throw new Error("Caido editor did not become ready");
  }
}
