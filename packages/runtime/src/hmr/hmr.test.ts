import { describe, it, expect, beforeEach } from "vitest";
import { h } from "preact";
import { createHmrClient } from "./index.ts";
import { ISLAND_ATTR } from "../island.ts";

// HMR contract: a hot update re-renders ONLY the touched island. Everything else — other
// islands, scroll position, drawer toggles, focus — is preserved bit-for-bit.

function setupDocument() {
  document.body.innerHTML = `
    <div ${ISLAND_ATTR}="header"><span class="title">Old Title</span></div>
    <div ${ISLAND_ATTR}="content"><p>hello</p></div>
    <input id="__drawer" type="checkbox" />
  `;
  // Simulate user state: drawer open, a custom data attribute on a non-updated node,
  // and focus inside the content island.
  (document.getElementById("__drawer") as HTMLInputElement).checked = true;
  document.querySelector(`${"[data-md-component='content']"} p`)?.setAttribute("data-user-state", "preserved");
  (document.querySelector(".title") as HTMLElement).focus();
}

describe("HMR client", () => {
  beforeEach(() => setupDocument());

  it("re-renders only the updated island", () => {
    const hmr = createHmrClient();
    hmr.register("header", () => h("div", null, h("span", { class: "title" }, "New Title")));
    hmr.register("content", () => h("div", null, h("p", null, "hello")));

    // Hot update: only the header island changed.
    hmr.apply({ island: "header" });

    expect(document.querySelector(".title")?.textContent).toBe("New Title");
    // Content island untouched.
    expect(document.querySelector(`${"[data-md-component='content']"} p`)?.textContent).toBe("hello");
  });

  it("preserves sibling islands and DOM state across a hot update", () => {
    const hmr = createHmrClient();
    hmr.register("header", () => h("div", null, h("span", { class: "title" }, "New Title")));
    hmr.register("content", () => h("div", null, h("p", null, "hello")));

    // Simulate user state AFTER initial mount: drawer open, a custom attr on content's <p>.
    (document.getElementById("__drawer") as HTMLInputElement).checked = true;
    document.querySelector(`${"[data-md-component='content']"} p`)?.setAttribute("data-user-state", "preserved");

    // Hot update touches ONLY the header island.
    hmr.apply({ island: "header" });

    // The drawer toggle state survives — HMR must not have reset the document.
    expect((document.getElementById("__drawer") as HTMLInputElement).checked).toBe(true);
    // The content island (not updated) keeps its user-set DOM state.
    expect(document.querySelector(`${"[data-md-component='content']"} p`)?.getAttribute("data-user-state")).toBe("preserved");
  });

  it("returns false when no renderer is registered for the island", () => {
    const hmr = createHmrClient();
    expect(hmr.apply({ island: "unknown" })).toBe(false);
  });

  it("hydrates the SSR markup in place on first register (no flash)", () => {
    const hmr = createHmrClient();
    // Before register, the SSR'd header span exists.
    expect(document.querySelector(".title")?.textContent).toBe("Old Title");
    hmr.register("header", () => h("div", null, h("span", { class: "title" }, "Hydrated")));
    // After hydration, the renderer's output takes over.
    expect(document.querySelector(".title")?.textContent).toBe("Hydrated");
  });
});
