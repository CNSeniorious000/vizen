# Markdown syntax

vizen supports the full zensical (Material for MkDocs) markdown extension set. This page is
both a reference and a **smoke test** — every construct here is rendered by vizen's own
markdown pipeline, so if it looks right, the pipeline works.

## Admonitions

`!!! type "title"` opens a colored callout. The body is indented markdown.

!!! note "Notes are blue"
    This is a note admonition. You can put **bold**, *italic*, `code`, and even lists inside.

    - Lists work
    - [Links](https://example.com) work

!!! warning "Warnings are orange"
    Watch out for this.

!!! tip "Tips are green"
    Here's a helpful tip.

## Collapsible details

`??? "title"` renders a `<details>` block the user can expand. `???+` opens it by default.

??? "Collapsed by default"
    Click to expand. The body is markdown too.

???+ "Open by default"
    This one starts expanded.

## Task lists

GFM task lists with checkboxes:

- [x] Implement HMR
- [x] Implement client-side navigation
- [ ] Take over the world

## Code blocks with syntax highlighting

Fenced code blocks are highlighted with highlight.js, using zensical/ui's material palette.

```ts
interface Island { name: string; render: (props: unknown) => VNode }
const header: Island = { name: "header", render: (p) => h("nav", null, p) };
```

```toml
[theme]
name = "material"
features = ["navigation.tabs", "content.code.copy"]
```

## Keyboard keys

`++ctrl+c++` renders styled keyboard keys: press ++ctrl+c++ to copy, ++enter++ to submit.

## Headings with permalinks

Every heading has a `¶` anchor link on hover — click it to get a deep link to this section.

## Footnotes

Footnotes are inline references[^1] that link to a note at the bottom of the page[^2].

[^1]: This is the first footnote.
[^2]: And the second one, with **markdown** inside.

## Tables

| Feature | Status | Notes |
|---------|:------:|-------|
| HMR | ✅ | Island-level |
| Client nav | ✅ | SPA + SSR |
| Search | ✅ | Client-side |

## Blockquotes

> Design is not just what it looks like and feels like. Design is how it works.
>
> — Steve Jobs
