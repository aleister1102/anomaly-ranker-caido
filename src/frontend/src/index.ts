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
    name: "Anomaly Ranker: Rank Selection",
    run: async (context: CommandContext) => {
      const requestIds = collectRequestIds(context);

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

  caido.commandPalette.register(COMMAND_ID);

  caido.shortcuts.register(COMMAND_ID, ["Control", "Shift", "r"]);

  caido.log.info("Anomaly Ranker frontend loaded.");
};
