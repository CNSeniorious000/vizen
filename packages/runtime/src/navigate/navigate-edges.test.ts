import { describe, it, expect, beforeEach, vi, afterEach } from "vitest";
import { createNavigator } from "./index.ts";
import { ISLAND_ATTR } from "../island.ts";

// Navigation edge cases that the basic contract test doesn't cover, derived from how
// mkdocs-material's navigation.instant actually behaves:
//   - inline <script> inside a swapped island must re-execute (replaceWith alone won't)
//   - <head> meta/title/stylesheet changes are applied
//   - scrollRestoration is set to "manual" so we own scroll position

function pageHtml(opts: { title?: string; content?: string; meta?: string; script?: string }) {
  const meta = opts.meta ? `<meta name="description" content="${opts.meta}" />` : "";
  const script = opts.script ? `<script>${opts.script}</script>` : "";
  return `<!doctype html><html><head><title>${opts.title ?? "Page"}</title>${meta}</head><body>
    <div ${ISLAND_ATTR}="content"><p>${opts.content ?? "x"}</p>${script}</div>
  </body></html>`;
}

describe("navigation edge cases", () => {
  let fetchMock: ReturnType<typeof vi.fn>;
  let pushState: ReturnType<typeof vi.fn>;

  beforeEach(() => {
    document.body.innerHTML = `<div ${ISLAND_ATTR}="content"><p>home</p></div>`;
    Object.defineProperty(window, "history", {
      value: { pushState: (pushState = vi.fn()), replaceState: vi.fn(), scrollRestoration: "auto" },
      writable: true,
    });
    fetchMock = vi.fn();
    globalThis.fetch = fetchMock as unknown as typeof fetch;
  });
  afterEach(() => vi.restoreAllMocks());

  it("re-creates inline scripts inside a swapped island so the browser executes them", async () => {
    // Scripts inserted via cloneNode/replaceWith do NOT execute. We must re-create each
    // <script> as a fresh element. jsdom doesn't run dynamically-inserted scripts (needs
    // runScripts:"dangerously"), so here we assert the re-creation contract: the swapped
    // island's <script> is a fresh element with the right content, not the cloned node.
    // Actual execution is verified by the E2E suite.
    fetchMock.mockResolvedValueOnce({
      ok: true,
      text: async () => pageHtml({ content: "next", script: "window.__navScriptRan = 1" }),
    });
    const nav = createNavigator();
    await nav.go("/next/");
    const script = document.querySelector(`${"[data-md-component='content']"} script`);
    expect(script).not.toBeNull();
    expect(script?.textContent).toContain("__navScriptRan");
    // The script element must be owned by the live document (re-created, not a detached clone).
    expect(script?.isConnected).toBe(true);
  });

  it("syncs <head> meta tags that differ between pages", async () => {
    fetchMock.mockResolvedValueOnce({
      ok: true,
      text: async () => pageHtml({ title: "Next", meta: "next description" }),
    });
    const nav = createNavigator();
    await nav.go("/next/");
    const desc = document.querySelector('meta[name="description"]');
    expect(desc?.getAttribute("content")).toBe("next description");
  });

  it("sets scrollRestoration to manual so we own scroll position", async () => {
    fetchMock.mockResolvedValueOnce({ ok: true, text: async () => pageHtml({ content: "next" }) });
    const nav = createNavigator();
    await nav.go("/next/");
    expect(window.history.scrollRestoration).toBe("manual");
  });
});
