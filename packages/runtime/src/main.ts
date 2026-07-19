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

const runtime = mount();

// Inline material SVG icons — same set as the SSR renderer, kept in sync.
const ICONS: Record<string, string> = {
  "material/menu": `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24"><path d="M3 6h18v2H3zm0 5h18v2H3zm0 5h18v2H3z"/></svg>`,
  "material/magnify": `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24"><path d="M9.5 3A6.5 6.5 0 0 1 16 9.5c0 1.61-.59 3.09-1.56 4.23l.27.27h.79l5 5-1.5 1.5-5-5v-.79l-.27-.27A6.5 6.5 0 0 1 9.5 16 6.5 6.5 0 0 1 3 9.5 6.5 6.5 0 0 1 9.5 3m0 2A4.5 4.5 0 0 0 5 9.5 4.5 4.5 0 0 0 9.5 14 4.5 4.5 0 0 0 14 9.5 4.5 4.5 0 0 0 9.5 5z"/></svg>`,
  "material/arrow-left": `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24"><path d="M20 11v2H8l5.5 5.5-1.42 1.42L4.16 12l7.92-7.92L13.5 5.5 8 11h12z"/></svg>`,
  "material/arrow-right": `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24"><path d="M4 11v2h12l-5.5 5.5 1.42 1.42L19.84 12l-7.92-7.92L10.5 5.5 16 11H4z"/></svg>`,
  "material/library": `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24"><path d="M12 7v14M3 18a1 1 0 0 1-1-1V4a1 1 0 0 1 1-1h5a4 4 0 0 1 4 4 4 4 0 0 1 4-4h5a1 1 0 0 1 1 1v13a1 1 0 0 1-1 1h-6a3 3 0 0 0-3 3 3 3 0 0 0-3-3z"/></svg>`,
};

// dangerouslySetInnerHTML lets us drop the raw SVG string into a vnode so the icon markup
// matches the SSR output exactly (Preact would otherwise escape the nested svg).
// eslint-disable-next-line @typescript-eslint/no-explicit-any
function icon(name: string): VNode<any> {
  return h("span", { dangerouslySetInnerHTML: { __html: ICONS[name] ?? "" } });
}

interface NavNodeT { title: string; url?: string; children?: NavNodeT[]; active?: boolean }
interface TocItemT { level: number; slug: string; text: string; children?: TocItemT[] }

function normalizeUrl(url: string): string {
  if (url === "") return "/";
  if (url.startsWith("#") || /^https?:\/\//.test(url)) return url;
  const withSlash = url.endsWith("/") || /\.[^/]*$/.test(url) ? url : `${url}/`;
  return withSlash.startsWith("/") ? withSlash : `/${withSlash}`;
}

runtime.hmr?.register("header", (props) => {
  const p = props as { siteName?: string; pageTopic?: string; searchEnabled?: boolean };
  const siteName = p.siteName ?? "";
  const pageTopic = p.pageTopic ?? "";
  const searchEnabled = !!p.searchEnabled;
  // Returns the INNER content of the <header data-md-component="header"> host.
  return h("nav", { class: "md-header__inner md-grid", "aria-label": "Header" },
    h("a", { href: "/", title: siteName, class: "md-header__button md-logo", "aria-label": siteName, "data-md-component": "logo" }, icon("material/library")),
    h("label", { class: "md-header__button md-icon", for: "__drawer", "aria-label": "Menu" }, icon("material/menu")),
    h("div", { class: "md-header__title", "data-md-component": "header-title" },
      h("div", { class: "md-header__ellipsis" },
        h("div", { class: "md-header__topic" }, h("span", { class: "md-ellipsis" }, siteName)),
        h("div", { class: "md-header__topic", "data-md-component": "header-topic" }, h("span", { class: "md-ellipsis" }, pageTopic)))),
    searchEnabled ? h("label", { class: "md-header__button md-icon", for: "__search", "aria-label": "Search" }, icon("material/magnify")) : null,
    h("div", { class: "md-header__source" }));
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

runtime.hmr?.register("nav", (props) => {
  const p = props as { nav?: NavNodeT[]; siteName?: string };
  const nav = p.nav ?? [];
  const siteName = p.siteName ?? "";
  const items = nav.map((n, i) => renderNavItem(n, `__nav_${i + 1}`, 1));
  // Returns the INNER content of the <nav data-md-component="nav"> host.
  return h(Fragment, null,
    h("label", { class: "md-nav__title", for: "__drawer" },
      h("a", { href: "/", title: siteName, class: "md-nav__button md-logo", "aria-label": siteName, "data-md-component": "logo" }, icon("material/library")),
      siteName),
    h("ul", { class: "md-nav__list", "data-md-scrollfix": true }, items));
});

// eslint-disable-next-line @typescript-eslint/no-explicit-any
function renderNavItem(n: NavNodeT, path: string, level: number): VNode<any> {
  const activeCls = n.active ? " md-nav__item--active" : "";
  if (n.children) {
    const head = h("label", { class: "md-nav__link", for: path, id: `${path}_label`, tabindex: "0" },
      h("span", { class: "md-ellipsis" }, n.title), h("span", { class: "md-nav__icon md-icon" }));
    const children = n.children.map((c, i) => renderNavItem(c, `${path}_${i + 1}`, level + 1));
    return h("li", { class: `md-nav__item md-nav__item--nested${activeCls}` },
      h("input", { class: "md-nav__toggle md-toggle", type: "checkbox", id: path, checked: !!n.active }),
      head,
      h("nav", { class: "md-nav", "data-md-level": String(level), "aria-labelledby": `${path}_label`, "aria-expanded": n.active ? "true" : "false" },
        h("label", { class: "md-nav__title", for: path }, h("span", { class: "md-nav__icon md-icon" }), n.title),
        h("ul", { class: "md-nav__list", "data-md-scrollfix": true }, children)));
  }
  const linkCls = n.active ? "md-nav__link md-nav__link--active" : "md-nav__link";
  return h("li", { class: `md-nav__item${activeCls}` },
    h("a", { href: normalizeUrl(n.url ?? ""), class: linkCls }, h("span", { class: "md-ellipsis" }, n.title)));
}

runtime.hmr?.register("toc", (props) => {
  const p = props as { toc?: TocItemT[] };
  const toc = p.toc ?? [];
  if (!toc.length) return null;
  const items = toc.map(renderTocItem);
  // Returns the INNER content of the <nav data-md-component="toc"> host.
  return h(Fragment, null,
    h("label", { class: "md-nav__title", for: "__toc" }, h("span", { class: "md-nav__icon md-icon" }), "On this page"),
    h("ul", { class: "md-nav__list", "data-md-scrollfix": true }, items));
});

// eslint-disable-next-line @typescript-eslint/no-explicit-any
function renderTocItem(t: TocItemT): VNode<any> {
  const children = t.children && t.children.length ? h("nav", { class: "md-nav", "aria-label": t.text }, h("ul", { class: "md-nav__list" }, t.children!.map(renderTocItem))) : null;
  return h("li", { class: "md-nav__item" },
    h("a", { href: `#${t.slug}`, class: "md-nav__link" }, h("span", { class: "md-ellipsis" }, h("span", { class: "md-typeset" }, t.text))),
    children);
}

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

// Re-export the island attr for consumers that want to query islands.
export { ISLAND_ATTR };
