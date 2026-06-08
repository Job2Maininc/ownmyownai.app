export interface RegistryModel {
  name: string;
  description?: string;
  pulls?: number;
  tags?: string[];
}

const REGISTRY_CACHE_KEY = "ollama-registry-cache";
const CACHE_TTL_MS = 24 * 60 * 60 * 1000;

interface RegistryCache {
  fetchedAt: number;
  models: RegistryModel[];
}

export async function fetchOllamaRegistry(): Promise<RegistryModel[]> {
  const cached = readCache();
  if (cached) return cached;

  try {
    const res = await fetch("https://ollama.com/api/tags", {
      headers: { Accept: "application/json" },
    });
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    const data = (await res.json()) as { models?: Array<{ name: string }> };
    const models: RegistryModel[] = (data.models ?? []).map((m) => ({
      name: m.name,
    }));
    writeCache(models);
    return models;
  } catch {
    return cached ?? [];
  }
}

export function searchRegistry(
  query: string,
  registry: RegistryModel[],
  limit = 20,
): RegistryModel[] {
  const q = query.trim().toLowerCase();
  if (!q) return registry.slice(0, limit);
  return registry
    .filter((m) => m.name.toLowerCase().includes(q))
    .slice(0, limit);
}

function readCache(): RegistryModel[] | null {
  try {
    const raw = localStorage.getItem(REGISTRY_CACHE_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as RegistryCache;
    if (Date.now() - parsed.fetchedAt > CACHE_TTL_MS) return null;
    return parsed.models;
  } catch {
    return null;
  }
}

function writeCache(models: RegistryModel[]): void {
  try {
    const cache: RegistryCache = { fetchedAt: Date.now(), models };
    localStorage.setItem(REGISTRY_CACHE_KEY, JSON.stringify(cache));
  } catch {
    /* ignore quota */
  }
}
