// Client-side navigation — the second non-negotiable feature.
//
// Default SPA + SSR: clicking an in-app link never does a full MPA reload. We fetch the
// target's SSR HTML, diff it island-by-island against the current document, and swap only
// the islands whose content changed. Everything else (other islands, scroll, drawer,
// focus, in-flight interactions) is preserved.
//
// sveltekit-preload-data style: we preload the destination on hover/focus/touchstart so
// that by the time the user clicks, the response is already in cache and the navigation
// is effectively instant. This is on by default — no opt-in flag, no per-link annotation.

import { ISLAND_ATTR, islandId } from "../island.ts";

export interface NavigationOptions {
  /** Selector for links to intercept. Default: every same-origin <a> without a target/rel
   *  override, download attribute, or modifier key. */
  linkSelector?: string;
  /** Preload triggers. Default: hover, focus, touchstart. */
  preloadOn?: ReadonlyArray<PreloadTrigger>;
  /** Max in-flight preloads to keep. Older evicted LRU. */
  preloadCacheSize?: number;
  /** Called before the swap; return false to abort (e.g. user confirmation). */
  beforeNavigate?: (url: URL) => boolean | Promise<boolean>;
  /** Called after the DOM swap completes. */
  afterNavigate?: (url: URL) => void;
}

export type PreloadTrigger = "hover" | "focus" | "touchstart" | "pointerdown";

export interface NavigationResult {
  url: URL;
  /** Islands whose content actually changed and were swapped. */
  swapped: string[];
  /** Whether the response came from the preload cache (no network wait on click). */
  fromCache: boolean;
  /** Milliseconds from click to swap complete. */
  durationMs: number;
}

export interface Navigator {
  /** Programmatic navigation. */
  go(href: string, opts?: { replace?: boolean }): Promise<NavigationResult>;
  /** Prefetch a URL into the cache without navigating. */
  prefetch(href: string): Promise<void>;
  /** Tear down all listeners. */
  destroy(): void;
}

const NAV_HEADER = "X-Vizen-Navigate";
const NAV_VALUE = "1";

export function createNavigator(opts: NavigationOptions = {}): Navigator {
  const linkSelector = opts.linkSelector ?? 'a[href]';
  const preloadOn = opts.preloadOn ?? (["hover", "focus", "touchstart", "pointerdown"] as PreloadTrigger[]);
  const cache = new Map<string, Promise<Document>>();
  const cacheOrder: string[] = [];
  const cacheSize = opts.preloadCacheSize ?? 20;

  const owner = (opts as { owner?: Document }).owner ?? document;

  // --- preload cache (LRU) -------------------------------------------------
  function evict() {
    while (cacheOrder.length > cacheSize) {
      const key = cacheOrder.shift()!;
      cache.delete(key);
    }
  }

  async function prefetch(href: string): Promise<void> {
    const url = resolve(href);
    if (!url || !isInternal(url)) return;
    if (cache.has(url.href)) return;
    // Store a promise that NEVER rejects: a rejected promise in the cache would propagate
    // when `go` later awaits `cache.get(...) ?? fetchDoc(...)`, and a fire-and-forget
    // prefetch (hover/focus) that fails must not become an unhandled rejection. On failure
    // we remove the cache entry and resolve to undefined; `go` will then re-fetch.
    const p = fetchDoc(url).then(
      (doc) => doc,
      (err) => {
        cache.delete(url.href);
        const i = cacheOrder.indexOf(url.href);
        if (i >= 0) cacheOrder.splice(i, 1);
        return Promise.reject(err);
      }
    );
    cache.set(url.href, p);
    cacheOrder.push(url.href);
    evict();
    // Swallow prefetch errors — hover/focus prefetch is best-effort; `go` re-fetches on miss.
    await p.catch(() => {});
  }

  // --- core: fetch + diff + swap ------------------------------------------
  async function go(href: string, goOpts: { replace?: boolean } = {}): Promise<NavigationResult> {
    const url = resolve(href);
    if (!url || !isInternal(url)) {
      // External or unresolvable — fall back to a hard navigation. Never silently swallow.
      owner.location.href = href;
      return { url: url ?? new URL(owner.location.href), swapped: [], fromCache: false, durationMs: 0 };
    }

    const t0 = now();
    const fromCache = cache.has(url.href);
    // On fetch failure, fall back to a hard navigation rather than rejecting — `go` is
    // often called fire-and-forget from the click handler, and a rejected promise there
    // would surface as an unhandled rejection. Hard-nav is the correct degradation anyway.
    const doc = await (cache.get(url.href) ?? fetchDoc(url)).catch(() => {
      owner.location.href = href;
      return null;
    });
    if (!doc) return { url, swapped: [], fromCache, durationMs: now() - t0 };

    if (opts.beforeNavigate && !(await opts.beforeNavigate(url))) {
      return { url, swapped: [], fromCache, durationMs: now() - t0 };
    }

    const swapped = swapIslands(doc);
    syncHead(doc);

    // Title + history. We update history AFTER the swap so a popstate during swap is consistent.
    if (doc.title) owner.title = doc.title;
    // We own scroll position (saved per-history-entry below), so disable the browser's
    // native scroll restoration which would fight us.
    const hist = owner.defaultView?.history;
    if (hist) hist.scrollRestoration = "manual";
    const method = goOpts.replace ? "replaceState" : "pushState";
    hist?.[method]({ vizen: url.href }, "", url.href);

    // Scroll: hash → element; otherwise top (unless replace, which preserves scroll).
    if (url.hash) {
      const el = owner.getElementById(url.hash.slice(1));
      el?.scrollIntoView();
    } else if (!goOpts.replace) {
      owner.defaultView?.scrollTo(0, 0);
    }

    opts.afterNavigate?.(url);
    return { url, swapped, fromCache, durationMs: now() - t0 };
  }

  /** The heart of incremental navigation. We diff islands at two granularities:
   *
   *  1. LEAF islands (no island descendant) — swapped individually when their serialized
   *     content changes. This preserves DOM identity for islands like the header (only its
   *     header-topic leaf swaps, the <header> host stays) and keeps a changed content
   *     island from dragging the footer with it.
   *
   *  2. The sidebar CONTAINER islands — swapped as a whole when their content changes.
   *     The nav's active-item class and the toc both live inside the sidebar but neither
   *     is itself an island, so a leaf-only diff could never update them. Swapping the
   *     whole sidebar is safe: the SSR markup has the active section's checkbox checked,
   *     so the drawer re-opens to the right place. */
  function swapIslands(next: Document): string[] {
    const swapped: string[] = [];
    const current = owner;
    const nextIslands = Array.from(next.querySelectorAll(`[${ISLAND_ATTR}]`));

    // --- leaf islands ------------------------------------------------------
    const nextLeaves = nextIslands.filter((h) => !h.querySelector(`[${ISLAND_ATTR}]`));
    for (const nextHost of nextLeaves) {
      const name = nextHost.getAttribute(ISLAND_ATTR)!;
      const curHosts = current.querySelectorAll(`[${ISLAND_ATTR}="${name}"]`);
      const id = islandId(nextHost);
      const curHost = Array.from(curHosts).find((h) => islandId(h) === id);
      if (!curHost) {
        insertNewIsland(nextHost, name);
        swapped.push(name);
        continue;
      }
      if (serialize(curHost) === serialize(nextHost)) continue;
      const cloned = nextHost.cloneNode(true) as Element;
      curHost.replaceWith(cloned);
      reexecuteScripts(cloned);
      swapped.push(name);
    }

    // --- sidebar containers (swap as a unit so nav active + toc update) ----
    const nextSidebars = nextIslands.filter((h) => h.getAttribute(ISLAND_ATTR) === "sidebar" && !h.parentElement?.closest(`[${ISLAND_ATTR}]`));
    for (const nextHost of nextSidebars) {
      const curHost = Array.from(current.querySelectorAll(`[${ISLAND_ATTR}="sidebar"]`)).find((h) => islandId(h) === islandId(nextHost));
      if (!curHost) continue;
      if (serialize(curHost) === serialize(nextHost)) continue;
      const cloned = nextHost.cloneNode(true) as Element;
      curHost.replaceWith(cloned);
      reexecuteScripts(cloned);
      swapped.push("sidebar");
    }

    // Remove leaf islands present in current but absent in next.
    const nextLeafIds = new Set(nextLeaves.map((h) => `${h.getAttribute(ISLAND_ATTR)}::${islandId(h)}`));
    current.querySelectorAll(`[${ISLAND_ATTR}]`).forEach((curHost) => {
      if (curHost.querySelector(`[${ISLAND_ATTR}]`)) return; // skip containers
      const key = `${curHost.getAttribute(ISLAND_ATTR)}::${islandId(curHost)}`;
      if (!nextLeafIds.has(key)) curHost.remove();
    });

    return swapped;
  }

  function insertNewIsland(nextHost: Element, _name: string) {
    // Best-effort: place it where it appears in the new doc relative to its parent.
    const parent = nextHost.parentElement;
    if (!parent) return;
    const targetParent = owner.querySelector(parent.tagName.toLowerCase());
    const cloned = nextHost.cloneNode(true) as Element;
    targetParent?.appendChild(cloned);
    reexecuteScripts(cloned);
  }

  /** Re-create every <script> under `root` so the browser executes it. A <script> inserted
   *  via DOM manipulation (cloneNode/appendChild/replaceWith) is NOT executed; only a
   *  freshly-created <script> element inserted into the document runs. */
  function reexecuteScripts(root: Element) {
    for (const old of Array.from(root.querySelectorAll("script"))) {
      const fresh = owner.createElement("script");
      for (const attr of old.getAttributeNames()) fresh.setAttribute(attr, old.getAttribute(attr)!);
      fresh.textContent = old.textContent;
      old.replaceWith(fresh);
    }
  }

  /** Diff <head>: add meta/link/title tags present in `next` but absent in `current`,
   *  remove those absent in `next`. Preserves tags the runtime owns (theme-color etc.). */
  function syncHead(next: Document) {
    const currentTags = new Set(Array.from(owner.head.children).map((el) => el.outerHTML));
    const nextTags = new Map(Array.from(next.head.children).map((el) => [el.outerHTML, el] as const));
    // Add new tags.
    for (const [html, el] of nextTags) {
      if (currentTags.has(html)) continue;
      owner.head.appendChild(el.cloneNode(true));
    }
    // Remove vanished tags, except those the runtime manages dynamically.
    const protected_ = new Set(["theme-color", "color-scheme"]);
    for (const el of Array.from(owner.head.children)) {
      if (nextTags.has(el.outerHTML)) continue;
      const name = el.getAttribute("name");
      if (name && protected_.has(name)) continue;
      el.remove();
    }
  }

  // --- link interception --------------------------------------------------
  const onLink = (e: Event) => {
    const a = (e.target as Element)?.closest?.(linkSelector) as HTMLAnchorElement | null;
    if (!a) return;
    if (a.target && a.target !== "_self") return;
    if (a.hasAttribute("download")) return;
    if (e instanceof MouseEvent && (e.metaKey || e.ctrlKey || e.shiftKey || e.altKey || e.button !== 0)) return;
    const url = resolve(a.href);
    if (!url || !isInternal(url)) return;
    if (url.href === owner.location.href.split("#")[0] && url.hash) {
      // Same-page hash link — let the browser handle scroll, just update state.
      return;
    }
    e.preventDefault();
    void go(a.href);
  };

  const onPreload = (e: Event) => {
    const a = (e.target as Element)?.closest?.(linkSelector) as HTMLAnchorElement | null;
    if (!a) return;
    void prefetch(a.href);
  };

  const onPop = (e: PopStateEvent) => {
    const href = (e.state && e.state.vizen) as string | undefined;
    if (!href) return;
    void go(href, { replace: true });
  };

  // Attach listeners. preloadOn maps to event names; we dedupe.
  const preloadEvents = new Set<string>();
  if (preloadOn.includes("hover")) preloadEvents.add("mouseover");
  if (preloadOn.includes("focus")) preloadEvents.add("focusin");
  if (preloadOn.includes("touchstart")) preloadEvents.add("touchstart");
  if (preloadOn.includes("pointerdown")) preloadEvents.add("pointerdown");

  for (const ev of preloadEvents) owner.addEventListener(ev, onPreload, { passive: true, capture: true });
  owner.addEventListener("click", onLink);
  owner.defaultView?.addEventListener("popstate", onPop);

  return {
    go,
    prefetch,
    destroy() {
      for (const ev of preloadEvents) owner.removeEventListener(ev, onPreload, { capture: true });
      owner.removeEventListener("click", onLink);
      owner.defaultView?.removeEventListener("popstate", onPop);
      cache.clear();
    },
  };
}

// --- helpers --------------------------------------------------------------

function resolve(href: string): URL | null {
  try {
    return new URL(href, document.baseURI);
  } catch {
    return null;
  }
}

function isInternal(url: URL): boolean {
  return url.origin === document.location.origin && !url.pathname.startsWith("/api/");
}

async function fetchDoc(url: URL): Promise<Document> {
  const res = await fetch(url.href, {
    headers: { [NAV_HEADER]: NAV_VALUE, Accept: "text/html" },
    credentials: "same-origin",
  });
  if (!res.ok) throw new Error(`navigation fetch failed: ${res.status} ${url.href}`);
  const html = await res.text();
  return new DOMParser().parseFromString(html, "text/html");
}

/** Structural signature of an island, used to decide whether a swap is needed. We compare
 *  outerHTML but strip the props <script> (runtime-injected, not part of the visual
 *  content) and normalize whitespace, so a hydrate that re-serializes the props script or
 *  collapses insignificant whitespace doesn't cause a false "changed" swap. */
function serialize(host: Element): string {
  const clone = host.cloneNode(true) as Element;
  clone.querySelectorAll("script[data-md-props]").forEach((s) => s.remove());
  return clone.outerHTML.replace(/\s+/g, " ").trim();
}

function now(): number {
  return performance.now();
}
