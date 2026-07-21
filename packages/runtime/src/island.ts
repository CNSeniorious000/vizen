// Island = a DOM region marked with `data-md-component="X"` (inherited from zensical/ui's
// anchor convention). Islands are the unit of both HMR and client-side navigation: a hot
// update or a route change only swaps the islands whose content changed, leaving the rest
// of the DOM (and all client state: scroll, drawer toggles, focus, etc.) untouched.

export const ISLAND_ATTR = "data-md-component" as const;

export const ISLAND_ID_ATTR = "data-md-island" as const;

/** The logical name of an island, taken from `data-md-component`. */
export function islandOf(el: Element | null): string | null {
  const host = el?.closest?.(`[${ISLAND_ATTR}]`);
  return host?.getAttribute(ISLAND_ATTR) ?? null;
}

/** A stable per-island id combining the component name + its position index, used as a
 *  hydration/HMR key so Preact reconciles by identity rather than re-creating nodes.
 *
 *  The index is the island's position among ALL islands with the same name in the
 *  document (not just among siblings) — two `toc` islands live in different parents
 *  (the secondary sidebar vs. the active nav leaf) but must still get distinct ids, or
 *  client-nav's leaf diff would match the wrong one and never swap the secondary toc. */
export function islandId(host: Element): string {
  const name = host.getAttribute(ISLAND_ATTR) ?? "unknown";
  const explicit = host.getAttribute(ISLAND_ID_ATTR);
  if (explicit) return `${name}::${explicit}`;
  const root = host.ownerDocument;
  const all = Array.from(root.querySelectorAll(`[${ISLAND_ATTR}="${name}"]`));
  const idx = all.indexOf(host);
  return idx >= 0 ? `${name}#${idx}` : name;
}
