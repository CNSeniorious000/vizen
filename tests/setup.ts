// jsdom lacks a few things the runtime touches. Polyfill them here so tests run clean.
import { beforeAll } from "vitest";

beforeAll(() => {
  // jsdom doesn't implement scrollTo / matchMedia / performance.now reliably.
  if (!window.scrollTo) window.scrollTo = () => {};
  if (!window.matchMedia) {
    window.matchMedia = (q: string) => ({ matches: false, media: q, addEventListener() {}, removeEventListener() {} }) as unknown as MediaQueryList;
  }
  // DOMParser is present in jsdom but ensure it's the global one.
  if (typeof globalThis.DOMParser === "undefined") {
    // jsdom ships DOMParser; expose if hidden.
  }
});
