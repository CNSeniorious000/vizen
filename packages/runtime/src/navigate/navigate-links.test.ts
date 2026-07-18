import { describe, it, expect, beforeEach, vi, afterEach } from "vitest";
import { createNavigator } from "./index.ts";
import { ISLAND_ATTR } from "../island.ts";

// Link-interception edge cases: which links the navigator claims vs lets fall through to
// the browser. Getting these right is the difference between "SPA everywhere" (broken
// external links) and "SPA only for in-app" (correct).

function pageHtml(content: string) {
  return `<!doctype html><html><head><title>P</title></head><body><div ${ISLAND_ATTR}="content"><p>${content}</p></div></body></html>`;
}

describe("link interception edge cases", () => {
  let fetchMock: ReturnType<typeof vi.fn>;

  beforeEach(() => {
    document.body.innerHTML = `
      <div ${ISLAND_ATTR}="content"><p>home</p></div>
      <a href="/page-a/" id="internal">Internal</a>
      <a href="/page-a/#section" id="hash">Hash</a>
      <a href="/page-a/" target="_blank" id="blank">Blank</a>
      <a href="/file.pdf" download id="download">Download</a>
      <a href="mailto:foo@bar.com" id="mailto">Mail</a>
    `;
    Object.defineProperty(window, "history", {
      value: { pushState: vi.fn(), replaceState: vi.fn(), scrollRestoration: "auto" },
      writable: true,
    });
    fetchMock = vi.fn();
    globalThis.fetch = fetchMock as unknown as typeof fetch;
  });
  afterEach(() => vi.restoreAllMocks());

  it("intercepts plain internal links", async () => {
    fetchMock.mockResolvedValueOnce({ ok: true, text: async () => pageHtml("a") });
    createNavigator();
    const ev = new MouseEvent("click", { bubbles: true, cancelable: true, button: 0 });
    document.getElementById("internal")!.dispatchEvent(ev);
    expect(ev.defaultPrevented).toBe(true);
  });

  it("does not intercept target=_blank links", () => {
    createNavigator();
    const ev = new MouseEvent("click", { bubbles: true, cancelable: true, button: 0 });
    document.getElementById("blank")!.dispatchEvent(ev);
    expect(ev.defaultPrevented).toBe(false);
  });

  it("does not intercept download links", () => {
    createNavigator();
    const ev = new MouseEvent("click", { bubbles: true, cancelable: true, button: 0 });
    document.getElementById("download")!.dispatchEvent(ev);
    expect(ev.defaultPrevented).toBe(false);
  });

  it("does not intercept mailto links", () => {
    createNavigator();
    const ev = new MouseEvent("click", { bubbles: true, cancelable: true, button: 0 });
    document.getElementById("mailto")!.dispatchEvent(ev);
    expect(ev.defaultPrevented).toBe(false);
  });

  it("does not intercept middle-click (button !== 0)", () => {
    createNavigator();
    const ev = new MouseEvent("click", { bubbles: true, cancelable: true, button: 1 });
    document.getElementById("internal")!.dispatchEvent(ev);
    expect(ev.defaultPrevented).toBe(false);
  });

  it("does not intercept shift-click (opens new window)", () => {
    createNavigator();
    const ev = new MouseEvent("click", { bubbles: true, cancelable: true, shiftKey: true });
    document.getElementById("internal")!.dispatchEvent(ev);
    expect(ev.defaultPrevented).toBe(false);
  });
});
