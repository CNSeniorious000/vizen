// Client-side search. mkdocs-material ships a lunr-based web worker; vizen uses a lighter
// approach: build emits search.json (one doc per page: title + url + text), and the
// runtime loads it lazily on first search, then filters client-side. For a docs site's
// size this is instant and avoids a worker + index dependency.

interface SearchDoc { title: string; url: string; text: string }

let docsPromise: Promise<SearchDoc[]> | null = null;

async function loadDocs(): Promise<SearchDoc[]> {
  if (!docsPromise) {
    // Cache the promise so concurrent keystrokes share one fetch.
    docsPromise = fetch("search.json").then((r) => r.ok ? r.json() as Promise<SearchDoc[]> : []).catch(() => []);
  }
  return docsPromise;
}

/** Score a doc against a query: count of query-term occurrences in title (weighted) +
 *  text. Simple substring matching — good enough for small corpora, no stemming needed. */
function score(doc: SearchDoc, terms: string[]): number {
  let s = 0;
  for (const term of terms) {
    if (!term) continue;
    const t = doc.title.toLowerCase();
    const b = doc.text.toLowerCase();
    const titleHits = t.includes(term) ? 1 : 0;
    const bodyHits = b.split(term).length - 1;
    s += titleHits * 10 + bodyHits;
  }
  return s;
}

function renderResults(container: Element, query: string, docs: SearchDoc[]): void {
  const terms = query.toLowerCase().split(/\s+/).filter(Boolean);
  if (!terms.length) { container.innerHTML = ""; return; }
  const scored = docs.map((d) => ({ d, s: score(d, terms) })).filter((x) => x.s > 0).sort((a, b) => b.s - a.s).slice(0, 20);
  if (!scored.length) {
    container.innerHTML = `<div class="md-search-result__meta">No matching documents</div>`;
    return;
  }
  container.innerHTML = scored.map(({ d }) => {
    // Snippet: first ~120 chars of text around the first term hit.
    const lower = d.text.toLowerCase();
    const idx = terms.map((t) => lower.indexOf(t)).filter((i) => i >= 0).sort((a, b) => a - b)[0] ?? 0;
    const start = Math.max(0, idx - 60);
    const snippet = (start > 0 ? "…" : "") + d.text.slice(start, start + 160).trim() + "…";
    return `<a href="${normalizeUrl(d.url)}" class="md-search-result__link"><div class="md-search-result__title">${esc(d.title)}</div><div class="md-search-result__teardown">${esc(snippet)}</div></a>`;
  }).join("");
}

function esc(s: string): string {
  return s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
}

/** Normalize a search-doc url to an absolute directory path (leading + trailing slash)
 *  so the result link resolves from any page. search.json stores bare paths like
 *  "features/hmr"; clicking that from /getting-started/ would resolve wrong without this. */
function normalizeUrl(url: string): string {
  if (url === "") return "/";
  const withSlash = url.endsWith("/") || /\.[^/]*$/.test(url) ? url : `${url}/`;
  return withSlash.startsWith("/") ? withSlash : `/${withSlash}`;
}

/** Wire the search overlay: on input, load docs (once) + filter. The overlay is toggled
 *  by the __search checkbox (header magnify label); we only attach the input handler. */
export function mountSearch(): void {
  const input = document.querySelector(".md-search__input") as HTMLInputElement | null;
  const result = document.querySelector('[data-md-component="search-result"]');
  if (!input || !result) return;
  let docs: SearchDoc[] | null = null;
  input.addEventListener("input", async () => {
    if (!docs) docs = await loadDocs();
    renderResults(result, input.value, docs);
  });
  // Enter → navigate to the first result.
  input.addEventListener("keydown", (e) => {
    if (e.key !== "Enter") return;
    const first = result.querySelector<HTMLAnchorElement>(".md-search-result__link");
    if (first) first.click();
  });
}
