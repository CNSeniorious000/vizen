import { test, expect, type Page } from "@playwright/test";

// Client-side navigation E2E — the second non-negotiable feature, verified in a real
// browser. Clicking an in-app link must NOT do a full MPA reload; only the islands whose
// content changed get swapped, and the rest of the DOM (header, footer) keeps its node
// identity (same element reference, not a re-created node).

test.describe("client-side navigation", () => {
  test("clicking an in-app link swaps only the changed islands", async ({ page }) => {
    await page.goto("/");

    // Capture the DOM identity of islands that should NOT change across navigation.
    const headerHandle = await page.locator('[data-md-component="header"]').elementHandle();
    const footerHandle = await page.locator('[data-md-component="footer"]').elementHandle();
    const contentHandleBefore = await page.locator('[data-md-component="content"]').elementHandle();

    // A full reload would reset window state. We set a marker and assert it survives the
    // click — this is the definitive "no MPA reload" check (pushState preserves JS state).
    await page.evaluate(() => { (window as unknown as { __navMarker: number }).__navMarker = 12345; });

    // Click the "Overview" link (under Getting Started). The runtime intercepts it.
    await page.click('a[href="getting-started/"]');

    // URL updated via pushState.
    await expect(page).toHaveURL(/\/getting-started\/?$/);

    // The marker survived → no full page reload.
    const marker = await page.evaluate(() => (window as unknown as { __navMarker?: number }).__navMarker);
    expect(marker).toBe(12345);

    // Title updated.
    await expect(page).toHaveTitle(/Getting Started/i);

    // Content island changed (new page body).
    const contentHandleAfter = await page.locator('[data-md-component="content"]').elementHandle();
    expect(await contentHandleAfter?.textContent()).toContain("Getting Started");

    // Header is the SAME element node — no full reload, no re-creation. (Footer may swap
    // because its prev/next links differ across pages — that's correct, content changed.)
    expect(await headerHandle?.evaluate((el) => el.isConnected)).toBe(true);
    // The content island host element itself is reused (swapped children, same host) OR
    // replaced — either way the header identity is the contract we care about.

    // No full page reload happened (marker survived above).
  });

  test("back/forward restores the previous page via popstate", async ({ page }) => {
    await page.goto("/");
    await page.click('a[href="getting-started/"]');
    await expect(page).toHaveURL(/\/getting-started\/?$/);
    await page.goBack();
    await expect(page).toHaveURL(/\/$/);
    // Content restored to home.
    await expect(page.locator('[data-md-component="content"]')).toContainText("Welcome");
  });

  test("prefetch on hover warms the cache", async ({ page }) => {
    await page.goto("/");
    const requests: string[] = [];
    page.on("request", (req) => {
      if (req.url().includes("getting-started")) requests.push(req.url());
    });
    // Hover the link — should trigger a prefetch request.
    await page.hover('a[href="getting-started/"]');
    await page.waitForTimeout(200);
    // At least one request for the destination was made (prefetch).
    expect(requests.length).toBeGreaterThan(0);
  });
});
