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
  // Admonitions are a mkdocs-material signature: `!!! type "title"` followed by an
  // indented block. We register a marked block extension so the indented body is parsed
  // as markdown (lists, code, etc.) inside the admonition.
  marked.use({ extensions: [admonitionExtension] });
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
    // mkdocs convention: the H1 is the page title, not a toc entry. Toc starts at H2.
    if (level === 1) continue;
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

// --- admonition extension -------------------------------------------------
// mkdocs-material syntax:
//   !!! type "optional title"
//       indented markdown body
// Renders to <div class="admonition type"><p class="admonition-title">title</p>body</div>.
// The body is parsed as markdown so lists/code/links inside admonitions work.
import type { TokenizerExtension, RendererExtension } from "marked";

interface AdmonitionToken { type: string; raw: string; admType: string; title: string | null; body: string; }

const admonitionExtension: TokenizerExtension & RendererExtension = {
  name: "admonition",
  level: "block",
  start(src: string) { return src.indexOf("!!!"); },
  tokenizer(src: string): AdmonitionToken | undefined {
    // Match: !!! type ["title"]  then indented lines (4+ spaces or tab).
    const m = /^!!! *([\w-]+)(?: +"([^"]*)")? *\n((?:    |\t).*\n?)+/.exec(src);
    if (!m) return undefined;
    const raw = m[0];
    const admType = m[1];
    const title = m[2] ?? null;
    // Dedent the body (strip leading 4 spaces / 1 tab) so marked parses it as normal md.
    const body = m[0]
      .slice(m[0].indexOf("\n") + 1)
      .split("\n")
      .map((line) => line.replace(/^    |\t/, ""))
      .join("\n");
    return { type: "admonition", raw, admType, title, body };
  },
  renderer(token): string {
    const t = token as unknown as AdmonitionToken;
    // Synchronously render the body — admonitions are small and we're already in the
    // marked pipeline. marked.parse with async:false returns a string.
    const inner = marked.parse(t.body, { async: false }) as string;
    const titleHtml = t.title
      ? `<p class="admonition-title">${t.title}</p>`
      : "";
    return `<div class="admonition ${t.admType}">${titleHtml}${inner}</div>`;
  },
};
