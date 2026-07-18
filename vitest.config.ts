import { defineConfig } from "vitest/config";
import { resolve } from "node:path";

export default defineConfig({
  resolve: {
    alias: {
      "@zensical/core": resolve(__dirname, "packages/core/src/index.ts"),
      "@zensical/runtime": resolve(__dirname, "packages/runtime/src/index.ts"),
      "@zensical/ui": resolve(__dirname, "packages/ui/src/index.ts"),
    },
  },
  test: {
    environment: "jsdom",
    include: ["packages/**/*.test.ts", "packages/**/*.test.tsx"],
    setupFiles: ["./tests/setup.ts"],
  },
});
