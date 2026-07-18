# zensical-vite

A modern static site generator — a TypeScript port of [zensical](https://github.com/zensical/zensical) (by the Material for MkDocs team), rebuilt on **Vite 8 + Bun** with two non-negotiable features:

1. **Perfect HMR** — change one component, only that spot refreshes in the browser. The rest of the DOM (other islands, scroll, drawer toggles, focus, in-flight interactions) is preserved.
2. **Default client-side navigation** (sveltekit-preload-data style) — clicking an in-app link loads only the diff and renders it. SPA + SSR by default, never a full MPA reload.

The UI reuses [zensical/ui](https://github.com/zensical/ui)'s SCSS (modern variant) verbatim, so the look is identical to Material for MkDocs.

## Architecture

```
packages/
  core/      SSG: config (mkdocs.yml) → markdown → nav/toc → SSR (Preact) → build/serve/watch
  runtime/   browser: HMR client + client-side navigator (island diff)
  ui/        Preact components + ported zensical/ui SCSS (61 files)
e2e/         playwright E2E (chromium): HMR + client-nav verified in real browser
```

### Islands — the unit of both HMR and client-nav

Every swappable region is a `<div data-md-component="X">` island (inherited from zensical/ui's anchor convention). The runtime:

- **HMR**: each island registers a Preact renderer. On a hot update, only the changed island's renderer re-invokes against its host — Preact reconciles, preserving unmounted subtrees and DOM state.
- **Client-nav**: clicking an in-app link fetches the target's SSR HTML, diffs each leaf island's serialized content, and swaps only the ones that changed. `history.pushState` + manual scroll restoration. Preload on hover/focus/touchstart warms an LRU cache.

## DX

```sh
bun install

# dev server with HMR + client-nav (the whole point)
bun packages/core/src/cli/index.ts serve example --port 5183

# build static site
bun packages/core/src/cli/index.ts build example

# tests
bunx vitest run              # 36 unit tests
bunx playwright test          # 4 E2E tests (chromium)
bunx tsc --noEmit             # typecheck
```

## Status

- ✅ SSG core: config, markdown (with admonitions), nav, toc, SSR
- ✅ HMR: island-level hot update, DOM state preserved (E2E verified)
- ✅ Client-side navigation: island diff, preload cache, popstate, scroll restoration (E2E verified)
- ✅ zensical/ui SCSS ported (modern variant, 61 files)
- ✅ 36 unit + 4 E2E tests, all green
- 🚧 UI partials: HTML shell is a simplified version; full base.html partials (icons, palette toggle, search, tabs) being ported

## License

MIT, matching upstream zensical/ui.
