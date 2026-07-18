import { describe, it, expect, beforeEach, vi, afterEach } from "vitest";
import { createNavigator } from "./index.ts";
import { ISLAND_ATTR } from "../island.ts";

// Client-side navigation contract:
//   - clicking an in-app link never does a full reload
//   - only the islands whose content changed get swapped
//   - history.pushState is called, title updates
//   - preload on hover populates a cache; a subsequent click is fromCache=true
//   - external / modifier-key / download links fall through to the browser

function pageHtml(title: string, contentText: string, headerText = "Site") {
  return `<!doctype html><html><head><title>${title}</title></head><body>
    <div ${ISLAND_ATTR}="header"><span class="title">${headerText}</span></div>
    <div ${ISLAND_ATTR}="content"><p>${contentText}</p></div>
  </body></html>`;
}

function setupCurrentPage() {
  // jsdom's default URL is http://localhost/ — rely on it rather than overriding the
  // read-only window.location.
  document.body.innerHTML = `
    <div ${ISLAND_ATTR}="header"><span class="title">Site</span></div>
    <div ${ISLAND_ATTR}="content"><p>home</p></div>
    <a href="/page-a/">Page A</a>
    <a href="/page-b/">Page B</a>
    <a href="https://external.example/">External</a>
  `;
}

describe("client-side navigation", () => {
  let fetchMock: ReturnType<typeof vi.fn>;
  let pushState: ReturnType<typeof vi.fn>;
  let replaceState: ReturnType<typeof vi.fn>;

  beforeEach(() => {
    setupCurrentPage();
    fetchMock = vi.fn();
    pushState = vi.fn();
    replaceState = vi.fn();
    Object.defineProperty(window, "history", {
      value: { pushState, replaceState, scrollRestoration: "auto" },
      writable: true,
    });
    globalThis.fetch = fetchMock as unknown as typeof fetch;
  });

  afterEach(() => vi.restoreAllMocks());

  it("fetches the target HTML with the navigate header", async () => {
    fetchMock.mockResolvedValueOnce({ ok: true, text: async () => pageHtml("Page A", "a-content") });
    const nav = createNavigator();
    await nav.go("/page-a/");
    expect(fetchMock).toHaveBeenCalledWith(
      expect.stringMatching(/\/page-a\/$/),
      expect.objectContaining({ headers: expect.objectContaining({ "X-Zensical-Navigate": "1", Accept: "text/html" }) })
    );
  });

  it("swaps only the islands whose content changed", async () => {
    // Header is identical ("Site"); content differs.
    fetchMock.mockResolvedValueOnce({ ok: true, text: async () => pageHtml("Page A", "a-content", "Site") });
    const nav = createNavigator();
    const result = await nav.go("/page-a/");
    expect(result.swapped).toEqual(["content"]);
    expect(document.querySelector(`${"[data-md-component='content']"} p`)?.textContent).toBe("a-content");
    // Header untouched — same node, not replaced.
    expect(document.querySelector(".title")?.textContent).toBe("Site");
  });

  it("updates the document title and calls pushState", async () => {
    fetchMock.mockResolvedValueOnce({ ok: true, text: async () => pageHtml("Page A", "a-content") });
    const nav = createNavigator();
    await nav.go("/page-a/");
    expect(document.title).toBe("Page A");
    expect(pushState).toHaveBeenCalledTimes(1);
  });

  it("serves from preload cache when prefetch ran first", async () => {
    fetchMock.mockResolvedValueOnce({ ok: true, text: async () => pageHtml("Page B", "b-content") });
    const nav = createNavigator();
    await nav.prefetch("/page-b/");
    // Second fetch should NOT happen — cache hit.
    const result = await nav.go("/page-b/");
    expect(result.fromCache).toBe(true);
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  it("falls back to a hard navigation for external links", async () => {
    const nav = createNavigator();
    // External links must NOT go through the fetch/diff path. jsdom warns "Not
    // implemented: navigation" but does not throw, so go() returns normally.
    const result = await nav.go("https://external.example/").catch(() => null);
    expect(fetchMock).not.toHaveBeenCalled();
    expect(result?.swapped ?? []).toEqual([]);
  });

  it("intercepts clicks on internal links and prevents default", async () => {
    fetchMock.mockResolvedValueOnce({ ok: true, text: async () => pageHtml("Page A", "a-content") });
    createNavigator();
    const link = document.querySelector('a[href="/page-a/"]') as HTMLAnchorElement;
    const ev = new MouseEvent("click", { bubbles: true, cancelable: true, button: 0 });
    link.dispatchEvent(ev);
    expect(ev.defaultPrevented).toBe(true);
    // Let the microtask queue flush.
    await Promise.resolve();
    await Promise.resolve();
    expect(fetchMock).toHaveBeenCalled();
  });

  it("does not intercept clicks with modifier keys", () => {
    createNavigator();
    const link = document.querySelector('a[href="/page-a/"]') as HTMLAnchorElement;
    const ev = new MouseEvent("click", { bubbles: true, cancelable: true, metaKey: true });
    link.dispatchEvent(ev);
    expect(ev.defaultPrevented).toBe(false);
  });
});
