import { defineConfig } from "@playwright/test";

export default defineConfig({
  testDir: "./e2e",
  fullyParallel: false,
  workers: 1, // HMR test mutates main.ts; serialize so it doesn't pollute client-nav
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
