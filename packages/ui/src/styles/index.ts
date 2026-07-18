// @zensical/ui — SCSS styles entry (ported from zensical/ui `modern` stylesheet).
//
// This module exists to document the Sass/Vite configuration required to compile
// the SCSS in `./`. The actual style entry is `./index.scss` (re-exports
// `./main.scss` + `./palette.scss`), which is what `package.json`'s
// `"./styles"` export points at.
//
// Why this file exists
// --------------------
// The upstream SCSS uses bare `@import "material-color"` / `@import "material-shadows"`
// (resolved via Sass `loadPaths`) and `svg-load("lucide/<icon>.svg")` (resolved
// via `postcss-inline-svg`). Neither works out-of-the-box with Vite's default
// Sass config — you must configure `includePaths`/`loadPaths` and add a PostCSS
// plugin. This file captures the required config so consumers can copy it.
//
// Required Vite config (vite.config.ts)
// --------------------------------------
//   css: {
//     preprocessorOptions: {
//       scss: {
//         silenceDeprecations: ["legacy-js-api", "import"],
//         // Vite forwards these to sass. The legacy API calls this `includePaths`;
//         // the modern API calls it `loadPaths`. Vite accepts either key depending
//         // on the sass version + API mode. Use `includePaths` for broad compat:
//         includePaths: [
//           "node_modules/material-design-color",
//           "node_modules/material-shadows",
//         ],
//       },
//     },
//   },
//
// Required PostCSS config (for `svg-load()` resolution)
// -----------------------------------------------------
//   // postcss.config.js — install `postcss-inline-svg` + `lucide-static`
//   export default {
//     plugins: {
//       "postcss-inline-svg": {
//         paths: ["node_modules/lucide-static/icons"],
//         encode: false,
//       },
//       // Upstream also uses these (optional, for logical-property + :is() support):
//       //   "postcss-logical": {},
//       //   "postcss-dir-pseudo-class": {},
//       //   "postcss-pseudo-is": {},
//       //   autoprefixer: {},
//     },
//   };
//
// Required devDependencies (already in package.json)
// --------------------------------------------------
//   - material-design-color@^2.3.2  → provides `$clr-*` color variables
//   - material-shadows@^3.0.1        → provides `$md-shadow-*` / `z-depth-*` mixins
//
// Optional devDependencies (for `svg-load` icon resolution)
// --------------------------------------------------------
//   - lucide-static@^1.21.0          → SVG icons referenced by `svg-load("lucide/...")`
//   - postcss-inline-svg@^6.0.0      → resolves `svg-load()` at PostCSS time
//
// If you skip postcss-inline-svg, the `svg-load(...)` calls will pass through
// verbatim into the CSS output and the browser will ignore those properties
// (icons won't render, but layout is unaffected).

export const STYLES_ENTRY = "./index.scss";

export const SASS_INCLUDE_PATHS = [
  "node_modules/material-design-color",
  "node_modules/material-shadows",
] as const;

export const POSTCSS_INLINE_SVG_PATHS = ["node_modules/lucide-static/icons"] as const;
