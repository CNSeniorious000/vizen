// Dev server + build server.
//
// Dev: Vite middleware serves the client runtime + HMR; we layer an SSR middleware in
// front that renders the requested page's HTML on every request (so content edits show
// up without a rebuild). Vite's HMR handles component-level hot updates; our runtime's
// HMR client receives them and re-renders only the touched island.
//
// Build: walk the docs_dir, render every page to HTML, emit to site_dir. Vite builds the
// client runtime bundle (runtime + ui) into site_dir/assets.

import { createServer as createViteServer, type ViteDevServer, type InlineConfig } from "vite";
import { createServer as createHttpServer } from "node:http";
import { loadConfig, type Config } from "../config/index.ts";
import { renderMarkdown } from "../markdown/index.ts";
import { buildNav, buildToc, prevNext } from "../nav/index.ts";
import { renderPage, type RenderContext } from "../render/index.ts";
import { collectPages } from "./collect.ts";
import { join } from "node:path";
import { stat, mkdir, writeFile, readFile } from "node:fs/promises";

export interface ServerOptions {
  root: string;
  port?: number;
  configPath?: string;
}

export async function createDevServer(opts: ServerOptions): Promise<ViteDevServer> {
  const configPath = opts.configPath ?? await findConfig(opts.root);
  const config = await loadConfig(configPath);
  const docsDir = join(opts.root, config.docs_dir);

  const vite = await createViteServer({
    root: opts.root,
    configFile: join(process.cwd(), "vite.config.ts"),
    server: { middlewareMode: true },
    appType: "custom",
  } satisfies InlineConfig);

  // SSR middleware: render the requested page, let Vite transform the HTML so the runtime
  // + HMR client get injected.
  vite.middlewares.use(async (req, res, next) => {
    const url = (req.url ?? "/").split("?")[0];
    if (url.startsWith("/@") || url.startsWith("/assets/") || url.startsWith("/node_modules/")) return next();
    const mdPath = urlToMdPath(url, docsDir);
    if (!mdPath) return next();
    try {
      const ctx = await renderPageFromMd(config, docsDir, mdPath, url);
      const html = await renderPage(ctx);
      const transformed = await vite.transformIndexHtml(url, html);
      res.setHeader("content-type", "text/html");
      res.end(transformed);
    } catch (err) {
      vite.ssrFixStacktrace(err as Error);
      res.statusCode = 500;
      res.end(String(err));
    }
  });

  // middlewareMode doesn't listen on its own — wrap Vite's middlewares in an http server.
  const port = opts.port ?? 5183;
  const http = createHttpServer(vite.middlewares);
  await new Promise<void>((resolve) => http.listen(port, resolve));
  // Expose the http server so the CLI can report the bound port + close it.
  (vite as ViteDevServer & { httpServer: typeof http }).httpServer = http;
  return vite;
}

export async function createBuildServer(opts: ServerOptions): Promise<void> {
  const configPath = opts.configPath ?? await findConfig(opts.root);
  const config = await loadConfig(configPath);
  const docsDir = join(opts.root, config.docs_dir);
  const siteDir = join(opts.root, config.site_dir ?? "site");
  const pages = await collectPages(docsDir);

  await mkdir(siteDir, { recursive: true });
  for (const page of pages) {
    const ctx = await renderPageFromMd(config, docsDir, page.path, page.url);
    const html = await renderPage(ctx);
    const outPath = join(siteDir, page.url, "index.html");
    await mkdir(join(siteDir, page.url), { recursive: true });
    await writeFile(outPath, html);
  }
}

// --- helpers --------------------------------------------------------------

async function renderPageFromMd(config: Config, docsDir: string, mdPath: string, url: string): Promise<RenderContext> {
  const src = await readFile(join(docsDir, mdPath), "utf8");
  const content = await renderMarkdown(src, { extensions: config.markdown_extensions, base: url });
  const pages = await collectPages(docsDir);
  const nav = buildNav(config, pages, url);
  const toc = buildToc(content.toc, config.theme.features ?? []);
  const { prev, next } = prevNext(buildNav(config, pages), url);
  return {
    config,
    page: { url, title: content.title ?? basename(mdPath), meta: content.meta as never, canonical_url: undefined },
    content,
    nav,
    toc,
    prev: prev && prev.url ? { title: prev.title, url: prev.url } : undefined,
    next: next && next.url ? { title: next.title, url: next.url } : undefined,
    base_url: "/",
    generator: "vizen",
  };
}

function urlToMdPath(url: string, _docsDir: string): string | null {
  const clean = url.replace(/^\/+|\/+$/g, "");
  if (!clean) return "index.md";
  return `${clean}/index.md`.replace(/^index\.md$/, "index.md");
}

async function findConfig(root: string): Promise<string> {
  // vizen.toml is the preferred native format; fall back to mkdocs.yml for
  // drop-in compatibility with existing Material for MkDocs projects.
  for (const name of ["vizen.toml", "mkdocs.yml", "mkdocs.yaml", "vizen.yml"]) {
    try {
      await stat(join(root, name));
      return join(root, name);
    } catch { /* try next */ }
  }
  return join(root, "vizen.toml");
}

function basename(p: string): string {
  return p.split("/").pop()!.replace(/\.md$/, "");
}
