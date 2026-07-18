// Nav + toc building. TS port of mkdocs-material's nav/toc logic.

import type { Config, NavItem } from "../config/index.ts";
import type { TocItem } from "../markdown/index.ts";

export type Nav = NavNode[];

export interface NavNode {
  title: string;
  url?: string;
  children?: NavNode[];
  active?: boolean;
}

export type Toc = TocItem[];

/** Build the site nav from config.nav (if present) or by walking docs_dir.
 *  `currentUrl` marks the active page (and its ancestor sections) so the sidebar can
 *  highlight the user's location — a core navigation UX requirement. */
export function buildNav(config: Config, pages: PageRef[], currentUrl?: string): Nav {
  const nav = config.nav ? buildFromConfigNav(config.nav, pages) : buildFromPages(pages);
  if (currentUrl !== undefined) markActive(nav, normalizeUrl(currentUrl));
  return nav;
}

export interface PageRef {
  path: string; // e.g. "getting-started/index.md"
  url: string; // e.g. "getting-started/"
  title: string;
}

/** Mark the node whose url matches `current` as active, and propagate active up to ancestor
 *  sections (so a section containing the current page is also marked active/expanded). */
function markActive(nodes: NavNode[], current: string): boolean {
  let anyActive = false;
  for (const n of nodes) {
    const childActive = n.children ? markActive(n.children, current) : false;
    const selfActive = n.url !== undefined && normalizeUrl(n.url) === current;
    n.active = selfActive || childActive;
    if (n.active) anyActive = true;
  }
  return anyActive;
}

function normalizeUrl(url: string): string {
  // Normalize for comparison: ensure a trailing slash, strip leading slash.
  let u = url.startsWith("/") ? url.slice(1) : url;
  if (u && !u.endsWith("/") && !/\.[^/]*$/.test(u)) u += "/";
  return u;
}

function buildFromConfigNav(items: NavItem[], pages: PageRef[]): Nav {
  return items.map((item) => toNode(item, pages));
}

function toNode(item: NavItem, pages: PageRef[]): NavNode {
  // Bare path: "- index.md"
  if (typeof item === "string") {
    const page = pages.find((p) => p.path === item);
    return { title: page?.title ?? item, url: page?.url };
  }
  // Title-keyed: { "Title": <path | [children]> }
  const [title, value] = Object.entries(item)[0]!;
  // { "Home": "index.md" } — single page with a custom title.
  if (typeof value === "string") {
    const page = pages.find((p) => p.path === value);
    return { title, url: page?.url };
  }
  // { "Section": [children] } — nested section.
  return { title, children: (value as NavItem[]).map((c) => toNode(c, pages)) };
}

function buildFromPages(pages: PageRef[]): Nav {
  return pages.map((p) => ({ title: p.title, url: p.url }));
}

/** Build the right-hand toc from a page's headings, honoring the toc.integrate feature. */
export function buildToc(headings: TocItem[], features: string[] = []): Toc {
  if (features.includes("toc.integrate")) return [];
  return headings;
}

/** Flatten the nav into an ordered list of leaf pages (depth-first). Used to compute
 *  prev/next links for the footer. */
export function flattenNav(nav: Nav): NavNode[] {
  const out: NavNode[] = [];
  for (const n of nav) {
    // A node with a url (even "") is a leaf page; sections (no url) are skipped.
    if (n.url !== undefined) out.push(n);
    if (n.children) out.push(...flattenNav(n.children));
  }
  return out;
}

/** Find the previous and next page relative to `currentUrl`, for footer navigation. */
export function prevNext(nav: Nav, currentUrl: string): { prev?: NavNode; next?: NavNode } {
  const flat = flattenNav(nav);
  const current = normalizeUrl(currentUrl);
  const idx = flat.findIndex((n) => n.url !== undefined && normalizeUrl(n.url) === current);
  if (idx < 0) return {};
  return { prev: idx > 0 ? flat[idx - 1] : undefined, next: idx < flat.length - 1 ? flat[idx + 1] : undefined };
}
