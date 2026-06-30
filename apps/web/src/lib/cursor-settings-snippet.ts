/** Placeholder affiché quand le token n'est pas disponible côté web. */
export const CURSOR_TOKEN_PLACEHOLDER =
  "Copiez depuis l'onglet Cursor du Host";

export const DEFAULT_CURSOR_GATEWAY_PORT = 8765;

export const DEFAULT_CURSOR_MODEL = "qwen2.5:7b";

export interface CursorSettingsSnippet {
  overrideOpenAiBaseUrl: string;
  openAiApiKey: string;
  model: string;
}

export function buildCursorGatewayBaseUrl(port = DEFAULT_CURSOR_GATEWAY_PORT): string {
  return `http://127.0.0.1:${port}/v1`;
}

/** Snippet JSON de référence pour Cursor Settings → Models. */
export function buildCursorSettingsSnippet(
  model = DEFAULT_CURSOR_MODEL,
  port = DEFAULT_CURSOR_GATEWAY_PORT,
  apiKey = CURSOR_TOKEN_PLACEHOLDER,
): string {
  const payload: CursorSettingsSnippet = {
    overrideOpenAiBaseUrl: buildCursorGatewayBaseUrl(port),
    openAiApiKey: apiKey,
    model,
  };
  return JSON.stringify(payload, null, 2);
}
