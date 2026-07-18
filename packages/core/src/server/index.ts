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
import { loadConfig, type Config } from "../config/index.ts";
import { renderMarkdown } from "../markdown/index.ts";
import { buildNav, buildToc, type PageRef } from "../nav/index.ts";
import { renderPage, type RenderContext } from "../render/index.ts";
import { join, relative, sep } from "node:path";
import { readdir, stat, mkdir, writeFile } from "node:fs/promises";

export interface ServerOptions {
  root: string;
  port?: number;
  configPath?: string;
}

export async function createDevServer(opts: ServerOptions): Promise<ViteDevServer> {
  const configPath = opts.configPath ?? findConfig(opts.root);
  const config = await loadConfig(configPath);
  const docsDir = join(opts.root, config.docs_dir);

  const vite = await createViteServer({
    root: opts.root,
    server: { middlewareMode: true, port: opts.port ?? 5183 },
    appType: "custom",
    optimizeDeps: { include: ["preact"] },
  } satisfies InlineConfig);

  // SSR middleware: render the requested page, let Vite transform the HTML so the runtime
  // + HMR client get injected.
  vite.middlewares.use(async (req, res, next) => {
    const url = (req.url ?? "/").split("?")[0];
    if (url.startsWith("/@") || url.startsWith("/assets/") || url.startsWith("/node_modules/")) return next();
    const mdPath = urlToMdPath(url, docsDir);
    if (!mdPath) return next();
    const ctx = await renderPageFromMd(config, docsDir, mdPath, url);
    const html = await renderPage(ctx);
    const transformed = await vite.transformIndexHtml(url, html);
    res.setHeader("content-type", "text/html");
    res.end(transformed);
  });

  return vite;
}

export async function createBuildServer(opts: ServerOptions): Promise<void> {
  const configPath = opts.configPath ?? findConfig(opts.root);
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
  const src = await Bun.file(join(docsDir, mdPath)).text();
  const content = await renderMarkdown(src, { extensions: config.markdown_extensions, base: url });
  const pages = await collectPages(docsDir);
  const nav = buildNav(config, pages);
  const toc = buildToc(content.toc, config.theme.features ?? []);
  return {
    config,
    page: { url, title: content.title ?? basename(mdPath), meta: content.meta as never, canonical_url: undefined },
    content,
    nav,
    toc,
    base_url: "/",
    generator: "zensical-vite",
  };
}

async function collectPages(docsDir: string): Promise<PageRef[]> {
  const out: PageRef[] = [];
  async function walk(dir: string) {
    const entries = await readdir(dir, { withFileTypes: true });
    for (const e of entries) {
      const full = join(dir, e.name);
      if (e.isDirectory()) await walk(full);
      else if (e.name.endsWith(".md")) {
        const rel = relative(docsDir, full).split(sep).join("/");
        const url = rel.replace(/(index)?\.md$/, "") || "";
        const src = await Bun.file(full).text();
        const title = src.match(/^#\s+(.+)$/m)?.[1] ?? rel;
        out.push({ path: rel, url: url || "", title });
      }
    }
  }
  await walk(docsDir);
  return out;
}

function urlToMdPath(url: string, _docsDir: string): string | null {
  const clean = url.replace(/^\/+|\/+$/g, "");
  if (!clean) return "index.md";
  return `${clean}/index.md`.replace(/^index\.md$/, "index.md");
}

function findConfig(root: string): string {
  for (const name of ["zensical.yml", "mkdocs.yml", "mkdocs.yaml"]) {
    try {
      stat(join(root, name));
      return join(root, name);
    } catch { /* try next */ }
  }
  return join(root, "mkdocs.yml");
}

function basename(p: string): string {
  return p.split("/").pop()!.replace(/\.md$/, "");
}
