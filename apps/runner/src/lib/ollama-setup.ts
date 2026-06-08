import { invoke } from "@tauri-apps/api/core";
import { isMissingTauriCommand } from "./tauri-errors";

export async function ensureOllamaRunning(fallbackModels: string[] = []): Promise<void> {
  try {
    await invoke("ensure_ollama_running");
  } catch (error) {
    if (!isMissingTauriCommand(error)) {
      throw error;
    }
    await invoke("pull_models", { models: fallbackModels });
  }
}
