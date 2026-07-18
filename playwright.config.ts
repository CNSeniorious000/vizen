import { defineConfig } from "@playwright/test";

export default defineConfig({
  testDir: "./e2e",
  fullyParallel: false, // dev server is shared; serialize
  retries: 0,
  use: {
    browserName: "chromium",
    headless: true,
    baseURL: "http://localhost:5183",
  },
  webServer: {
    command: "bun packages/core/src/cli/index.ts serve example --port 5183",
    port: 5183,
    timeout: 30_000,
    reuseExistingServer: true,
  },
});
