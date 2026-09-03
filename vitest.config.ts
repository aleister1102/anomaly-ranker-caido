import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    include: ["src/**/test/**/*.test.ts"],
  },
  resolve: {
    extensionAlias: {
      ".js": [".ts", ".js"],
    },
  },
});
