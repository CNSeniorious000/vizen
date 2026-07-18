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

import { render as preactRender, type VNode } from "preact";
import { ISLAND_ATTR, islandId } from "../island.ts";

export type IslandRender = (props: unknown) => VNode | null;

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
      // Initial mount: clear the SSR host and render fresh. Preact's render appends, so
      // we must clear first or stale SSR children linger. The host element itself is
      // reused, so surrounding DOM is untouched.
      for (const host of findHosts(island)) {
        const id = islandId(host);
        if (mounted.has(id)) continue;
        const props = readProps(host);
        mounted.set(id, { host, render, props });
        host.replaceChildren();
        preactRender(render(props), host);
      }
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

/** Props are serialized into a `<script type="application/json" data-md-props="...">` child
 *  of the island host at SSR time. Keeps the DOM the source of truth (no separate state). */
function readProps(host: Element): unknown {
  const node = host.querySelector(`:scope > script[data-md-props]`);
  if (!node?.textContent) return null;
  try {
    return JSON.parse(node.textContent);
  } catch {
    return null;
  }
}
