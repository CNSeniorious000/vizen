// Browser entry — Vite loads this as the dev server's module script. It mounts the
// runtime (HMR + client-side navigation) and registers every island renderer.
//
// In production this is the single <script> at the bottom of base.html.

import { mount } from "./mount.ts";
import { h } from "preact";
import { ISLAND_ATTR } from "./island.ts";

const runtime = mount();

// Register island renderers. Each maps a `data-md-component` name to a Preact renderer.
// On HMR, only the changed island's renderer is re-invoked against its host.
// (Island components are ported incrementally from zensical/ui; these are the structural
// ones needed for the dev server to boot.)

runtime.hmr?.register("header", (props) => {
  const p = props as { title?: string };
  return h("header", { class: "md-header" }, h("div", { class: "md-header__title" }, p.title ?? ""));
});

runtime.hmr?.register("content", (props) => {
  const p = props as { html?: string; title?: string };
  // Content is SSR'd HTML; we render it via dangerouslySetInnerHTML so Preact doesn't
  // re-parse the markdown tree. The host already holds the SSR markup; on HMR we only
  // re-render if the source changed.
  return h("article", { class: "md-content__inner md-typeset", dangerouslySetInnerHTML: { __html: p.html ?? "" } });
});

runtime.hmr?.register("footer", (props) => {
  const p = props as { site_name?: string };
  return h("footer", { class: "md-footer" }, h("div", { class: "md-footer__title" }, p.site_name ?? ""));
});

runtime.hmr?.register("nav", (props) => {
  const p = props as { nav?: { title: string; url?: string; children?: unknown[] }[] };
  const items = (p.nav ?? []).map((n) => h("li", null, h("a", { href: n.url ?? "#" }, n.title)));
  return h("nav", { class: "md-nav" }, h("ul", null, items));
});

runtime.hmr?.register("toc", (props) => {
  const p = props as { toc?: { level: number; slug: string; text: string; children?: unknown[] }[] };
  const items = (p.toc ?? []).map((t) => h("li", { class: `md-nav__item--level-${t.level}` }, h("a", { href: `#${t.slug}` }, t.text)));
  return h("nav", { class: "md-nav md-nav--secondary" }, h("ul", null, items));
});

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
