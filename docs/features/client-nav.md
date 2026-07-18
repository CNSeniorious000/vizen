# Client-side Navigation

vizen's client-side navigation is **on by default** — no opt-in flag, no per-link annotation. Clicking an in-app link loads only the diff and renders it. SPA + SSR by default, never a full MPA reload.

## How it works

1. **Intercept**: clicks on same-origin `<a>` links (without modifier keys, `target="_blank"`, or `download`) are intercepted.
2. **Fetch**: the target's SSR HTML is fetched with an `X-Vizen-Navigate: 1` header.
3. **Diff**: each **leaf island** (one with no island descendants) is compared by serialized content. Only islands whose content actually changed are swapped.
4. **History**: `history.pushState` updates the URL; `scrollRestoration` is set to `manual` so vizen owns scroll position.
5. **Scripts**: inline `<script>` inside a swapped island are re-created so the browser executes them (cloneNode'd scripts don't run).

## Preload (sveltekit-preload-data style)

On `hover`, `focus`, `touchstart`, and `pointerdown`, the destination is prefetched into an LRU cache. By the time you click, the response is usually already cached — navigation is effectively instant.

## What's preserved

- Islands whose content didn't change — same DOM nodes, same state
- Scroll position (for `replaceState`) or scroll-to-top (for `pushState`)
- JS state (no full reload, so `window` state survives)

## Edge cases

- **External links** fall through to the browser (hard navigation).
- **`target="_blank"`**, **`download`**, **`mailto:`** links are not intercepted.
- **Modifier keys** (meta/ctrl/shift/alt) and **middle-click** open new tabs — not intercepted.
- **Hash links** on the same page let the browser handle scroll.
- **`popstate`** (back/forward) restores the previous page via the same diff path.
