// SSR rendering. Preact renderToString against the island components, wrapped in the
// base.html shell. The output is a complete HTML document whose islands are marked with
// `data-md-component` so the runtime can hydrate + hot-swap them.

import type { Config, PageMeta } from "../config/index.ts";
import type { MarkdownResult } from "../markdown/index.ts";
import type { Nav, Toc } from "../nav/index.ts";

export interface RenderContext {
  config: Config;
  page: { url: string; title: string; meta: PageMeta; canonical_url?: string };
  content: MarkdownResult;
  nav: Nav;
  toc: Toc;
  base_url: string;
  generator: string;
}

export async function renderPage(ctx: RenderContext): Promise<string> {
  const { config, page, content } = ctx;
  const title = page.meta.title ?? page.title ?? config.site_name;
  const features = config.theme.features ?? [];

  // The shell is a string template (mirrors zensical/ui base.html) with islands injected.
  // Islands are SSR'd Preact subtrees wrapped in their `data-md-component` host.
  return `<!doctype html>
<html lang="en" class="no-js">
  <head>
    <meta charset="utf-8" />
    <meta name="viewport" content="width=device-width,initial-scale=1" />
    ${page.meta.description ? `<meta name="description" content="${esc(page.meta.description)}" />` : ""}
    <title>${esc(title)} - ${esc(config.site_name)}</title>
    <link rel="stylesheet" href="/assets/stylesheets/main.css" />
    ${(config.extra_css ?? []).map((c) => `<link rel="stylesheet" href="${esc(c)}" />`).join("\n    ")}
  </head>
  <body data-md-color-scheme="default" data-md-color-primary="indigo" data-md-color-accent="indigo">
    <input class="md-toggle" data-md-toggle="drawer" type="checkbox" id="__drawer" autocomplete="off" />
    <input class="md-toggle" data-md-toggle="search" type="checkbox" id="__search" autocomplete="off" />
    <label class="md-overlay" for="__drawer" aria-label="nav"></label>

    <div data-md-component="header">${island("header", { title: config.site_name })}</div>
    <div class="md-container" data-md-component="container">
      <main class="md-main" data-md-component="main">
        <div class="md-main__inner md-grid">
          ${features.includes("navigation.hide") ? "" : `<div class="md-sidebar md-sidebar--primary" data-md-component="sidebar" data-md-type="navigation"><div class="md-sidebar__scrollwrap"><div class="md-sidebar__inner">${island("nav", { nav: ctx.nav, page: page.url })}</div></div></div>`}
          ${features.includes("toc.integrate") ? "" : `<div class="md-sidebar md-sidebar--secondary" data-md-component="sidebar" data-md-type="toc"><div class="md-sidebar__scrollwrap"><div class="md-sidebar__inner">${island("toc", { toc: ctx.toc })}</div></div></div>`}
          <div class="md-content" data-md-component="content">
            <article class="md-content__inner md-typeset">
              ${island("content", { html: content.html, title })}
            </article>
          </div>
        </div>
      </main>
      <div data-md-component="footer">${island("footer", { site_name: config.site_name })}</div>
    </div>

    <script id="__config" type="application/json">${JSON.stringify({ base: ctx.base_url, features })}</script>
    <script type="module" src="/@zensical/entry"></script>
  </body>
</html>`;
}

export async function renderSite(_ctx: { config: Config }): Promise<Map<string, string>> {
  // Placeholder — full site build is wired in server/build.
  return new Map();
}

/** SSR an island: render the Preact component to string, wrap in its host with serialized
 *  props so the runtime can hydrate without re-fetching. */
function island(name: string, props: unknown): string {
  const node = renderIsland(name, props);
  const propsJson = `<script type="application/json" data-md-props>${esc(JSON.stringify(props))}</script>`;
  return `${node}${propsJson}`;
}

// Minimal island renderers — replaced by real @zensical/ui components once ported.
function renderIsland(name: string, props: unknown): string {
  const p = props as Record<string, unknown>;
  switch (name) {
    case "header": return `<header class="md-header"><div class="md-header__title">${esc(String(p.title ?? ""))}</div></header>`;
    case "footer": return `<footer class="md-footer"><div class="md-footer__title">${esc(String(p.site_name ?? ""))}</div></footer>`;
    case "content": return `${p.html ?? ""}`;
    case "nav": return renderNav(p.nav as Nav, p.page as string);
    case "toc": return renderToc(p.toc as Toc);
    default: return "";
  }
}

function renderNav(nav: Nav, _page: string): string {
  const items = nav.map((n) => `<li><a href="${esc(n.url ?? "#")}">${esc(n.title)}</a>${n.children ? `<ul>${renderNav(n.children, _page)}</ul>` : ""}</li>`).join("");
  return `<nav class="md-nav"><ul>${items}</ul></nav>`;
}

function renderToc(toc: Toc): string {
  const items = toc.map((t) => `<li class="md-nav__item--level-${t.level}"><a href="#${esc(t.slug)}">${esc(t.text)}</a>${t.children ? `<ul>${renderToc(t.children)}</ul>` : ""}</li>`).join("");
  return `<nav class="md-nav md-nav--secondary"><ul>${items}</ul></nav>`;
}

function esc(s: string): string {
  return s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");
}
