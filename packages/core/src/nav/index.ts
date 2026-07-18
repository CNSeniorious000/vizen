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

/** Build the site nav from config.nav (if present) or by walking docs_dir. */
export function buildNav(config: Config, pages: PageRef[]): Nav {
  if (config.nav) return buildFromConfigNav(config.nav, pages);
  return buildFromPages(pages);
}

export interface PageRef {
  path: string; // e.g. "getting-started/index.md"
  url: string; // e.g. "getting-started/"
  title: string;
}

function buildFromConfigNav(items: NavItem[], pages: PageRef[]): Nav {
  return items.map((item) => toNode(item, pages));
}

function toNode(item: NavItem, pages: PageRef[]): NavNode {
  if (typeof item === "string") {
    const page = pages.find((p) => p.path === item);
    return { title: page?.title ?? item, url: page?.url };
  }
  // Section: { "Title": [children] }
  const [title, children] = Object.entries(item)[0]!;
  return { title, children: (children as NavItem[]).map((c) => toNode(c, pages)) };
}

function buildFromPages(pages: PageRef[]): Nav {
  return pages.map((p) => ({ title: p.title, url: p.url }));
}

/** Build the right-hand toc from a page's headings, honoring the toc.integrate feature. */
export function buildToc(headings: TocItem[], features: string[] = []): Toc {
  if (features.includes("toc.integrate")) return [];
  return headings;
}
