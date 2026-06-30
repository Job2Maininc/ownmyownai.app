import type { BrowserContext, Page, Route } from "@playwright/test";

export const E2E_TEST_USER_ID = "e2e00000-0000-4000-8000-000000000001";
export const E2E_TEST_HOST_ID = "e2e00000-0000-4000-8000-000000000002";
export const E2E_PAIRING_CODE = "482916";
export const E2E_AUTH_COOKIE = "e2e-test-auth";

const MOCK_USER = {
  id: E2E_TEST_USER_ID,
  aud: "authenticated",
  role: "authenticated",
  email: "e2e@ownmyownai.test",
  email_confirmed_at: "2026-01-01T00:00:00.000Z",
  app_metadata: { provider: "email" },
  user_metadata: {},
  created_at: "2026-01-01T00:00:00.000Z",
  updated_at: "2026-01-01T00:00:00.000Z",
};

const MOCK_SESSION = {
  access_token: "e2e-access-token",
  refresh_token: "e2e-refresh-token",
  expires_in: 3600,
  expires_at: Math.floor(Date.now() / 1000) + 3600,
  token_type: "bearer",
  user: MOCK_USER,
};

export type PairingMockOptions = {
  code?: string;
  hostId?: string;
  /** Nombre de sondes REST avant succès (défaut : 1). */
  pollsBeforeSuccess?: number;
};

/** Cookie lu par le middleware Next.js en mode E2E (`E2E_AUTH_BYPASS=1`). */
export async function grantE2eAuth(context: BrowserContext, baseURL: string) {
  await context.addCookies([
    {
      name: E2E_AUTH_COOKIE,
      value: "1",
      url: baseURL,
    },
  ]);
}

async function fulfillJson(route: Route, body: unknown, status = 200) {
  await route.fulfill({
    status,
    contentType: "application/json",
    body: JSON.stringify(body),
  });
}

/** Intercepte les appels Supabase côté navigateur (auth + edge functions + REST). */
export async function mockSupabaseForPairing(page: Page, options: PairingMockOptions = {}) {
  const code = options.code ?? E2E_PAIRING_CODE;
  const hostId = options.hostId ?? E2E_TEST_HOST_ID;
  const pollsBeforeSuccess = options.pollsBeforeSuccess ?? 1;
  let pairingPollCount = 0;

  await page.route("**/auth/v1/**", async (route) => {
    const url = route.request().url();
    if (url.includes("/user")) {
      await fulfillJson(route, MOCK_USER);
      return;
    }
    if (url.includes("/token")) {
      await fulfillJson(route, MOCK_SESSION);
      return;
    }
    await route.continue();
  });

  await page.route("**/functions/v1/create-pairing-code", async (route) => {
    const expiresAt = new Date(Date.now() + 15 * 60 * 1000).toISOString();
    await fulfillJson(route, {
      code,
      expires_at: expiresAt,
      pairing_url: `http://127.0.0.1:3000/host/link?code=${code}`,
    });
  });

  await page.route("**/rest/v1/pairing_requests**", async (route) => {
    pairingPollCount += 1;
    const consumed = pairingPollCount >= pollsBeforeSuccess;
    const row = consumed
      ? { consumed_at: new Date().toISOString(), host_id: hostId }
      : { consumed_at: null, host_id: null };

    await fulfillJson(route, route.request().method() === "GET" ? row : [row]);
  });
}
