import { test, expect } from "@playwright/test";

test.describe("Smoke web", () => {
  test("page login accessible", async ({ page }) => {
    const response = await page.goto("/login");
    expect(response?.status()).toBeLessThan(500);
    await expect(page.getByRole("heading", { level: 1 })).toBeVisible();
  });

  test("page download accessible", async ({ page }) => {
    const response = await page.goto("/download");
    expect(response?.status()).toBeLessThan(500);
    await expect(page.locator("body")).toContainText(/télécharg|download/i);
  });
});
