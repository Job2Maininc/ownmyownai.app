import { test, expect } from "@playwright/test";
import {
  E2E_PAIRING_CODE,
  E2E_TEST_HOST_ID,
  grantE2eAuth,
  mockSupabaseForPairing,
} from "./fixtures/supabase-mock";

test.describe("Pairing Host (mock Supabase)", () => {
  test.beforeEach(async ({ context, baseURL }) => {
    await grantE2eAuth(context, baseURL!);
  });

  test("affiche un code de pairing mocké", async ({ page }) => {
    await mockSupabaseForPairing(page);

    await page.goto("/host/link");
    await expect(page.getByRole("heading", { name: "Lier votre PC" })).toBeVisible();

    const codeEl = page.getByLabel(`Code ${E2E_PAIRING_CODE}`);
    await expect(codeEl).toBeVisible();
    await expect(codeEl).toHaveText(E2E_PAIRING_CODE);
    await expect(page.getByText(/Expire à/i)).toBeVisible();
  });

  test("détecte le pairing réussi via polling mocké", async ({ page }) => {
    await page.clock.install();
    await mockSupabaseForPairing(page, { pollsBeforeSuccess: 1 });

    await page.goto("/host/link");
    await expect(page.getByLabel(`Code ${E2E_PAIRING_CODE}`)).toBeVisible();

    await page.clock.fastForward("00:00:03");

    await expect(page.getByText(/PC lié avec succès/i)).toBeVisible();
    await expect(page.getByRole("link", { name: /Connecter Cursor/i })).toHaveAttribute(
      "href",
      `/onboarding/cursor?host=${E2E_TEST_HOST_ID}`,
    );
    await expect(page.getByRole("link", { name: /Passer au chat/i })).toHaveAttribute(
      "href",
      `/chat/${E2E_TEST_HOST_ID}`,
    );
    await expect(page.getByRole("link", { name: /^Dashboard$/i })).toHaveAttribute(
      "href",
      "/dashboard",
    );
  });

  test("accepte un code pré-rempli via query string", async ({ page }) => {
    await mockSupabaseForPairing(page, { code: "739104" });

    await page.goto("/host/link?code=739104");
    await expect(page.getByLabel("Code 739104")).toBeVisible();
    await expect(page.getByText(/Génération du code/i)).not.toBeVisible();
  });
});
