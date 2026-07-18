// @zensical/runtime — browser-side runtime for HMR + client-side navigation.
// Two non-negotiable features:
//   1. Perfect HMR: only the changed island re-renders; DOM + state elsewhere is preserved.
//   2. Default client-side navigation (sveltekit-preload-data style): in-app links load only
//      the diff, render it, never a full MPA reload. SPA + SSR by default.

export { createHmrClient, type HmrClient, type HmrUpdate } from "./hmr/index.ts";
export { createNavigator, type Navigator, type NavigationOptions, type NavigationResult } from "./navigate/index.ts";
export { mount, type MountOptions } from "./mount.ts";
export { ISLAND_ATTR, islandId, islandOf } from "./island.ts";
