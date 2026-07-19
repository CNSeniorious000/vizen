---
icon: lucide/settings
---
# Configuration

`vizen serve` / `vizen build` auto-discovers config in the project root, preferring **`vizen.toml`** (the native format) and falling back to **`mkdocs.yml`** / `mkdocs.yaml` for drop-in compatibility with existing Material for MkDocs projects.

## `vizen.toml` (recommended)

```toml
site_name = "My Docs"
site_description = "Built with vizen"
docs_dir = "docs"

[theme]
name = "material"
variant = "modern"
features = ["navigation.instant", "navigation.tabs"]

[[nav]]
title = "Home"
url = "index.md"

[[nav]]
title = "Getting Started"

  [[nav.children]]
  title = "Overview"
  url = "getting-started/index.md"
```

## `mkdocs.yml` (compatible)

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
```

Both formats parse to the **same** internal structure, so nav rendering, active-state highlighting, and prev/next footer links behave identically.

## Nav shape

| Case | `vizen.toml` | `mkdocs.yml` |
| --- | --- | --- |
| Page | `[[nav]]` + `title` + `url` | `- Title: path.md` |
| Section | `[[nav]]` + `title` + `[[nav.children]]` | `- Section:` + indented list |

## Markdown

Admonitions (a Material for MkDocs signature) are supported:

```markdown
!!! note "Tip"
    This admonition body is parsed as markdown.
```
