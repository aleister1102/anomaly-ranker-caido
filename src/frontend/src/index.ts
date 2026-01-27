import type { Caido, CommandContext } from "@caido/sdk-frontend";
import { BackendEndpoints } from "../../shared/types.js";
import { createDashboard } from "./components/Dashboard.js";

const COMMAND_ID = "anomaly-ranker.rankSelection";
const SIDEBAR_PATH = "/anomaly-ranker";

function collectRequestIds(
  caido: Caido<BackendEndpoints>,
  context: CommandContext
): string[] {
  const ids = new Set<string>();

  if (context.type === "RequestRowContext") {
    context.requests
      .map((request) => request.id)
      .filter(Boolean)
      .forEach((id) => ids.add(id));
  } else if (context.type === "RequestContext") {
    if ("id" in context.request && context.request.id) {
      ids.add(context.request.id);
    }
  } else if (context.type === "ResponseContext") {
    if (context.request.id) {
      ids.add(context.request.id);
    }
  }

  if (ids.size === 0) {
    const page = caido.window.getContext().page as
      | {
          selection?: { kind: string; main: string; secondary: string[] };
          requestSelection?: { kind: string; main: string; secondary: string[] };
        }
      | undefined;

    const selection = page?.selection ?? page?.requestSelection;
    if (selection?.kind === "Selected") {
      ids.add(selection.main);
      selection.secondary.forEach((id) => ids.add(id));
    }
  }

  return Array.from(ids);
}

export const init = (caido: Caido<BackendEndpoints>) => {
  const dashboard = createDashboard(caido);
  
  caido.navigation.addPage(SIDEBAR_PATH, {
    body: dashboard.element,
    onEnter: dashboard.onEnter,
  });

  caido.commands.register(COMMAND_ID, {
    name: "Anomaly Ranker: Rank Selection",
    run: async (context: CommandContext) => {
      const requestIds = collectRequestIds(caido, context);

      caido.navigation.goTo(SIDEBAR_PATH);

      if (requestIds.length === 0) {
        caido.window.showToast("Select requests in HTTP History to rank.", {
          variant: "info",
          duration: 3000,
        });
        caido.log.warn("AnomalyRanker: No requests selected.");
        return;
      }

      try {
        await dashboard.rankRequests(requestIds);
      } catch (error) {
        caido.log.error("AnomalyRanker: Failed to rank selection", error);
      }
    },
  });

  caido.sidebar.registerItem("Anomaly Rank", SIDEBAR_PATH, {
    icon: "fas fa-chart-line",
    group: "Plugins",
  });

  // Register command to open Anomaly Ranker UI
  const OPEN_UI_COMMAND = "anomaly-ranker.openUI";
  caido.commands.register(OPEN_UI_COMMAND, {
    name: "Anomaly Ranker: Open Dashboard",
    run: () => {
      caido.navigation.goTo(SIDEBAR_PATH);
    },
  });
  caido.commandPalette.register(OPEN_UI_COMMAND);

  caido.menu.registerItem({ type: "RequestRow", commandId: COMMAND_ID });
  caido.menu.registerItem({ type: "Request", commandId: COMMAND_ID });
  caido.menu.registerItem({ type: "Response", commandId: COMMAND_ID });

  // Register in command palette for quick access via Ctrl+K / Cmd+K
  caido.commandPalette.register(COMMAND_ID);

  // Register keyboard shortcut: Ctrl+Shift+R (or Cmd+Shift+R on macOS)
  caido.shortcuts.register(COMMAND_ID, ["Control", "Shift", "r"]);

  caido.log.info("Anomaly Ranker frontend loaded.");
};
