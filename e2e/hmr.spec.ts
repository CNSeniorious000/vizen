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
  // Replace the footer renderer (between the START/END markers) with one that emits a
  // fixed marker in .md-footer-meta__inner, so we can assert the hot update took effect.
  const replacement = `runtime.hmr?.register("footer", () => h("footer", { class: "md-footer" }, h("div", { class: "md-footer-meta md-typeset" }, h("div", { class: "md-footer-meta__inner md-grid" }, ${JSON.stringify(text)}))));`;
  const next = src.replace(
    /\/\/ FOOTER-RENDERER-START[\s\S]*?\/\/ FOOTER-RENDERER-END/,
    `// FOOTER-RENDERER-START\n${replacement}\n// FOOTER-RENDERER-END`
  );
  await writeFile(MAIN_TS, next);
}

test.describe("HMR", () => {
  test("changing a renderer hot-updates only that island", async ({ page }: { page: Page }) => {
    await page.goto("/");
    // Wait for the runtime to hydrate.
    await expect(page.locator('[data-md-component="footer"] .md-footer-meta__inner')).toHaveText("Zensical Fixture");

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
    await expect(page.locator('[data-md-component="footer"] .md-footer-meta__inner')).toHaveText("HMR Updated Footer", { timeout: 10_000 });

    // The header island kept its DOM identity (marker survived) — HMR didn't touch it.
    const headerMarker = await page.evaluate(() => document.querySelector('[data-md-component="header"]')?.getAttribute("data-hmr-marker"));
    expect(headerMarker).toBe("survived");

    // No full page reload — JS state survived.
    const jsMarker = await page.evaluate(() => (window as unknown as { __hmrMarker?: number }).__hmrMarker);
    expect(jsMarker).toBe(1);
  });

  // Restore the source after the suite so the working tree is clean. Using git restore is
  // more robust than regex-matching the renderer back, since the renderer may span lines.
  test.afterAll(async () => {
    const { execSync } = await import("node:child_process");
    try {
      execSync("git checkout -- packages/runtime/src/main.ts", { stdio: "ignore" });
    } catch {
      // Not in git or file unchanged — nothing to restore.
    }
  });
});
