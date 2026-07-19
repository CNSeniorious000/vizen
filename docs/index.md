---
icon: lucide/home
---
# vizen

A modern static site generator with **perfect HMR** and **client-side navigation** — a TypeScript port of [zensical](https://github.com/zensical/zensical) (by the Material for MkDocs team), rebuilt on Vite 8 + Bun.

## Why

Two things matter for a docs site's developer experience, and vizen gets both right by default — no opt-in, no configuration:

1. **Perfect HMR** — change a component, only that spot refreshes in the browser. The rest of the DOM (other islands, scroll, drawer toggles, focus, in-flight interactions) is preserved.
2. **Client-side navigation** — clicking an in-app link loads only the diff and renders it. SPA + SSR by default, never a full MPA reload.

The UI reuses [zensical/ui](https://github.com/zensical/ui)'s SCSS verbatim, so the look is identical to Material for MkDocs.

## Quick start

```sh
bun add vizen
```

Create a `vizen.toml`:

```toml
site_name = "My Docs"
docs_dir = "docs"

[theme]
name = "material"
variant = "modern"
features = ["navigation.instant", "navigation.tabs"]

[[nav]]
title = "Home"
url = "index.md"
```

Run the dev server:

```sh
vizen serve --port 5183
```

Build a static site:

```sh
vizen build
```

## What's in the box

- **SSG core**: config (`vizen.toml` + `mkdocs.yml`), markdown (with admonitions), nav (active state + prev/next), toc, SSR
- **HMR**: island-level hot update, DOM state preserved
- **Client-side navigation**: island diff, preload cache, popstate, scroll restoration
- **UI**: zensical/ui SCSS (modern variant) + header/nav/footer partials

!!! note "This site is built with vizen"
    The page you're reading is rendered by vizen itself — `vizen serve` on this repo's `docs/` directory.
