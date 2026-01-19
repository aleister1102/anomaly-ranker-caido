import type { Caido, CommandContext } from "@caido/sdk-frontend";
import { BackendEndpoints } from "../../shared/types.js";
import { createDashboard } from "./components/Dashboard.js";

const COMMAND_ID = "anomaly-ranker.rankSelection";
const SIDEBAR_PATH = "/anomaly-ranker";

function collectRequestIds(context: CommandContext): string[] {
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

  return Array.from(ids);
}

export const init = (caido: Caido<BackendEndpoints>) => {
  const dashboard = createDashboard(caido);
  
  caido.navigation.addPage(SIDEBAR_PATH, {
    body: dashboard.element,
    onEnter: dashboard.onEnter,
  });

  caido.commands.register(COMMAND_ID, {
    name: "Apply Anomaly Rank",
    run: async (context: CommandContext) => {
      const requestIds = collectRequestIds(context);

      if (requestIds.length === 0) {
        caido.log.warn("AnomalyRanker: No requests selected.");
        return;
      }

      try {
        caido.navigation.goTo(SIDEBAR_PATH);
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

  caido.log.info("Anomaly Ranker frontend loaded.");
};
