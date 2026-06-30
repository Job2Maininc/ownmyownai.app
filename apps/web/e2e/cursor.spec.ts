import { test, expect } from "@playwright/test";

test.describe("Page /cursor", () => {
  test("affiche le hero et les trois chemins d'intégration", async ({ page }) => {
    const response = await page.goto("/cursor");
    expect(response?.status()).toBeLessThan(500);

    await expect(page.getByRole("heading", { level: 1 })).toContainText(/brancher Cursor/i);

    await expect(page.getByRole("heading", { level: 2, name: "Ollama direct" })).toBeVisible();
    await expect(
      page.getByRole("heading", { level: 2, name: "Passerelle OMOA (gateway Host)" }),
    ).toBeVisible();
    await expect(page.getByRole("heading", { level: 2, name: "Serveur MCP OMOA" })).toBeVisible();
  });

  test("affiche les snippets de configuration Cursor", async ({ page }) => {
    await page.goto("/cursor");

    await expect(page.getByText("http://127.0.0.1:11434/v1")).toBeVisible();
    await expect(page.getByText("http://127.0.0.1:8765/v1")).toBeVisible();
    await expect(page.getByText(/mcpServers/)).toBeVisible();
  });

  test("affiche le tableau comparatif et les CTA", async ({ page }) => {
    await page.goto("/cursor");

    await expect(page.getByRole("columnheader", { name: "Ollama direct" })).toBeVisible();
    await expect(page.getByRole("columnheader", { name: "Gateway Host" })).toBeVisible();
    await expect(page.getByRole("columnheader", { name: "MCP" })).toBeVisible();

    await expect(page.getByRole("link", { name: /Télécharger le Host/i })).toHaveAttribute(
      "href",
      "/download",
    );
    await expect(page.getByRole("link", { name: /Voir Ollama direct/i })).toHaveAttribute(
      "href",
      "#ollama",
    );
  });

  test("ancres de navigation vers chaque chemin", async ({ page }) => {
    await page.goto("/cursor#gateway");
    await expect(page.locator("#gateway")).toBeInViewport();

    await page.goto("/cursor#mcp");
    await expect(page.locator("#mcp")).toBeInViewport();
  });
});
