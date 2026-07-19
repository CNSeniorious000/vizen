// Markdown rendering. TS port of zensical's markdown pipeline (Python markdown lib +
// pymdown-extensions). We use `marked` as the core parser and layer mkdocs-material's
// extension semantics on top incrementally (Toc, admonitions, code highlighting, etc.).

import { Marked } from "marked";
import { markedHighlight } from "marked-highlight";
import hljs from "highlight.js";
import { parse as parseYaml } from "yaml";

export interface MarkdownOptions {
  extensions?: Record<string, unknown>;
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

// The Marked instance is configured at the bottom of the file (after the extension
// consts are defined) — see `md`. renderMarkdown closes over it.

export async function renderMarkdown(src: string, _opts: MarkdownOptions = {}): Promise<MarkdownResult> {
  // Front matter (gray-matter style) — mkdocs convention.
  const { body, meta } = extractFrontMatter(src);
  // Footnotes: extract `[^id]: text` definitions, replace `[^id]` references with
  // <sup> links, and append the definitions as a footnotes section after parsing.
  const { body: bodyNoFn, footnotes } = extractFootnotes(body);
  let html = await md.parse(bodyNoFn, { async: true });
  if (footnotes.length) html += renderFootnotes(footnotes);
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

// --- footnotes (markdown.extensions.footnotes) ----------------------------
// `[^id]: text` lines are definitions; `[^id]` inline is a reference. We pull defs out
// before parsing (so they don't render as stray text), replace refs with <sup> links,
// and append a <footer class="footnotes"> list after the main HTML.
interface Footnote { id: string; text: string }

function extractFootnotes(body: string): { body: string; footnotes: Footnote[] } {
  const footnotes: Footnote[] = [];
  // Definition: a line starting with [^id]: followed by text (possibly continued on
  // indented lines, but we take the single line for simplicity).
  const defRe = /^\[\^([^\]]+)\]:\s*(.+)$/gm;
  let withoutDefs = body.replace(defRe, (_m, id: string, text: string) => {
    footnotes.push({ id, text: text.trim() });
    return "";
  });
  // Reference: [^id] inline → <sup><a href="#fn-id">n</a></sup>. Number by order of first
  // reference appearance so the superscripts read 1, 2, 3…
  const seen = new Map<string, number>();
  let n = 0;
  withoutDefs = withoutDefs.replace(/\[\^([^\]]+)\]/g, (_m, id: string) => {
    if (!seen.has(id)) seen.set(id, ++n);
    const num = seen.get(id)!;
    return `<sup class="footnote-ref"><a href="#fn-${slugify(id)}" id="fnref-${slugify(id)}">${num}</a></sup>`;
  });
  // Keep only footnotes that were actually referenced.
  const referenced = footnotes.filter((f) => seen.has(f.id));
  return { body: withoutDefs, footnotes: referenced };
}

function renderFootnotes(footnotes: Footnote[]): string {
  const items = footnotes.map((f) => {
    const slug = slugify(f.id);
    // Render the definition text as inline markdown (links, bold, etc.).
    const text = md.parseInline(f.text) as unknown as string;
    return `<li class="footnote-item" id="fn-${slug}"><p>${text} <a href="#fnref-${slug}" class="footnote-back">↩</a></p></li>`;
  }).join("\n");
  return `<footer class="footnotes"><hr><ol>${items}</ol></footer>`;
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
    // marked pipeline. md.parse with async:false returns a string. Nested extensions
    // resolve because they're registered on the same instance.
    const inner = md.parse(t.body, { async: false }) as string;
    const titleHtml = t.title
      ? `<p class="admonition-title">${t.title}</p>`
      : "";
    return `<div class="admonition ${t.admType}">${titleHtml}${inner}</div>`;
  },
};

// --- details extension (pymdownx.details) ---------------------------------
// `??? "title"` + indented body → a collapsible <details> block. `???+` opens it by default.
interface DetailsToken { type: string; raw: string; title: string; body: string; open: boolean }
const detailsExtension: TokenizerExtension & RendererExtension = {
  name: "details",
  level: "block",
  start(src: string) { return src.indexOf("???"); },
  tokenizer(src: string): DetailsToken | undefined {
    const m = /^\?\?\?(\+)? +"([^"]*)" *\n((?:    |\t).*\n?)+/.exec(src);
    if (!m) return undefined;
    const body = m[0].slice(m[0].indexOf("\n") + 1).split("\n").map((l) => l.replace(/^    |\t/, "")).join("\n");
    return { type: "details", raw: m[0], title: m[2], body, open: !!m[1] };
  },
  renderer(token): string {
    const t = token as unknown as DetailsToken;
    const inner = md.parse(t.body, { async: false }) as string;
    return `<details class="details"${t.open ? " open" : ""}><summary>${t.title}</summary>${inner}</details>`;
  },
};

// --- keys extension (pymdownx.keys) ----------------------------------------
// `++ctrl+c++` → <kbd>ctrl</kbd>+<kbd>c</kbd>. Splits on + so each key is its own kbd.
interface KeysToken { type: string; raw: string; keys: string[] }
const keysExtension: TokenizerExtension & RendererExtension = {
  name: "keys",
  level: "inline",
  start(src: string) { return src.indexOf("++"); },
  tokenizer(src: string): KeysToken | undefined {
    const m = /^\+\+([^+]+(?:\+[^+]+)*)\+\+/.exec(src);
    if (!m) return undefined;
    return { type: "keys", raw: m[0], keys: m[1].split("+").map((k) => k.trim()) };
  },
  renderer(token): string {
    const t = token as unknown as KeysToken;
    return t.keys.map((k) => `<kbd class="kbd">${esc(k)}</kbd>`).join("+");
  },
};

/** Strip inline markdown/HTML to a plain slug-able string. marked.parseInline returns
 *  HTML; we strip tags so the slug matches the visible heading text. */
function stripInline(html: string): string {
  return html.replace(/<[^>]+>/g, "");
}

function esc(s: string): string {
  return s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
}

// A single Marked instance configured once at module load. marked.use() mutates the
// instance, so calling it per-render would stack duplicate walkTokens (e.g. highlight.js
// running twice on the same code token → double-escaped output). Defined after the
// extension consts so they're in scope; the admonition/details renderers close over `md`
// so their nested body parsing shares the same extensions + highlighter.
const md = new Marked();
md.use(markedHighlight({
  langPrefix: "language-",
  highlight(code, lang) {
    const language = hljs.getLanguage(lang) ? lang : "plaintext";
    return hljs.highlight(code, { language }).value;
  },
}));
md.use({
  gfm: true, // tasklists (- [ ] / - [x]) + strikethrough
  extensions: [admonitionExtension, detailsExtension, keysExtension],
  renderer: {
    // tasklist: `- [ ]` / `- [x]` → a checkbox list item (pymdownx.tasklist). marked's
    // gfm emits <input type="checkbox" disabled>; we wrap the <li> with the class the
    // SCSS expects and reposition the checkbox before the text.
    listitem(item) {
      const text = item.text;
      const task = /^(<input[^>]*type="checkbox"[^>]*>)\s*/.exec(text);
      if (task) {
        return `<li class="task-list-item">${task[1]}${text.slice(task[0].length)}</li>\n`;
      }
      return false as never; // fall back to default renderer
    },
    // heading permalink: add an anchor link after each heading (toc.permalink = true).
    heading({ tokens, depth }) {
      const text = this.parser.parseInline(tokens) as unknown as string;
      const slug = slugify(stripInline(text));
      return `<h${depth} id="${slug}">${text}<a class="headerlink" href="#${slug}" title="Permanent link">&para;</a></h${depth}>\n`;
    },
  },
});
