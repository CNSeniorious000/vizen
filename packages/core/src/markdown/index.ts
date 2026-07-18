// Markdown rendering. TS port of zensical's markdown pipeline (Python markdown lib +
// pymdown-extensions). We use `marked` as the core parser and layer mkdocs-material's
// extension semantics on top incrementally (Toc, admonitions, code highlighting, etc.).

import { marked } from "marked";
import { parse as parseYaml } from "yaml";

export interface MarkdownOptions {
  extensions?: string[];
  base?: string;
}

export interface MarkdownResult {
  html: string;
  toc: TocItem[];
  meta: Record<string, unknown>;
  title?: string;
}

export interface TocItem {
  level: number;
  slug: string;
  text: string;
  children?: TocItem[];
}

export async function renderMarkdown(src: string, _opts: MarkdownOptions = {}): Promise<MarkdownResult> {
  // Front matter (gray-matter style) — mkdocs convention.
  const { body, meta } = extractFrontMatter(src);
  const html = await marked.parse(body, { async: true });
  const toc = extractToc(body);
  const title = (meta.title as string | undefined) ?? firstHeading(body);
  return { html, toc, meta, title };
}

function extractFrontMatter(src: string): { body: string; meta: Record<string, unknown> } {
  const m = src.match(/^---\n([\s\S]*?)\n---\n?/);
  if (!m) return { body: src, meta: {} };
  return { body: src.slice(m[0].length), meta: parseYaml(m[1]) ?? {} };
}

function firstHeading(body: string): string | undefined {
  const m = body.match(/^#\s+(.+)$/m);
  return m?.[1].trim();
}

function extractToc(body: string): TocItem[] {
  const items: TocItem[] = [];
  const re = /^(#{1,6})\s+(.+)$/gm;
  let m: RegExpExecArray | null;
  while ((m = re.exec(body))) {
    const level = m[1].length;
    const text = m[2].trim();
    items.push({ level, slug: slugify(text), text });
  }
  return nestToc(items);
}

function slugify(text: string): string {
  return text.toLowerCase().replace(/[^\w\s-]/g, "").trim().replace(/\s+/g, "-");
}

function nestToc(flat: TocItem[]): TocItem[] {
  const root: TocItem[] = [];
  const stack: TocItem[] = [];
  for (const item of flat) {
    while (stack.length && stack[stack.length - 1].level >= item.level) stack.pop();
    if (stack.length) {
      const parent = stack[stack.length - 1];
      parent.children ??= [];
      parent.children.push(item);
    } else {
      root.push(item);
    }
    stack.push(item);
  }
  return root;
}
