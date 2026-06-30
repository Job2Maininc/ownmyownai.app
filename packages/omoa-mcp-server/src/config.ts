import fs from "node:fs";
import os from "node:os";
import path from "node:path";

const APP_DIR = "OwnMyOwnAI";
const DEFAULT_RAG_TOP_K = 8;

export interface OmoaConfig {
  contextDbPath: string;
  ragTopK: number;
  contextIds: string[];
}

interface HostSettingsJson {
  dataDir?: string;
  ragTopK?: number;
  activeProjectId?: string;
}

function defaultSettingsDir(): string {
  const localAppData = process.env.LOCALAPPDATA;
  if (localAppData) {
    return path.join(localAppData, APP_DIR);
  }
  return path.join(os.homedir(), ".local", "share", APP_DIR);
}

function defaultDataDir(): string {
  return defaultSettingsDir();
}

function readSettings(): HostSettingsJson | null {
  const settingsPath = path.join(defaultSettingsDir(), "settings.json");
  if (!fs.existsSync(settingsPath)) {
    return null;
  }
  try {
    const raw = fs.readFileSync(settingsPath, "utf8");
    return JSON.parse(raw) as HostSettingsJson;
  } catch {
    return null;
  }
}

function resolveDataDir(): string {
  if (process.env.OMOA_DATA_DIR?.trim()) {
    return path.resolve(process.env.OMOA_DATA_DIR.trim());
  }
  const settings = readSettings();
  if (settings?.dataDir?.trim()) {
    return path.resolve(settings.dataDir.trim());
  }
  return defaultDataDir();
}

export function resolveContextDbPath(): string {
  if (process.env.OMOA_CONTEXT_DB?.trim()) {
    return path.resolve(process.env.OMOA_CONTEXT_DB.trim());
  }
  return path.join(resolveDataDir(), "context.db");
}

export function resolveRagTopK(): number {
  const env = process.env.OMOA_RAG_TOP_K?.trim();
  if (env) {
    const parsed = Number.parseInt(env, 10);
    if (Number.isFinite(parsed) && parsed > 0) {
      return parsed;
    }
  }
  const settings = readSettings();
  if (settings?.ragTopK && settings.ragTopK > 0) {
    return settings.ragTopK;
  }
  return DEFAULT_RAG_TOP_K;
}

export function resolveContextIds(): string[] {
  const env = process.env.OMOA_CONTEXT_IDS?.trim();
  if (env) {
    return env
      .split(",")
      .map((id) => id.trim())
      .filter(Boolean);
  }
  return [];
}

export function loadConfig(): OmoaConfig {
  return {
    contextDbPath: resolveContextDbPath(),
    ragTopK: resolveRagTopK(),
    contextIds: resolveContextIds(),
  };
}
