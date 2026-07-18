// @zensical/core — the SSG. TS port of zensical (Rust) + mkdocs-material (Python).
// Config → markdown → nav/toc → SSR (Preact renderToString) → build/serve/watch.

export { loadConfig, type Config, type NavItem, type PageMeta } from "./config/index.ts";
export { renderMarkdown, type MarkdownOptions } from "./markdown/index.ts";
export { buildNav, buildToc, type Nav } from "./nav/index.ts";
export type { TocItem } from "./markdown/index.ts";
export { renderPage, renderSite, type RenderContext } from "./render/index.ts";
export { createDevServer, createBuildServer } from "./server/index.ts";
export { runCli } from "./cli/index.ts";
