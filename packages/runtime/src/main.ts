// Browser entry — Vite loads this as the dev server's module script. It mounts the
// runtime (HMR + client-side navigation) and registers every island renderer.
//
// In production this is the single <script> at the bottom of base.html.
//
// Each renderer returns the INNER content of its island host (a Fragment or a single
// child element — never the host tag itself). The host element (with data-md-component)
// is SSR'd by render/index.ts and stays put; Preact's hydrate matches the renderer's
// vnodes against the host's existing children instead of nesting a duplicate host.

import { mount } from "./mount.ts";
import { h, Fragment, type VNode } from "preact";
import { ISLAND_ATTR } from "./island.ts";
import { mountSearch } from "./search.ts";
import { mountClipboard } from "./clipboard.ts";
import { mountHeaderScroll } from "./header.ts";

const runtime = mount();

// Inline SVG icons — same set as the SSR renderer, kept in sync. Lucide (stroke) icons
// match zensical's default theme icons; the SCSS .lucide override renders strokes.
const ICONS: Record<string, string> = {
  "material/menu": `<svg xmlns="http://www.w3.org/2000/svg" fill="none" stroke="currentColor" stroke-linecap="round" stroke-linejoin="round" stroke-width="2" class="lucide lucide-menu" viewBox="0 0 24 24"><path d="M4 5h16"/><path d="M4 12h16"/><path d="M4 19h16"/></svg>`,
  "material/magnify": `<svg xmlns="http://www.w3.org/2000/svg" fill="none" stroke="currentColor" stroke-linecap="round" stroke-linejoin="round" stroke-width="2" class="lucide lucide-search" viewBox="0 0 24 24"><path d="m21 21-4.34-4.34"/><circle cx="11" cy="11" r="8"/></svg>`,
  "material/arrow-left": `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24"><path d="M20 11v2H8l5.5 5.5-1.42 1.42L4.16 12l7.92-7.92L13.5 5.5 8 11h12z"/></svg>`,
  "material/arrow-right": `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24"><path d="M4 11v2h12l-5.5 5.5 1.42 1.42L19.84 12l-7.92-7.92L10.5 5.5 16 11H4z"/></svg>`,
  "material/library": `<svg xmlns="http://www.w3.org/2000/svg" fill="none" stroke="currentColor" stroke-linecap="round" stroke-linejoin="round" stroke-width="2" class="lucide lucide-book-open" viewBox="0 0 24 24"><path d="M12 7v14"/><path d="M3 18a1 1 0 0 1-1-1V4a1 1 0 0 1 1-1h5a4 4 0 0 1 4 4 4 4 0 0 1 4-4h5a1 1 0 0 1 1 1v13a1 1 0 0 1-1 1h-6a3 3 0 0 0-3 3 3 3 0 0 0-3-3z"/></svg>`,
  "fontawesome/brands/git-alt": `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 448 512"><path d="M439.55 236.05L244 40.45a28.87 28.87 0 0 0-40.81 0l-40.66 40.63 51.52 51.52c27.06-9.14 52.68 16.77 43.39 43.68l49.66 49.66c34.23-11.8 61.18 31 35.47 56.69-26.49 26.49-70.21-2.87-56-37.34L240.22 199v121.85c25.3 12.54 22.26 41.85 9.08 55a34.34 34.34 0 0 1-48.55 0c-17.57-17.6-11.67-46.91 11.25-56v-123c-20.8-8.51-24.6-30.74-18.64-45L142.57 101 8.45 235.14a28.86 28.86 0 0 0 0 40.81l195.61 195.6a28.86 28.86 0 0 0 40.8 0l194.69-194.69a28.86 28.86 0 0 0 0-40.81z"/></svg>`,
};

// dangerouslySetInnerHTML lets us drop the raw SVG string into a vnode so the icon markup
// matches the SSR output exactly (Preact would otherwise escape the nested svg).
// eslint-disable-next-line @typescript-eslint/no-explicit-any
function icon(name: string): VNode<any> {
  return h("span", { dangerouslySetInnerHTML: { __html: ICONS[name] ?? "" } });
}

function normalizeUrl(url: string): string {
  if (url === "") return "/";
  if (url.startsWith("#") || /^https?:\/\//.test(url)) return url;
  const withSlash = url.endsWith("/") || /\.[^/]*$/.test(url) ? url : `${url}/`;
  return withSlash.startsWith("/") ? withSlash : `/${withSlash}`;
}

// The search overlay inner HTML — kept in sync with render/index.ts searchOverlay(). Lives
// inside the header so the SCSS `:checked ~ .md-header .md-search__*` selectors match.
// Defined before the header renderer registers so the renderer (which runs immediately on
// register) can reference it without hitting the temporal dead zone.
const SEARCH_OVERLAY_INNER = `<label class="md-search__button" for="__search">Search</label><label class="md-search__overlay" for="__search"></label><div class="md-search__inner"><form class="md-search__form" onsubmit="return false"><label class="md-search__icon md-icon" for="__search" aria-label="Search">${ICONS["material/magnify"]}</label><input type="text" class="md-search__input" name="query" placeholder="Search" autocapitalize="off" autocorrect="off" spellcheck="false" /></form><div class="md-search__output"><div class="md-search__scrollwrap"><div class="md-search-result" data-md-component="search-result"></div></div></div></div>`;

runtime.hmr?.register("header", (props) => {
  const p = props as { siteName?: string; pageTopic?: string; searchEnabled?: boolean; repoUrl?: string; repoName?: string };
  const siteName = p.siteName ?? "";
  const pageTopic = p.pageTopic ?? "";
  const searchEnabled = !!p.searchEnabled;
  const repoUrl = p.repoUrl ?? "";
  const repoName = p.repoName ?? "";
  const source = repoUrl ? h("div", { class: "md-header__source" },
    h("a", { href: repoUrl, title: "Repository", class: "md-source", "data-md-component": "source" },
      h("div", { class: "md-source__icon md-icon" }, icon("fontawesome/brands/git-alt")),
      h("div", { class: "md-source__repository" }, repoName))) : h("div", { class: "md-header__source" });
  // Returns the INNER content of the <header data-md-component="header"> host.
  return h("nav", { class: "md-header__inner md-grid", "aria-label": "Header" },
    h("a", { href: "/", title: siteName, class: "md-header__button md-logo", "aria-label": siteName, "data-md-component": "logo" }, icon("material/library")),
    h("label", { class: "md-header__button md-icon", for: "__drawer", "aria-label": "Menu" }, icon("material/menu")),
    h("div", { class: "md-header__title", "data-md-component": "header-title" },
      h("div", { class: "md-header__ellipsis" },
        h("div", { class: "md-header__topic" }, h("span", { class: "md-ellipsis" }, siteName)),
        h("div", { class: "md-header__topic", "data-md-component": "header-topic" }, h("span", { class: "md-ellipsis" }, pageTopic)))),
    searchEnabled ? h("label", { class: "md-header__button md-icon", for: "__search", "aria-label": "Search" }, icon("material/magnify")) : null,
    searchEnabled ? h("div", { class: "md-search", "data-md-component": "search", role: "dialog", "aria-label": "Search", dangerouslySetInnerHTML: { __html: SEARCH_OVERLAY_INNER } }) : null,
    source);
});

// Content is NOT a hydratable island: its SSR markup (raw markdown HTML) lives directly
// under <div data-md-component="content"><article>...</article></div>, and Preact can't
// reconcile raw HTML against a vnode tree without re-parsing. The SSR output is the
// source of truth; client-side navigation swaps the whole content host via island diff
// (navigate/swapIslands), and markdown edits trigger a dev-server re-SSR of the page.

// FOOTER-RENDERER-START
runtime.hmr?.register("footer", (props) => {
  const p = props as { siteName?: string; prev?: { title: string; url: string }; next?: { title: string; url: string }; features?: string[] };
  const features = p.features ?? [];
  const prev = p.prev;
  const next = p.next;
  const showLinks = features.includes("navigation.footer") && (prev || next);
  const prevLink = showLinks && prev ? h("a", { href: normalizeUrl(prev.url), class: "md-footer__link md-footer__link--prev", "aria-label": `Previous: ${prev.title}` },
    h("div", { class: "md-footer__button md-icon" }, icon("material/arrow-left")),
    h("div", { class: "md-footer__title" }, h("span", { class: "md-footer__direction" }, "Previous"), h("div", { class: "md-ellipsis" }, prev.title))) : null;
  const nextLink = showLinks && next ? h("a", { href: normalizeUrl(next.url), class: "md-footer__link md-footer__link--next", "aria-label": `Next: ${next.title}` },
    h("div", { class: "md-footer__title" }, h("span", { class: "md-footer__direction" }, "Next"), h("div", { class: "md-ellipsis" }, next.title)),
    h("div", { class: "md-footer__button md-icon" }, icon("material/arrow-right"))) : null;
  // Returns the INNER content of the <footer data-md-component="footer"> host.
  return h(Fragment, null,
    showLinks ? h("nav", { class: "md-footer__inner md-grid", "aria-label": "Footer" }, prevLink, nextLink) : null,
    h("div", { class: "md-footer-meta md-typeset" }, h("div", { class: "md-footer-meta__inner md-grid" }, h("div", { class: "md-copyright" }, "Made with ", h("a", { href: "https://github.com/CNSeniorious000/vizen", target: "_blank", rel: "noopener" }, "vizen")))));
});
// FOOTER-RENDERER-END

// Nav and toc are NOT hydratable islands — zensical/ui marks the wrapping .md-sidebar as
// data-md-component="sidebar", and the nav/toc inside are static SSR markup. Client-side
// navigation swaps the whole sidebar island; markdown/nav edits trigger a dev re-SSR.

// HMR boundary: when this module (or a dependency) changes, Vite calls accept. We
// re-mount every island so the new renderers take effect — but the DOM hosts are reused,
// so Preact reconciles and preserves state.
if (import.meta.hot) {
  import.meta.hot.accept(() => {
    runtime.hmr?.refreshAll();
  });
}

// Mark the document as JS-enabled (mirrors zensical/ui's no-js → js class swap).
document.documentElement.classList.remove("no-js");
document.documentElement.classList.add("js");

// Wire the search overlay (no-op if search is disabled — no .md-search__input in the DOM).
mountSearch();

// Inject code-copy buttons. Re-run when the content island swaps (client-side navigation)
// so the new page's <pre> blocks get buttons too.
mountClipboard();
const contentEl = document.querySelector('[data-md-component="content"]');
if (contentEl) new MutationObserver(() => mountClipboard()).observe(contentEl, { childList: true, subtree: true });

// Hide the tabs bar on scroll-down, reveal on scroll-up (navigation.tabs behavior).
mountHeaderScroll();

// Re-export the island attr for consumers that want to query islands.
export { ISLAND_ATTR };
