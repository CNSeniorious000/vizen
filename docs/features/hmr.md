---
icon: lucide/flame
---
# HMR

vizen's HMR is **perfect**: when you change a component, only that spot refreshes in the browser. The rest of the DOM — other islands, scroll position, drawer toggles, focus, in-flight interactions — is preserved bit-for-bit.

## How it works

Every swappable region is a `<div data-md-component="X">` **island** (inherited from zensical/ui's anchor convention). Each island registers a Preact renderer.

On a hot update:

1. Vite pushes the changed module over its HMR WebSocket.
2. The runtime's HMR client (a module-level singleton) re-invokes **only** the changed island's renderer against its host element.
3. Preact reconciles the new vdom against the live tree — unchanged subtrees and their DOM state survive.

Because the host element is reused and Preact diffs (rather than rebuilding), the "only that spot refreshes" guarantee holds.

## What's preserved

- Other islands (header, nav, toc, footer) — same DOM nodes, same event handlers
- Scroll position
- Drawer / search toggle state
- Focus
- Any in-flight user interaction

## What triggers it

- Editing an island renderer in `packages/runtime/src/main.ts`
- Editing a component in `packages/ui/`
- Editing SCSS (Vite's CSS HMR)

## What does NOT trigger a full reload

Nothing — vizen self-accepts the runtime module so a renderer change never cascades to a full page reload.
