import { test, expect, type Page } from "@playwright/test";
import { readFile, writeFile } from "node:fs/promises";
import { join } from "node:path";

// HMR E2E — the first non-negotiable feature, verified in a real browser.
// When a source file changes, Vite pushes a hot update; the runtime re-renders ONLY the
// affected island. The rest of the DOM (other islands, user state) is preserved, and no
// full page reload occurs.

const MAIN_TS = join(process.cwd(), "packages/runtime/src/main.ts");

async function patchFooter(text: string) {
  const src = await readFile(MAIN_TS, "utf8");
  // The footer renderer renders site_name into .md-footer__title. Swap in a marker we
  // can assert, by replacing the footer renderer's title expression.
  const next = src.replace(
    /runtime\.hmr\?\.register\("footer"[\s\S]*?\);\s*\}\);/,
    `runtime.hmr?.register("footer", (props) => { const p = props as { site_name?: string }; return h("footer", { class: "md-footer" }, h("div", { class: "md-footer__title" }, ${JSON.stringify(text)})); });`
  );
  await writeFile(MAIN_TS, next);
}

test.describe("HMR", () => {
  test("changing a renderer hot-updates only that island", async ({ page }: { page: Page }) => {
    await page.goto("/");
    // Wait for the runtime to hydrate.
    await expect(page.locator('[data-md-component="footer"] .md-footer__title')).toHaveText("Zensical Fixture");

    // Mark the header node so we can prove it survives the hot update (same element).
    await page.evaluate(() => {
      const el = document.querySelector('[data-md-component="header"]');
      el?.setAttribute("data-hmr-marker", "survived");
    });
    // Set a JS-side marker to prove no full reload.
    await page.evaluate(() => { (window as unknown as { __hmrMarker: number }).__hmrMarker = 1; });

    // Patch the footer renderer and let Vite push the hot update.
    await patchFooter("HMR Updated Footer");
    // Give Vite's HMR a moment to compile + push + the runtime to re-render.
    await expect(page.locator('[data-md-component="footer"] .md-footer__title')).toHaveText("HMR Updated Footer", { timeout: 10_000 });

    // The header island kept its DOM identity (marker survived) — HMR didn't touch it.
    const headerMarker = await page.evaluate(() => document.querySelector('[data-md-component="header"]')?.getAttribute("data-hmr-marker"));
    expect(headerMarker).toBe("survived");

    // No full page reload — JS state survived.
    const jsMarker = await page.evaluate(() => (window as unknown as { __hmrMarker?: number }).__hmrMarker);
    expect(jsMarker).toBe(1);
  });

  // Restore the source after the suite so the working tree is clean.
  test.afterAll(async () => {
    // Re-read and normalize: replace any patched footer renderer with the original title.
    const src = await readFile(MAIN_TS, "utf8");
    const restored = src.replace(
      /runtime\.hmr\?\.register\("footer"[\s\S]*?\);\s*\}\);/,
      `runtime.hmr?.register("footer", (props) => { const p = props as { site_name?: string }; return h("footer", { class: "md-footer" }, h("div", { class: "md-footer__title" }, p.site_name ?? "")); });`
    );
    await writeFile(MAIN_TS, restored);
  });
});
