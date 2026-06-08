export function formatInvokeError(error: unknown): string {
  const message = error instanceof Error ? error.message : String(error);
  return message.replace(/^Error:\s*/i, "");
}

export function isMissingTauriCommand(error: unknown): boolean {
  const message = formatInvokeError(error).toLowerCase();
  return message.includes("not found") || message.includes("introuvable");
}
