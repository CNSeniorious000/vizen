# zensical-vite

A modern static site generator — a TypeScript port of [zensical](https://github.com/zensical/zensical) (by the Material for MkDocs team), rebuilt on **Vite 8 + Bun** with two non-negotiable features:

1. **Perfect HMR** — change one component, only that spot refreshes in the browser. The rest of the DOM (other islands, scroll, drawer toggles, focus, in-flight interactions) is preserved.
2. **Default client-side navigation** (sveltekit-preload-data style) — clicking an in-app link loads only the diff and renders it. SPA + SSR by default, never a full MPA reload.

The UI reuses [zensical/ui](https://github.com/zensical/ui)'s SCSS (modern variant) verbatim, so the look is identical to Material for MkDocs.

## Quick start

```sh
bun install

# dev server with HMR + client-nav (the whole point)
bun packages/core/src/cli/index.ts serve example --port 5183
# → http://localhost:5183

# build static site
bun packages/core/src/cli/index.ts build example

# tests
bunx vitest run              # unit tests
bunx playwright test          # E2E tests (chromium)
bunx tsc --noEmit             # typecheck
```

## Configuration

`zensical serve` / `zensical build` auto-discovers config in the project root, preferring **`zensical.toml`** (the native format) and falling back to **`mkdocs.yml`** / `mkdocs.yaml` / `zensical.yml` for drop-in compatibility with existing Material for MkDocs projects.

### `zensical.toml` (recommended)

```toml
site_name = "My Docs"
site_description = "Built with zensical-vite"
docs_dir = "docs"

[theme]
name = "material"
variant = "modern"
features = ["navigation.instant", "navigation.tabs"]

# Nav is a table array. Each entry is a page (title + url) or a section (title + children).
[[nav]]
title = "Home"
url = "index.md"

[[nav]]
title = "Getting Started"

  [[nav.children]]
  title = "Overview"
  url = "getting-started/index.md"

  [[nav.children]]
  title = "Installation"
  url = "getting-started/installation.md"
```

### `mkdocs.yml` (compatible)

```yaml
site_name: My Docs
docs_dir: docs
theme:
  name: material
  variant: modern
  features:
    - navigation.instant
    - navigation.tabs
nav:
  - Home: index.md
  - Getting Started:
      - Overview: getting-started/index.md
      - Installation: getting-started/installation.md
```

Both formats parse to the **same** internal `NavItem` structure, so nav rendering, active-state highlighting, and prev/next footer links behave identically. (Verified by `config.test.ts`: `JSON.stringify(toml.nav) === JSON.stringify(yml.nav)`.)

### Nav shape equivalence

| Case | `zensical.toml` | `mkdocs.yml` |
| --- | --- | --- |
| Page | `[[nav]]` + `title` + `url` | `- Title: path.md` |
| Section | `[[nav]]` + `title` + `[[nav.children]]` | `- Section:` + indented list |

### Markdown

Admonitions (a Material for MkDocs signature) are supported:

```markdown
!!! note "Tip"
    This admonition body is parsed as markdown (lists, code, links all work).
```

## Architecture

```
packages/
  core/      SSG: config (zensical.toml / mkdocs.yml) → markdown → nav/toc → SSR (Preact) → build/serve/watch
  runtime/   browser: HMR client + client-side navigator (island diff)
  ui/        Preact components + ported zensical/ui SCSS (61 files)
e2e/         playwright E2E (chromium): HMR + client-nav verified in real browser
```

### Islands — the unit of both HMR and client-nav

Every swappable region is a `<div data-md-component="X">` island (inherited from zensical/ui's anchor convention). The runtime:

- **HMR**: each island registers a Preact renderer. On a hot update, only the changed island's renderer re-invokes against its host — Preact reconciles, preserving unmounted subtrees and DOM state.
- **Client-nav**: clicking an in-app link fetches the target's SSR HTML, diffs each leaf island's serialized content, and swaps only the ones that changed. `history.pushState` + manual scroll restoration. Preload on hover/focus/touchstart warms an LRU cache.

## Status

- ✅ SSG core: config (`zensical.toml` + `mkdocs.yml`), markdown (with admonitions), nav (active state + prev/next), toc, SSR
- ✅ HMR: island-level hot update, DOM state preserved (E2E verified)
- ✅ Client-side navigation: island diff, preload cache, popstate, scroll restoration (E2E verified)
- ✅ zensical/ui SCSS ported (modern variant, 61 files) + header/nav/footer partials
- ✅ 41 unit + 4 E2E tests, all green
- 🚧 UI partials: full base.html partials (icons, palette toggle, search, tabs) being ported

## License

MIT, matching upstream zensical/ui.
