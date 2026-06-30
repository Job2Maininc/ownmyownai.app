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

  test("page cursor accessible", async ({ page }) => {
    const response = await page.goto("/cursor");
    expect(response?.status()).toBeLessThan(500);
    await expect(page.getByRole("heading", { level: 1 })).toContainText(/Cursor/i);
    await expect(page.locator("body")).toContainText(/Ollama direct/i);
  });

  test("page help accessible", async ({ page }) => {
    const response = await page.goto("/help");
    expect(response?.status()).toBeLessThan(500);
    await expect(page.getByRole("heading", { level: 1 })).toContainText(/Guide utilisateur/i);
    await expect(page.locator("body")).toContainText(/État/i);
    await expect(page.locator("body")).toContainText(/Mémoire/i);
    await expect(page.locator("body")).toContainText(/Journal/i);
  });
});
