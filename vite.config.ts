import { defineConfig, type Plugin } from "vite";
import preact from "@preact/preset-vite";
import { resolve } from "node:path";
import { readFile } from "node:fs/promises";
import { compileString } from "sass";

// Dev server config for zensical-vite itself (used when running `zensical serve` on a
// docs project). The SSG's dev server (packages/core/src/server) creates a Vite server
// in middleware mode and layers its SSR middleware in front; this file provides the
// shared plugin + alias config.

/** Compile the ported zensical/ui SCSS on demand so the SSR HTML's
 *  `<link href="/assets/stylesheets/main.css">` resolves in dev. We intercept the request
 *  in configureServer (not load) because Vite's CSS pipeline wraps .css load output into a
 *  JS module for HMR — a <link> tag needs raw text/css, which the middleware serves. */
function scssDevPlugin(): Plugin {
  const routes: Record<string, string> = {
    "/assets/stylesheets/main.css": resolve(__dirname, "packages/ui/src/styles/main.scss"),
    "/assets/stylesheets/palette.css": resolve(__dirname, "packages/ui/src/styles/palette.scss"),
  };
  return {
    name: "zensical-scss-dev",
    enforce: "pre",
    configureServer(server) {
      server.middlewares.use(async (req, res, next) => {
        const url = (req.url ?? "").split("?")[0];
        const file = routes[url];
        if (!file) return next();
        try {
          const src = await readFile(file, "utf8");
          const result = compileString(src, {
            loadPaths: [
              resolve(__dirname, "node_modules/material-design-color"),
              resolve(__dirname, "node_modules/material-shadows"),
              resolve(file, ".."),
            ],
            silenceDeprecations: ["legacy-js-api", "import", "global-builtin", "color-functions"],
            quietDeps: true,
          });
          res.setHeader("content-type", "text/css; charset=utf-8");
          res.end(result.css);
        } catch (err) {
          next(err);
        }
      });
    },
  };
}

export default defineConfig({
  plugins: [preact(), scssDevPlugin()],
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
      scss: {
        silenceDeprecations: ["legacy-js-api", "import"],
        includePaths: [
          resolve(__dirname, "node_modules/material-design-color"),
          resolve(__dirname, "node_modules/material-shadows"),
        ],
      },
    },
  },
  server: {
    port: 5183,
    strictPort: false,
  },
});
