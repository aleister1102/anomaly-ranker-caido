import { defineConfig } from "@caido-community/dev";

export default defineConfig({
  id: "anomaly-ranker",
  name: "Anomaly Ranker",
  description: "Calculate anomaly ranks using statistical outlier detection and SimHash similarity.",
  version: "1.0.4",
  author: {
    name: "insomnia1102",
    email: "marucube35@gmail.com",
    url: "https://github.com/aleister1102/anomaly-ranker-caido",
  },
  plugins: [
    {
      kind: "frontend",
      id: "anomaly-ranker-frontend",
      name: "Anomaly Ranker Frontend",
      root: "./src/frontend",
      backend: {
        id: "anomaly-ranker-backend",
      },
    },
    {
      kind: "backend",
      id: "anomaly-ranker-backend",
      name: "Anomaly Ranker Backend",
      root: "./src/backend",
    },
  ],
});
