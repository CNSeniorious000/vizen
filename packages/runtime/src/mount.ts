// Browser entry: wire up HMR + client-side navigation on first load.
// This module is what Vite injects into the dev server's HTML; in production it's the
// single <script> tag at the bottom of base.html.

import { getHmrClient, type HmrClient } from "./hmr/index.ts";
import { createNavigator, type Navigator, type NavigationOptions } from "./navigate/index.ts";

export interface MountOptions extends NavigationOptions {
  /** Whether to enable client-side navigation. Default: true. This is the SPA+SSR default;
   *  passing false falls back to MPA (only useful for opt-out debugging). */
  navigate?: boolean;
  /** Whether to enable HMR. Default: true in dev (detected via import.meta.hot). */
  hmr?: boolean;
}

export interface MountedRuntime {
  hmr: HmrClient | null;
  navigator: Navigator | null;
  destroy(): void;
}

export function mount(opts: MountOptions = {}): MountedRuntime {
  const inDev = typeof import.meta !== "undefined" && !!(import.meta as { hot?: unknown }).hot;
  const wantHmr = opts.hmr ?? inDev;
  const wantNav = opts.navigate ?? true;

  const hmr = wantHmr ? getHmrClient() : null;
  const navigator = wantNav ? createNavigator(opts) : null;

  if (hmr && inDev) {
    const hot = (import.meta as unknown as { hot?: { accept: (cb: (mod: unknown) => void) => void } }).hot;
    // Self-accept so a runtime change doesn't cascade to a full reload.
    hot?.accept(() => hmr.refreshAll());
  }

  return {
    hmr,
    navigator,
    destroy() {
      navigator?.destroy();
    },
  };
}
