import { defineConfig } from "vitest/config";
import { resolve } from "node:path";

export default defineConfig({
  resolve: {
    alias: {
      "@vizen/core": resolve(__dirname, "packages/core/src/index.ts"),
      "@vizen/runtime": resolve(__dirname, "packages/runtime/src/index.ts"),
      "@vizen/ui": resolve(__dirname, "packages/ui/src/index.ts"),
    },
  },
  test: {
    environment: "jsdom",
    include: ["packages/**/*.test.ts", "packages/**/*.test.tsx"],
    setupFiles: ["./tests/setup.ts"],
  },
});
