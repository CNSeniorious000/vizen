// HMR client. Vite sends hot-update payloads over its HMR WebSocket; we subscribe to the
// ones that target an island's source module and re-render ONLY that island. The rest of
// the document — including other islands, the drawer, scroll position, focus, and any
// in-progress user interaction — is never touched.
//
// Contract:
//   - A module that renders an island calls `register(name, render)` on load and
//     `import.meta.hot.accept(cb)` to opt into self-acceptance.
//   - On an update, we re-invoke the island's render function against the SAME host
//     element and let Preact reconcile. Because the host is reused, Preact preserves
//     unmounted subtrees and DOM state by key identity.

import { render as preactRender, hydrate as preactHydrate, type VNode } from "preact";
import { ISLAND_ATTR, islandId } from "../island.ts";

// eslint-disable-next-line @typescript-eslint/no-explicit-any
export type IslandRender = (props: unknown) => VNode<any> | null;

export interface HmrUpdate {
  /** The island name (`data-md-component` value) whose source changed. */
  island: string;
  /** New props serialized from the server, if the change was data-side. */
  props?: unknown;
}

export interface HmrClient {
  register(island: string, render: IslandRender): void;
  /** Apply a hot update for a single island. Returns true if an island was re-rendered. */
  apply(update: HmrUpdate): boolean;
  /** Re-render every mounted island (used after a full reconnect). */
  refreshAll(): void;
}

interface Mounted {
  host: Element;
  render: IslandRender;
  props: unknown;
}

function findHosts(island: string): Element[] {
  return Array.from(document.querySelectorAll(`[${ISLAND_ATTR}="${island}"]`));
}

export function createHmrClient(): HmrClient {
  // Per-client state. A module-level singleton would leak across HMR clients (and across
  // tests), causing stale mounts to skip re-render after the DOM is rebuilt.
  const registry = new Map<string, IslandRender>();
  const mounted = new Map<string, Mounted>();

  return {
    register(island, render) {
      registry.set(island, render);
      // If this island is already mounted (HMR re-registering after a source change),
      // re-render it in place with the NEW renderer. We do NOT clear the host — Preact's
      // render diffs the previous vnode tree against the new one and patches the DOM in
      // place, preserving unchanged subtrees and their state. (Clearing first would break
      // Preact's internal vnode cache and silently render nothing.)
      let hotUpdated = false;
      for (const host of findHosts(island)) {
        const id = islandId(host);
        const prev = mounted.get(id);
        if (prev) {
          mounted.set(id, { host, render, props: prev.props });
          preactRender(render(prev.props), host);
          hotUpdated = true;
          continue;
        }
        // Initial mount: hydrate the SSR markup in place. Hydration attaches event
        // handlers to the existing DOM WITHOUT re-creating nodes — this preserves the
        // server-rendered HTML so client-side navigation can diff islands against the same
        // SSR output the next page produces.
        const props = readProps(host);
        mounted.set(id, { host, render, props });
        preactHydrate(render(props), host);
      }
      void hotUpdated;
    },

    apply(update) {
      const render = registry.get(update.island);
      if (!render) return false;
      let touched = false;
      for (const host of findHosts(update.island)) {
        const id = islandId(host);
        const prev = mounted.get(id);
        const props = update.props ?? prev?.props ?? readProps(host);
        mounted.set(id, { host, render, props });
        // Re-render into the SAME host WITHOUT clearing: Preact diffs against the live
        // tree, so unchanged subtrees and their DOM state survive. This is the "only that
        // spot refreshes" guarantee. (Initial mount in register() did the clear.)
        preactRender(render(props), host);
        touched = true;
      }
      return touched;
    },

    refreshAll() {
      for (const [id, m] of mounted) {
        preactRender(m.render(m.props), m.host);
        mounted.set(id, m);
      }
    },
  };
}

// Module-level singleton. When main.ts is hot-reloaded, the module re-executes and calls
// mount() again — without a singleton, a fresh client (empty `mounted` map) would be
// created and the hot update would have nothing to re-render. The singleton preserves the
// mounted-island registry across HMR cycles so register() can re-render in place.
let singleton: HmrClient | null = null;
export function getHmrClient(): HmrClient {
  if (!singleton) singleton = createHmrClient();
  return singleton;
}
/** Reset the singleton — tests use this to isolate between cases. */
export function resetHmrClient(): void {
  singleton = null;
}

/** Props are serialized into a `<script type="application/json" data-md-props>` child of
 *  the island host at SSR time. Keeps the DOM the source of truth (no separate state). */
function readProps(host: Element): unknown {
  // Query without :scope > so we find the props script even if the host wraps it in
  // another element (the SSR layout puts it as a direct child, but be lenient).
  const node = host.querySelector("script[data-md-props]");
  if (!node?.textContent) return null;
  try {
    return JSON.parse(node.textContent);
  } catch {
    return null;
  }
}
