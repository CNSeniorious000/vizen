import { test, expect } from "@playwright/test";

test.describe("search modal", () => {
  test("opens as a centered Zensical-style modal and supports keyboard controls", async ({ page }) => {
    await page.goto("/");
    await page.getByText("Search", { exact: true }).click();

    const input = page.locator(".md-search__input");
    const modal = page.locator(".md-search__inner");
    await expect(input).toBeFocused();
    await expect(modal).toBeVisible();

    const box = await modal.boundingBox();
    const viewport = page.viewportSize();
    expect(box).not.toBeNull();
    expect(viewport).not.toBeNull();
    expect(box!.width).toBeGreaterThan(630);
    expect(box!.width).toBeLessThan(675);
    expect(box!.height).toBeGreaterThan(470);
    expect(box!.height).toBeLessThan(510);
    expect(box!.x + box!.width / 2).toBeCloseTo(viewport!.width / 2, 0);
    expect(box!.y + box!.height / 2).toBeCloseTo(viewport!.height / 2, 0);

    await input.fill("installation");
    await expect(page.locator(".md-search-result__link").first()).toBeVisible();
    await page.keyboard.press("Escape");
    await expect(page.locator("#__search")).not.toBeChecked();
    await expect(modal).toHaveCSS("pointer-events", "none");

    await page.keyboard.press("ControlOrMeta+K");
    await expect(input).toBeFocused();
    await page.locator(".md-search__overlay").click({ position: { x: 10, y: 10 } });
    await expect(page.locator("#__search")).not.toBeChecked();
    await expect(modal).toHaveCSS("pointer-events", "none");
  });

  test("stays functional after client-side navigation", async ({ page }) => {
    await page.goto("/");
    await page.getByRole("link", { name: "Getting Started", exact: true }).first().click();
    await expect(page).toHaveURL(/\/getting-started\/$/);

    await page.keyboard.press("ControlOrMeta+K");
    const input = page.locator(".md-search__input");
    await expect(input).toBeFocused();
    await expect(page.locator(".md-search__inner")).toBeVisible();
  });

  test("closes the modal and navigates when a result is clicked", async ({ page }) => {
    await page.goto("/");
    await page.getByText("Search", { exact: true }).click();
    const input = page.locator(".md-search__input");
    await input.fill("installation");
    await expect(page.locator(".md-search-result__link").first()).toBeVisible();

    // Clicking a result must close the modal AND navigate to the target page.
    await page.locator(".md-search-result__link").first().click();
    await expect(page.locator("#__search")).not.toBeChecked();
    await expect(page.locator(".md-search__inner")).toHaveCSS("pointer-events", "none");
    await expect(page).toHaveURL(/\/getting-started\/installation\/$/);
  });

  test("Enter on the query input clicks the first result and closes the modal", async ({ page }) => {
    await page.goto("/");
    await page.keyboard.press("ControlOrMeta+K");
    const input = page.locator(".md-search__input");
    await input.fill("installation");
    await expect(page.locator(".md-search-result__link").first()).toBeVisible();
    await page.keyboard.press("Enter");
    await expect(page.locator("#__search")).not.toBeChecked();
    await expect(page).toHaveURL(/\/getting-started\/installation\/$/);
  });
});
