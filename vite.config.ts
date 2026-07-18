import { defineConfig } from "vite";
import preact from "@preact/preset-vite";
import { resolve } from "node:path";

// Dev server config for zensical-vite itself (used when running `zensical serve` on a
// docs project). The SSG's dev server (packages/core/src/server) creates a Vite server
// in middleware mode and layers its SSR middleware in front; this file provides the
// shared plugin + alias config.
export default defineConfig({
  plugins: [preact()],
  resolve: {
    alias: {
      "@zensical/core": resolve(__dirname, "packages/core/src/index.ts"),
      "@zensical/runtime": resolve(__dirname, "packages/runtime/src/index.ts"),
      "@zensical/ui": resolve(__dirname, "packages/ui/src/index.ts"),
      // The dev server's HTML references this; resolve it to the browser entry.
      "/@zensical/entry": resolve(__dirname, "packages/runtime/src/main.ts"),
      // Let the runtime import preact from the same copy the dev server bundles.
      react: "preact/compat",
      "react-dom": "preact/compat",
    },
  },
  css: {
    preprocessorOptions: {
      scss: { silenceDeprecations: ["legacy-js-api", "import"] },
    },
  },
  server: {
    port: 5183,
    strictPort: false,
  },
});
