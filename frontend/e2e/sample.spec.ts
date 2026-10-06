import { test, expect } from "@playwright/test";

test.describe("Playwright E2E Setup & Smoke Test", () => {
  test("loads the application and checks page structure", async ({ page }) => {
    await page.goto("/");
    // Verify title matches Kalp.io
    await expect(page).toHaveTitle(/Kalp\.io/i);

    // Verify main interactive elements exist on input page
    const textarea = page.locator("textarea");
    await expect(textarea).toBeVisible();
  });
});
