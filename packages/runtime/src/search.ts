// Client-side search, mirroring mkdocs-material's search component contract.
//
// mkdocs-material ships a lunr-based web worker; vizen uses a lighter approach: build
// emits search.json (one doc per page: title + url + text), and the runtime loads it
// lazily on first search, then filters client-side. For a docs site's size this is
// instant and avoids a worker + index dependency.
//
// The interaction model follows upstream `components/search/_/index.ts`:
//   - clicking any <a> inside the search dialog closes the dialog (the link's navigation
//     is handled separately by client-side nav)
//   - Enter on the query input clicks the first result
//   - Escape / Tab closes the dialog
//   - ArrowUp / ArrowDown moves focus through the results
//   - Ctrl/⌘+K (and f / s / /) opens the dialog

interface SearchDoc { title: string; url: string; text: string }

let docsPromise: Promise<SearchDoc[]> | null = null;

async function loadDocs(): Promise<SearchDoc[]> {
  if (!docsPromise) {
    // Cache the promise so concurrent keystrokes share one fetch. Absolute path so it
    // resolves from any page depth (a relative "search.json" on /getting-started/markdown/
    // would 404).
    docsPromise = fetch("/search.json").then((r) => r.ok ? r.json() as Promise<SearchDoc[]> : []).catch(() => []);
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
    // Snippet: first ~160 chars of text around the first term hit.
    const lower = d.text.toLowerCase();
    const idx = terms.map((t) => lower.indexOf(t)).filter((i) => i >= 0).sort((a, b) => a - b)[0] ?? 0;
    const start = Math.max(0, idx - 60);
    const snippet = (start > 0 ? "…" : "") + d.text.slice(start, start + 160).trim() + "…";
    return `<a href="${normalizeUrl(d.url)}" class="md-search-result__link" tabindex="-1"><div class="md-search-result__title">${esc(d.title)}</div><div class="md-search-result__teardown">${esc(snippet)}</div></a>`;
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

/** The focusable elements inside the search dialog, in tab order: the query input first,
 *  then every result link. Used by ArrowUp/ArrowDown to cycle focus. */
function focusable(input: HTMLInputElement, container: Element): HTMLElement[] {
  return [input, ...Array.from(container.querySelectorAll<HTMLAnchorElement>(".md-search-result__link"))];
}

/** Wire the search modal: load and filter docs on input, focus it when opened, and expose
 *  the same Ctrl/⌘+K, Escape, Enter, and arrow-key behavior as mkdocs-material. */
export function mountSearch(): void {
  const input = document.querySelector(".md-search__input") as HTMLInputElement | null;
  const toggle = document.getElementById("__search") as HTMLInputElement | null;
  const dialog = document.querySelector("[data-md-component=search]") as HTMLElement | null;
  const result = document.querySelector('[data-md-component="search-result"]');
  if (!input || !toggle || !dialog || !result) return;
  let docs: SearchDoc[] | null = null;

  const close = () => { toggle.checked = false; input.blur(); };
  const open = () => { toggle.checked = true; requestAnimationFrame(() => input.focus()); };

  // Focus the input when the dialog is opened (via the header label or ⌘K).
  toggle.addEventListener("change", () => { if (toggle.checked) requestAnimationFrame(() => input.focus()); });
  input.addEventListener("focus", () => { toggle.checked = true; });

  // Filter on input.
  input.addEventListener("input", async () => {
    if (!docs) docs = await loadDocs();
    renderResults(result, input.value, docs);
  });

  // Always close the dialog when a result link is clicked — mirrors upstream's
  // `fromEvent(el, "click").pipe(filter(target closest "a")).subscribe(setToggle false)`.
  // The link's navigation is handled by client-side nav (navigate/onLink); closing the
  // dialog here means the modal is gone by the time the new page renders.
  dialog.addEventListener("click", (e) => {
    if ((e.target as Element | null)?.closest?.("a")) close();
  });

  // Keyboard: Enter → first result; Escape/Tab → close; ArrowUp/Down → cycle results.
  input.addEventListener("keydown", (e) => {
    if (e.key === "Enter") {
      const first = result.querySelector<HTMLAnchorElement>(".md-search-result__link");
      if (first) first.click();
      return;
    }
    if (e.key === "Escape" || e.key === "Tab") { close(); return; }
    if (e.key !== "ArrowUp" && e.key !== "ArrowDown") return;
    e.preventDefault();
    const els = focusable(input, result);
    const active = document.activeElement as HTMLElement;
    const i = els.indexOf(active);
    const next = els[(i < 0 ? 0 : i + (e.key === "ArrowDown" ? 1 : els.length - 1)) % els.length];
    next?.focus();
  });

  // Global shortcuts: Ctrl/⌘+K, or f / s / / (when not typing in another field) open search.
  document.addEventListener("keydown", (e) => {
    if (e.key === "Escape" && toggle.checked) { close(); return; }
    if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === "k") { e.preventDefault(); open(); return; }
    if (e.metaKey || e.ctrlKey || e.altKey) return;
    const tag = (document.activeElement?.tagName ?? "").toLowerCase();
    if (tag === "input" || tag === "textarea" || tag === "select") return;
    if (e.key === "f" || e.key === "s" || e.key === "/") { e.preventDefault(); open(); }
  });
}
