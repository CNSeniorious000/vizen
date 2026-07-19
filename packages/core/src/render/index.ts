// SSR rendering. Produces a complete HTML document whose structure mirrors
// zensical/ui's base.html + partials (header/nav-item/toc/tabs/footer) so the ported
// SCSS selectors match verbatim. Islands are marked with `data-md-component` so the
// runtime can hydrate + hot-swap them; the props for each island are injected as a
// <script data-md-props> inside its root element.

import type { Config, PageMeta, PaletteConfig } from "../config/index.ts";
import type { MarkdownResult } from "../markdown/index.ts";
import { readSvg } from "../server/scss.ts";
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
  const features = config.theme.features ?? [];
  const title = page.meta.title ?? page.title ?? config.site_name;
  const description = page.meta.description ?? config.site_description;
  const palette = resolvePalette(config.theme.palette);
  const font = config.theme.font ?? { text: "Inter", code: "JetBrains Mono" };
  // Preload any nav-item icons (front-matter `icon`) so renderNavItem can inline them.
  await preloadNavIcons(ctx.nav);

  return `<!doctype html>
<html lang="en" class="no-js">
  <head>
    <meta charset="utf-8" />
    <meta name="viewport" content="width=device-width,initial-scale=1" />
    ${description ? `<meta name="description" content="${esc(description)}" />` : ""}
    ${config.site_author ? `<meta name="author" content="${esc(config.site_author)}" />` : ""}
    ${page.canonical_url ? `<link rel="canonical" href="${esc(page.canonical_url)}" />` : ""}
    ${ctx.prev ? `<link rel="prev" href="${esc(normalizeUrl(ctx.prev.url))}" />` : ""}
    ${ctx.next ? `<link rel="next" href="${esc(normalizeUrl(ctx.next.url))}" />` : ""}
    <link rel="icon" href="${esc(normalizeUrl(config.theme.favicon ?? "assets/images/favicon.png"))}" />
    <meta name="generator" content="${esc(ctx.generator)}" />
    <title>${esc(title)} - ${esc(config.site_name)}</title>
    <link rel="stylesheet" href="${esc(normalizeUrl("assets/stylesheets/main.css"))}" />
    ${palette ? `<link rel="stylesheet" href="${esc(normalizeUrl("assets/stylesheets/palette.css"))}" />` : ""}
    ${font ? fontLinks(font) : ""}
    ${(config.extra_css ?? []).map((c) => `<link rel="stylesheet" href="${esc(normalizeUrl(c))}" />`).join("\n    ")}
    ${mdScopeScript(ctx.base_url)}
  </head>
  ${bodyAttrs(palette)}
    <input class="md-toggle" data-md-toggle="drawer" type="checkbox" id="__drawer" autocomplete="off" />
    <input class="md-toggle" data-md-toggle="search" type="checkbox" id="__search" autocomplete="off" />
    <label class="md-overlay" for="__drawer" aria-label="nav"></label>
    <div data-md-component="skip">${skipLink(ctx.toc)}</div>
    <div data-md-component="announce"></div>

    ${island("header", { siteName: config.site_name, pageTopic: page.meta.title ?? page.title, features, searchEnabled: searchEnabled(config), repoUrl: config.repo_url, repoName: config.repo_name ?? config.site_name })}
    ${features.includes("navigation.tabs") && !features.includes("navigation.tabs.sticky") ? island("tabs", { nav: ctx.nav }) : ""}
    <div class="md-container" data-md-component="container">
      <main class="md-main" data-md-component="main">
        <div class="md-main__inner md-grid">
          ${features.includes("navigation.hide") ? "" : `<div class="md-sidebar md-sidebar--primary" data-md-component="sidebar" data-md-type="navigation"><div class="md-sidebar__scrollwrap"><div class="md-sidebar__inner">${renderNav(ctx.nav, config.site_name, features, ctx.toc)}</div></div></div>`}
          ${features.includes("toc.integrate") ? "" : tocSidebar(ctx.toc)}
          <div class="md-content" data-md-component="content">
            <article class="md-content__inner md-typeset">
              ${content.html}
            </article>
          </div>
        </div>
      </main>
      ${island("footer", { siteName: config.site_name, prev: ctx.prev, next: ctx.next, features })}
    </div>
    <div class="md-dialog" data-md-component="dialog"><div class="md-dialog__inner md-typeset"></div></div>

    <script id="__config" type="application/json">${configJson(ctx)}</script>
    <script type="module" src="${ctx.entryUrl}"></script>
  </body>
</html>`;
}

export async function renderSite(_ctx: { config: Config }): Promise<Map<string, string>> {
  // Placeholder — full site build is wired in server/build.
  return new Map();
}

/** Each island's host element tag. The host carries `data-md-component="name"` so the
 *  runtime can find it; the renderer returns ONLY the inner content (no host tag), so
 *  Preact's hydrate matches the host's children rather than nesting a duplicate host. */
const ISLAND_HOST_TAG: Record<string, string> = {
  header: "header", tabs: "nav", footer: "footer",
};

/** The host element's class — may depend on props (e.g. header shadow class varies with
 *  features). Kept here so the SSR host and the runtime renderer agree on it. */
function hostClass(name: string, props: unknown): string {
  const p = props as Record<string, unknown>;
  const features = (p.features as string[]) ?? [];
  switch (name) {
    case "header": {
      const cls = ["md-header"];
      if (features.includes("navigation.tabs.sticky")) cls.push("md-header--shadow", "md-header--lifted");
      else if (!features.includes("navigation.tabs")) cls.push("md-header--shadow");
      return cls.join(" ");
    }
    case "tabs": return "md-tabs";
    case "footer": return "md-footer";
    default: return "";
  }
}

/** SSR an island: wrap the renderer's inner content in the host element (which carries
 *  data-md-component), and inject the serialized props as a <script data-md-props> inside
 *  the host. The props script lives inside the host so the runtime's readProps(host) finds
 *  it, and client-nav's serialize diff strips it consistently. */
function island(name: string, props: unknown): string {
  const inner = renderIsland(name, props);
  // <script> is a raw-text element: the browser does NOT decode HTML entities inside it,
  // so we must NOT esc() the JSON (esc would turn " into &quot; and break JSON.parse).
  // We only neutralize the one sequence that could break out of the script: </script>.
  const json = JSON.stringify(props).replace(/<\/script/gi, "<\\/script");
  const propsJson = `<script type="application/json" data-md-props>${json}</script>`;
  const tag = ISLAND_HOST_TAG[name];
  if (!tag) return inner;
  return `<${tag} class="${hostClass(name, props)}" data-md-component="${name}">${inner}${propsJson}</${tag}>`;
}

// Minimal island renderers — replaced by real @vizen/ui components once ported. Each
// returns the INNER content of its island (no host tag); the host is added by island().
function renderIsland(name: string, props: unknown): string {
  const p = props as Record<string, unknown>;
  switch (name) {
    case "header": return renderHeader(p);
    case "tabs": return renderTabs(p.nav as Nav);
    case "footer": return renderFooter(p);
    default: return "";
  }
}

// Inline material SVG icons (avoids a network round-trip per icon in dev). The set grows
// as partials are ported; each is the raw <svg> from @mdi/svg.
const ICONS: Record<string, string> = {
  "material/menu": `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24"><path d="M3 6h18v2H3zm0 5h18v2H3zm0 5h18v2H3z"/></svg>`,
  "material/magnify": `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24"><path d="M9.5 3A6.5 6.5 0 0 1 16 9.5c0 1.61-.59 3.09-1.56 4.23l.27.27h.79l5 5-1.5 1.5-5-5v-.79l-.27-.27A6.5 6.5 0 0 1 9.5 16 6.5 6.5 0 0 1 3 9.5 6.5 6.5 0 0 1 9.5 3m0 2A4.5 4.5 0 0 0 5 9.5 4.5 4.5 0 0 0 9.5 14 4.5 4.5 0 0 0 14 9.5 4.5 4.5 0 0 0 9.5 5z"/></svg>`,
  "material/arrow-left": `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24"><path d="M20 11v2H8l5.5 5.5-1.42 1.42L4.16 12l7.92-7.92L13.5 5.5 8 11h12z"/></svg>`,
  "material/arrow-right": `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24"><path d="M4 11v2h12l-5.5 5.5 1.42 1.42L19.84 12l-7.92-7.92L10.5 5.5 16 11H4z"/></svg>`,
  "material/library": `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24"><path d="M12 7v14M3 18a1 1 0 0 1-1-1V4a1 1 0 0 1 1-1h5a4 4 0 0 1 4 4 4 4 0 0 1 4-4h5a1 1 0 0 1 1 1v13a1 1 0 0 1-1 1h-6a3 3 0 0 0-3 3 3 3 0 0 0-3-3z"/></svg>`,
  "fontawesome/brands/git-alt": `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 448 512"><path d="M439.55 236.05L244 40.45a28.87 28.87 0 0 0-40.81 0l-40.66 40.63 51.52 51.52c27.06-9.14 52.68 16.77 43.39 43.68l49.66 49.66c34.23-11.8 61.18 31 35.47 56.69-26.49 26.49-70.21-2.87-56-37.34L240.22 199v121.85c25.3 12.54 22.26 41.85 9.08 55a34.34 34.34 0 0 1-48.55 0c-17.57-17.6-11.67-46.91 11.25-56v-123c-20.8-8.51-24.6-30.74-18.64-45L142.57 101 8.45 235.14a28.86 28.86 0 0 0 0 40.81l195.61 195.6a28.86 28.86 0 0 0 40.8 0l194.69-194.69a28.86 28.86 0 0 0 0-40.81z"/></svg>`,
};

function icon(name: string): string {
  return ICONS[name] ?? "";
}

// Nav-item icons: a page's front-matter `icon` (e.g. "lucide/smile") is inlined as SVG
// before the link title, mirroring zensical/ui's nav-item.html. SVGs load async from
// lucide-static, so we preload them once per render and cache by name.
const navIconCache = new Map<string, string>();

/** Walk the nav tree and preload every referenced icon SVG. */
async function preloadNavIcons(nav: Nav): Promise<void> {
  const names = new Set<string>();
  collectNavIcons(nav, names);
  await Promise.all([...names].map(async (name) => {
    if (navIconCache.has(name)) return;
    // readSvg resolves lucide-static/icons/<name>.svg; strip the `lucide/` prefix.
    const file = name.startsWith("lucide/") ? name.slice("lucide/".length) : name;
    const svg = await readSvg(file);
    navIconCache.set(name, svg);
  }));
}

function collectNavIcons(nav: Nav, out: Set<string>): void {
  for (const n of nav) {
    if (n.icon) out.add(n.icon);
    if (n.children) collectNavIcons(n.children, out);
  }
}

/** Return the cached SVG for a nav icon, or "" if unset/missing. */
function navIcon(name: string | undefined): string {
  if (!name) return "";
  return navIconCache.get(name) ?? "";
}

/** Search is on by default (a docs site without search is broken UX). Opt out with
 *  `plugins.search = false`. mkdocs-material treats search as a plugin; we keep the same
 *  config knob but default to enabled. */
function searchEnabled(config: Config): boolean {
  const search = config.plugins?.search;
  return search !== false;
}

/** The search overlay — mirrors mkdocs-material's search dialog. Toggled by the __search
 *  checkbox (the header's magnify label). The runtime wires the input → fetch search.json
 *  → filter → render results into [data-md-component="search-result"]. */
function searchOverlay(): string {
  return `<div class="md-search" data-md-component="search" role="dialog" aria-label="Search">
  <label class="md-search__overlay" for="__search"></label>
  <div class="md-search__inner">
    <form class="md-search__form" onsubmit="return false">
      <label class="md-search__icon md-icon" for="__search" aria-label="Search">${icon("material/magnify")}</label>
      <input type="text" class="md-search__input" name="query" placeholder="Search" autocapitalize="off" autocorrect="off" spellcheck="false" />
    </form>
    <div class="md-search__output">
      <div class="md-search__scrollwrap">
        <div class="md-search-result" data-md-component="search-result"></div>
      </div>
    </div>
  </div>
</div>`;
}

/** Resolve the active palette (first if it's a list of toggleable palettes). */
function resolvePalette(palette: PaletteConfig | PaletteConfig[] | undefined): PaletteConfig | undefined {
  if (!palette) return undefined;
  return Array.isArray(palette) ? palette[0] : palette;
}

function bodyAttrs(palette: PaletteConfig | undefined): string {
  if (!palette) return `<body dir="ltr">`;
  const scheme = (palette.scheme ?? "default").replace(" ", "-");
  const primary = (palette.primary ?? "indigo").replace(" ", "-");
  const accent = (palette.accent ?? "indigo").replace(" ", "-");
  return `<body dir="ltr" data-md-color-scheme="${esc(scheme)}" data-md-color-primary="${esc(primary)}" data-md-color-accent="${esc(accent)}">`;
}

function fontLinks(font: { text?: string; code?: string }): string {
  const text = font.text ?? "Inter";
  const code = font.code ?? "JetBrains Mono";
  const family = `${text.replace(/ /g, "+")}:300,300i,400,400i,500,500i,700,700i%7C${code.replace(/ /g, "+")}:400,400i,700,700i&display=fallback`;
  return `<link rel="preconnect" href="https://fonts.gstatic.com" crossorigin />
    <link rel="stylesheet" href="https://fonts.googleapis.com/css?family=${family}" />
    <style>:root{--md-text-font:"${esc(text)}";--md-code-font:"${esc(code)}"}</style>`;
}

/** The __md_scope/__md_get/__md_set helpers — zensical/ui's base JS. Palette toggle,
 *  consent, and other components read/write localStorage through these. Without them the
 *  palette script (which sets body data-md-color-* from saved prefs) is missing. */
function mdScopeScript(baseUrl: string): string {
  const scope = baseUrl.endsWith("/") ? baseUrl : `${baseUrl}/`;
  return `<script>__md_scope=new URL("${scope}",location),__md_scope.pathname.endsWith("/")||(__md_scope=new URL(__md_scope.pathname+"/",location)),__md_hash=e=>[...e].reduce(((e,t)=>(e<<5)-e+t.charCodeAt(0)),0),__md_get=(e,t=localStorage,_=__md_scope)=>JSON.parse(t.getItem(_.pathname+"."+e)),__md_set=(e,t,_=localStorage,a=__md_scope)=>{try{_.setItem(a.pathname+"."+e,JSON.stringify(t))}catch(e){}},document.documentElement.setAttribute("data-platform",navigator.platform)</script>`;
}

function skipLink(toc: Toc): string {
  const first = toc[0];
  const href = first ? `#${first.slug}` : "#__skip";
  return `<a href="${href}" class="md-skip">Skip to content</a>`;
}

function configJson(ctx: RenderContext): string {
  const cfg = {
    base: ctx.base_url,
    features: ctx.config.theme.features ?? [],
    translations: {
      "clipboard.copy": "Copy to clipboard",
      "clipboard.copied": "Copied to clipboard",
      "search.result.placeholder": "Type to start searching",
      "search.result.none": "No matching documents",
      "search.result.one": "1 matching document",
      "search.result.other": "# matching documents",
      "search.result.more.one": "1 more on this page",
      "search.result.more.other": "# more on this page",
      "search.result.term.missing": "Missing",
      "select.version": "Select version",
    },
  };
  return JSON.stringify(cfg).replace(/<\/script/gi, "<\\/script");
}

/** Render the header island's INNER content — mirrors zensical/ui src/partials/header.html.
 *  Logo + drawer toggle + title (with page topic) + palette toggle + search trigger.
 *  The <header data-md-component="header"> host is added by island(). */
function renderHeader(p: Record<string, unknown>): string {
  const siteName = String(p.siteName ?? "");
  const pageTopic = String(p.pageTopic ?? "");
  const searchEnabled = !!p.searchEnabled;
  const repoUrl = String(p.repoUrl ?? "");
  const repoName = String(p.repoName ?? "");
  const source = repoUrl ? `<div class="md-header__source"><a href="${esc(repoUrl)}" title="Repository" class="md-source" data-md-component="source"><div class="md-source__icon md-icon">${icon("fontawesome/brands/git-alt")}</div><div class="md-source__repository">${esc(repoName)}</div></a></div>` : `<div class="md-header__source"></div>`;
  return `<nav class="md-header__inner md-grid" aria-label="Header">
    <a href="/" title="${esc(siteName)}" class="md-header__button md-logo" aria-label="${esc(siteName)}" data-md-component="logo">${icon("material/library")}</a>
    <label class="md-header__button md-icon" for="__drawer" aria-label="Menu">${icon("material/menu")}</label>
    <div class="md-header__title" data-md-component="header-title">
      <div class="md-header__ellipsis">
        <div class="md-header__topic"><span class="md-ellipsis">${esc(siteName)}</span></div>
        <div class="md-header__topic" data-md-component="header-topic"><span class="md-ellipsis">${esc(pageTopic)}</span></div>
      </div>
    </div>
    ${searchEnabled ? `<label class="md-header__button md-icon" for="__search" aria-label="Search">${icon("material/magnify")}</label>${searchOverlay()}` : ""}
    ${source}
  </nav>`;
}

/** Render the top tabs bar's INNER content — mirrors zensical/ui src/partials/tabs.html +
 *  tabs-item.html. Each top-level nav entry becomes a tab; a section tab links to its
 *  first child. The <nav data-md-component="tabs"> host is added by island(). */
function renderTabs(nav: Nav): string {
  const items = nav.map(renderTabItem).join("");
  return `<div class="md-grid"><ul class="md-tabs__list">${items}</ul></div>`;
}

function renderTabItem(n: NavNode): string {
  const cls = n.active ? "md-tabs__item md-tabs__item--active" : "md-tabs__item";
  // Section: link to the first leaf descendant (zensical prunes to the first child's url).
  const url = n.url ?? firstLeafUrl(n) ?? "/";
  return `<li class="${cls}"><a href="${esc(normalizeUrl(url))}" class="md-tabs__link">${esc(n.title)}</a></li>`;
}

function firstLeafUrl(n: NavNode): string | undefined {
  if (n.url) return n.url;
  if (n.children) for (const c of n.children) { const u = firstLeafUrl(c); if (u) return u; }
  return undefined;
}

/** Render the footer island's INNER content — prev/next page links + copyright. Mirrors
 *  zensical/ui src/partials/footer.html. The <footer data-md-component="footer"> host is
 *  added by island(). */
function renderFooter(p: Record<string, unknown>): string {
  const features = (p.features as string[]) ?? [];
  const prev = p.prev as { title: string; url: string } | undefined;
  const next = p.next as { title: string; url: string } | undefined;
  const showLinks = features.includes("navigation.footer") && (prev || next);
  const prevLink = showLinks && prev ? `<a href="${esc(normalizeUrl(prev.url))}" class="md-footer__link md-footer__link--prev" aria-label="Previous: ${esc(prev.title)}"><div class="md-footer__button md-icon">${icon("material/arrow-left")}</div><div class="md-footer__title"><span class="md-footer__direction">Previous</span><div class="md-ellipsis">${esc(prev.title)}</div></div></a>` : "";
  const nextLink = showLinks && next ? `<a href="${esc(normalizeUrl(next.url))}" class="md-footer__link md-footer__link--next" aria-label="Next: ${esc(next.title)}"><div class="md-footer__title"><span class="md-footer__direction">Next</span><div class="md-ellipsis">${esc(next.title)}</div></div><div class="md-footer__button md-icon">${icon("material/arrow-right")}</div></a>` : "";
  return `${showLinks ? `<nav class="md-footer__inner md-grid" aria-label="Footer">${prevLink}${nextLink}</nav>` : ""}
  <div class="md-footer-meta md-typeset"><div class="md-footer-meta__inner md-grid"><div class="md-copyright">Made with <a href="https://github.com/CNSeniorious000/vizen" target="_blank" rel="noopener">vizen</a></div></div></div>`;
}

/** Render the primary nav — mirrors zensical/ui src/partials/nav.html + nav-item.html.
 *  This is NOT an island host (zensical marks the wrapping .md-sidebar as
 *  data-md-component="sidebar", not the nav itself), so we emit the full <nav> tag with
 *  aria-label + data-md-level="0". Nested sections use a checkbox toggle so they expand/
 *  collapse without JS; the active section is checked open. The active leaf embeds the
 *  page toc as a nested md-nav--secondary (nav-item.html's active branch). */
function renderNav(nav: Nav, siteName: string, features: string[], toc: Toc): string {
  const lifted = features.includes("navigation.tabs") ? " md-nav--lifted" : "";
  const items = nav.map((n, i) => renderNavItem(n, `__nav_${i + 1}`, 1, features, toc)).join("");
  return `<nav class="md-nav md-nav--primary${lifted}" aria-label="Navigation" data-md-level="0">
  <label class="md-nav__title" for="__drawer">
    <a href="/" title="${esc(siteName)}" class="md-nav__button md-logo" aria-label="${esc(siteName)}" data-md-component="logo">${icon("material/library")}</a>
    ${esc(siteName)}
  </label>
  <ul class="md-nav__list">${items}</ul>
</nav>`;
}

function renderNavItem(n: NavNode, path: string, level: number, features: string[], toc: Toc): string {
  const activeCls = n.active ? " md-nav__item--active" : "";
  const ic = navIcon(n.icon);
  // Section: has children → checkbox toggle + nested list (mirrors nav-item.html's
  // `nav_item.children` branch). Active sections render checked so they're expanded.
  if (n.children) {
    const checked = n.active ? " checked" : "";
    const head = `<label class="md-nav__link" for="${path}" id="${path}_label" tabindex="0">${ic}<span class="md-ellipsis">${esc(n.title)}</span><span class="md-nav__icon md-icon"></span></label>`;
    const children = n.children.map((c, i) => renderNavItem(c, `${path}_${i + 1}`, level + 1, features, toc)).join("");
    return `<li class="md-nav__item md-nav__item--nested${activeCls}"><input class="md-nav__toggle md-toggle" type="checkbox" id="${path}"${checked} />${head}<nav class="md-nav" data-md-level="${level}" aria-labelledby="${path}_label" aria-expanded="${n.active ? "true" : "false"}"><label class="md-nav__title" for="${path}"><span class="md-nav__icon md-icon"></span>${esc(n.title)}</label><ul class="md-nav__list">${children}</ul></nav></li>`;
  }
  // Active leaf: render the __toc toggle label + the link + the embedded page toc
  // (mirrors nav-item.html's active branch — the toc lives inside the active nav item so
  // it scrolls with the sidebar on mobile).
  if (n.active && toc.length) {
    const tocNav = renderToc(toc);
    return `<li class="md-nav__item${activeCls}"><label class="md-nav__link md-nav__link--active" for="__toc">${ic}<span class="md-ellipsis">${esc(n.title)}</span><span class="md-nav__icon md-icon"></span></label><a href="${esc(normalizeUrl(n.url ?? ""))}" class="md-nav__link md-nav__link--active">${ic}<span class="md-ellipsis">${esc(n.title)}</span></a>${tocNav}</li>`;
  }
  const linkCls = n.active ? "md-nav__link md-nav__link--active" : "md-nav__link";
  return `<li class="md-nav__item${activeCls}"><a href="${esc(normalizeUrl(n.url ?? ""))}" class="${linkCls}">${ic}<span class="md-ellipsis">${esc(n.title)}</span></a></li>`;
}

/** The secondary sidebar (toc) wrapper — mirrors base.html's toc sidebar branch: a
 *  __toc checkbox + sidebar button, then the toc nav inside. */
function tocSidebar(toc: Toc): string {
  const hasToc = toc.length > 0;
  const toggle = hasToc ? `<input class="md-nav__toggle md-toggle" type="checkbox" id="__toc" /><div class="md-sidebar-button__wrapper"><label class="md-sidebar-button" for="__toc"></label></div>` : "";
  return `<div class="md-sidebar md-sidebar--secondary" data-md-component="sidebar" data-md-type="toc"><div class="md-sidebar__scrollwrap">${toggle}<div class="md-sidebar__inner">${renderToc(toc, true)}</div></div></div>`;
}

/** Render the toc — mirrors zensical/ui src/partials/toc.html + toc-item.html. Emits the
 *  full <nav class="md-nav md-nav--secondary"> tag. Used both in the secondary sidebar
 *  (with data-md-component="toc") and embedded inside the active nav leaf (without it). */
function renderToc(toc: Toc, withComponent = false): string {
  if (!toc.length) return "";
  const items = toc.map(renderTocItem).join("");
  const comp = withComponent ? ` data-md-component="toc"` : "";
  return `<nav class="md-nav md-nav--secondary" aria-label="On this page"${comp}>
  <label class="md-nav__title" for="__toc"><span class="md-nav__icon md-icon"></span>On this page</label>
  <ul class="md-nav__list" data-md-component="toc" data-md-scrollfix>${items}</ul>
</nav>`;
}

function renderTocItem(t: { slug: string; text: string; children?: unknown[] }): string {
  const children = t.children && t.children.length ? `<nav class="md-nav" aria-label="${esc(t.text)}"><ul class="md-nav__list">${(t.children as Toc).map(renderTocItem).join("")}</ul></nav>` : "";
  return `<li class="md-nav__item"><a href="#${esc(t.slug)}" class="md-nav__link"><span class="md-ellipsis"><span class="md-typeset">${esc(t.text)}</span></span></a>${children}</li>`;
}

/** Normalize a nav url to an ABSOLUTE path (leading /) so it resolves correctly from any
 *  page depth. Relative paths like "getting-started/installation" would otherwise resolve
 *  against the current page's URL (e.g. /getting-started/configuration/ + getting-started/
 *  installation/ = broken). mkdocs-material does the same via its `| url` filter. */
function normalizeUrl(url: string): string {
  if (url === "") return "/";
  // Leave fragments and full URLs alone.
  if (url.startsWith("#") || /^https?:\/\//.test(url)) return url;
  // Ensure leading slash + trailing slash (directory pages).
  const withSlash = url.endsWith("/") || /\.[^/]*$/.test(url) ? url : `${url}/`;
  return withSlash.startsWith("/") ? withSlash : `/${withSlash}`;
}

function esc(s: string): string {
  return s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");
}
