// SSR rendering. Preact renderToString against the island components, wrapped in the
// base.html shell. The output is a complete HTML document whose islands are marked with
// `data-md-component` so the runtime can hydrate + hot-swap them.

import type { Config, PageMeta } from "../config/index.ts";
import type { MarkdownResult } from "../markdown/index.ts";
import type { Nav, NavNode, Toc } from "../nav/index.ts";

export interface RenderContext {
  config: Config;
  page: { url: string; title: string; meta: PageMeta; canonical_url?: string };
  content: MarkdownResult;
  nav: Nav;
  toc: Toc;
  prev?: { title: string; url: string };
  next?: { title: string; url: string };
  base_url: string;
  generator: string;
  /** URL of the runtime entry script. Dev: /@vizen/entry (Vite alias). Build: /assets/javascripts/bundle.js. */
  entryUrl: string;
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

    ${island("header", { siteName: config.site_name, pageTopic: page.meta.title ?? page.title, features, searchEnabled: !!config.plugins?.search })}
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
      <div data-md-component="footer">${island("footer", { siteName: config.site_name, prev: ctx.prev, next: ctx.next })}</div>
    </div>

    <script id="__config" type="application/json">${JSON.stringify({ base: ctx.base_url, features })}</script>
    <script type="module" src="${ctx.entryUrl}"></script>
  </body>
</html>`;
}

export async function renderSite(_ctx: { config: Config }): Promise<Map<string, string>> {
  // Placeholder — full site build is wired in server/build.
  return new Map();
}

/** SSR an island: render the Preact component to string, then inject the serialized
 *  props as a <script data-md-props> INSIDE the island's root element (before its closing
 *  tag). Putting it inside — not as a sibling — means the runtime's readProps(host) finds
 *  it regardless of which element carries data-md-component, and client-nav's serialize
 *  diff strips it consistently. */
function island(name: string, props: unknown): string {
  const node = renderIsland(name, props);
  // <script> is a raw-text element: the browser does NOT decode HTML entities inside it,
  // so we must NOT esc() the JSON (esc would turn " into &quot; and break JSON.parse).
  // We only neutralize the one sequence that could break out of the script: </script>.
  const json = JSON.stringify(props).replace(/<\/script/gi, "<\\/script");
  const propsJson = `<script type="application/json" data-md-props>${json}</script>`;
  // If the renderer returned a single root element `<tag ...>...</tag>`, inject the props
  // script just before its closing tag. Otherwise (multiple top-level nodes, e.g. raw
  // markdown HTML) append at the end — the host wrapper still contains it.
  const single = node.match(/^(\s*<[\w-]+[^>]*>)([\s\S]*)(<\/[\w-]+>\s*)$/);
  if (single) return `${single[1]}${single[2]}${propsJson}${single[3]}`;
  return `${node}${propsJson}`;
}

// Minimal island renderers — replaced by real @vizen/ui components once ported.
function renderIsland(name: string, props: unknown): string {
  const p = props as Record<string, unknown>;
  switch (name) {
    case "header": return renderHeader(p);
    case "footer": return renderFooter(p);
    case "content": return `${p.html ?? ""}`;
    case "nav": return renderNav(p.nav as Nav, p.page as string);
    case "toc": return renderToc(p.toc as Toc);
    default: return "";
  }
}

// Inline material SVG icons (avoids a network round-trip per icon in dev). The set grows
// as partials are ported; each is the raw <svg> from @mdi/svg.
const ICONS: Record<string, string> = {
  "material/menu": `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24"><path d="M3 6h18v2H3zm0 5h18v2H3zm0 5h18v2H3z"/></svg>`,
  "material/magnify": `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24"><path d="M9.5 3A6.5 6.5 0 0 1 16 9.5c0 1.61-.59 3.09-1.56 4.23l.27.27h.79l5 5-1.5 1.5-5-5v-.79l-.27-.27A6.5 6.5 0 0 1 9.5 16 6.5 6.5 0 0 1 3 9.5 6.5 6.5 0 0 1 9.5 3m0 2A4.5 4.5 0 0 0 5 9.5 4.5 4.5 0 0 0 9.5 14 4.5 4.5 0 0 0 14 9.5 4.5 4.5 0 0 0 9.5 5z"/></svg>`,
  "material/theme-light-dark": `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24"><path d="M7.5 2c-.276 0-.5.224-.5.5v2c0 .276.224.5.5.5s.5-.224.5-.5v-2c0-.276-.224-.5-.5-.5zm9 0c-.276 0-.5.224-.5.5v2c0 .276.224.5.5.5s.5-.224.5-.5v-2c0-.276-.224-.5-.5-.5zM4 7v2h2V7H4zm14 0v2h2V7h-2zM3 11c-.553 0-1 .447-1 1v8c0 .553.447 1 1 1h18c.553 0 1-.447 1-1v-8c0-.553-.447-1-1-1H3zm1 2h16v6H4v-6z"/></svg>`,
};

function icon(name: string): string {
  return ICONS[name] ?? "";
}

/** Render the header island — mirrors zensical/ui src/partials/header.html.
 *  Logo + drawer toggle + title (with page topic) + palette toggle + search trigger. */
function renderHeader(p: Record<string, unknown>): string {
  const siteName = String(p.siteName ?? "");
  const pageTopic = String(p.pageTopic ?? "");
  const features = (p.features as string[]) ?? [];
  const searchEnabled = !!p.searchEnabled;
  // Header shadow class: sticky tabs → lifted+shadow; no tabs → shadow; tabs (non-sticky) → none.
  const cls = ["md-header"];
  if (features.includes("navigation.tabs.sticky")) cls.push("md-header--shadow", "md-header--lifted");
  else if (!features.includes("navigation.tabs")) cls.push("md-header--shadow");
  return `<header class="${cls.join(" ")}" data-md-component="header">
  <nav class="md-header__inner md-grid" aria-label="Header">
    <a href="/" title="${esc(siteName)}" class="md-header__button md-logo" aria-label="${esc(siteName)}" data-md-component="logo"></a>
    <label class="md-header__button md-icon" for="__drawer" aria-label="Menu">${icon("material/menu")}</label>
    <div class="md-header__title" data-md-component="header-title">
      <div class="md-header__ellipsis">
        <div class="md-header__topic"><span class="md-ellipsis">${esc(siteName)}</span></div>
        <div class="md-header__topic" data-md-component="header-topic"><span class="md-ellipsis">${esc(pageTopic)}</span></div>
      </div>
    </div>
    ${searchEnabled ? `<label class="md-header__button md-icon" for="__search" aria-label="Search">${icon("material/magnify")}</label>` : ""}
  </nav>
</header>`;
}

/** Render the footer island — prev/next page links + site name. Mirrors
 *  zensical/ui src/partials/footer.html. */
function renderFooter(p: Record<string, unknown>): string {
  const siteName = String(p.siteName ?? "");
  const prev = p.prev as { title: string; url: string } | undefined;
  const next = p.next as { title: string; url: string } | undefined;
  const prevLink = prev ? `<a href="${esc(normalizeNavUrl(prev.url))}" class="md-footer__link md-footer__link--prev" rel="prev"><div class="md-footer__title"><span class="md-footer__direction">Previous</span>${esc(prev.title)}</div></a>` : "";
  const nextLink = next ? `<a href="${esc(normalizeNavUrl(next.url))}" class="md-footer__link md-footer__link--next" rel="next"><div class="md-footer__title"><span class="md-footer__direction">Next</span>${esc(next.title)}</div></a>` : "";
  return `<footer class="md-footer">
  <div class="md-footer-meta md-typeset"><div class="md-footer-meta__inner md-grid">${esc(siteName)}</div></div>
  <div class="md-footer__inner md-grid">${prevLink}${nextLink}</div>
</footer>`;
}

function renderNav(nav: Nav, _page: string): string {
  return `<nav class="md-nav" data-md-component="nav"><ul class="md-nav__list">${nav.map(renderNavItem).join("")}</ul></nav>`;
}

function renderNavItem(n: NavNode): string {
  const activeCls = n.active ? " md-nav__item--active" : "";
  // Section: has children → render head (span if no url, a if url) + nested list.
  if (n.children) {
    const head = n.url
      ? `<a class="md-nav__link${n.active ? " md-nav__link--active" : ""}" href="${esc(normalizeNavUrl(n.url))}">${esc(n.title)}</a>`
      : `<span class="md-nav__link md-nav__link--section${n.active ? " md-nav__link--active" : ""}">${esc(n.title)}</span>`;
    return `<li class="md-nav__item md-nav__item--nested${activeCls}">${head}<ul class="md-nav__list">${n.children.map(renderNavItem).join("")}</ul></li>`;
  }
  return `<li class="md-nav__item${activeCls}"><a class="md-nav__link${n.active ? " md-nav__link--active" : ""}" href="${esc(normalizeNavUrl(n.url ?? ""))}">${esc(n.title)}</a></li>`;
}

/** Normalize a nav url to match mkdocs conventions: empty → "/", directory pages get a trailing slash. */
function normalizeNavUrl(url: string): string {
  if (url === "") return "/";
  // Leave absolute urls, fragments, and files with an extension (e.g. "foo.pdf") alone.
  if (url.startsWith("/") || url.startsWith("#") || /\.[^/]*$/.test(url)) return url;
  return url.endsWith("/") ? url : `${url}/`;
}

function renderToc(toc: Toc): string {
  const items = toc.map((t) => `<li class="md-nav__item--level-${t.level}"><a href="#${esc(t.slug)}">${esc(t.text)}</a>${t.children ? `<ul>${renderToc(t.children)}</ul>` : ""}</li>`).join("");
  return `<nav class="md-nav md-nav--secondary"><ul>${items}</ul></nav>`;
}

function esc(s: string): string {
  return s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");
}
