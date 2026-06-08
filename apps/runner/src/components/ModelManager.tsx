import { useCallback, useEffect, useState } from "react";
import { invoke } from "@tauri-apps/api/core";
import { listen } from "@tauri-apps/api/event";
import {
  RECOMMENDED_MODELS,
  compatibilityLabel,
  getCompatibility,
  type ModelCategory,
} from "../data/models";
import { fetchOllamaRegistry, searchRegistry, type RegistryModel } from "../data/ollama-registry";
import type { HostSettings, SetupProgress } from "../types";

interface HardwareInfo {
  totalRamGb: number;
  availableRamGb: number;
  cpuCores: number;
}

interface ModelManagerProps {
  installedModels: string[];
  defaultModel: string;
  onDefaultChanged: () => void;
}

const CATEGORIES: { id: ModelCategory | "all"; label: string }[] = [
  { id: "all", label: "Tous" },
  { id: "chat", label: "Chat" },
  { id: "code", label: "Code" },
  { id: "vision", label: "Vision" },
  { id: "embedding", label: "Embedding" },
];

export default function ModelManager({
  installedModels,
  defaultModel,
  onDefaultChanged,
}: ModelManagerProps) {
  const [hardware, setHardware] = useState<HardwareInfo | null>(null);
  const [category, setCategory] = useState<ModelCategory | "all">("all");
  const [search, setSearch] = useState("");
  const [registry, setRegistry] = useState<RegistryModel[]>([]);
  const [pulling, setPulling] = useState<string | null>(null);
  const [progress, setProgress] = useState<SetupProgress | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [customModel, setCustomModel] = useState("");

  const loadHardware = useCallback(async () => {
    try {
      const info = await invoke<HardwareInfo>("get_hardware_info");
      setHardware(info);
    } catch {
      /* ignore */
    }
  }, []);

  useEffect(() => {
    loadHardware();
    void fetchOllamaRegistry().then(setRegistry);
    const unlisten = listen<SetupProgress>("ollama-progress", (e) => setProgress(e.payload));
    return () => {
      unlisten.then((fn) => fn());
    };
  }, [loadHardware]);

  const ramGb = hardware?.totalRamGb ?? 8;

  const catalog = RECOMMENDED_MODELS.filter((m) => category === "all" || m.category === category);
  const registryHits = search.trim() ? searchRegistry(search, registry, 10) : [];

  function isInstalled(id: string): boolean {
    const base = id.split(":")[0];
    return installedModels.some(
      (m) => m === id || m.startsWith(`${id}:`) || m.startsWith(`${base}:`),
    );
  }

  async function pullOne(modelId: string) {
    setError(null);
    setPulling(modelId);
    try {
      await invoke("ensure_ollama_running");
      await invoke("pull_model", { model: modelId });
      onDefaultChanged();
    } catch (e) {
      setError(String(e));
    } finally {
      setPulling(null);
      setProgress(null);
    }
  }

  async function removeModel(modelId: string) {
    if (!window.confirm(`Supprimer le modèle « ${modelId} » ?`)) return;
    setError(null);
    try {
      await invoke("delete_ollama_model", { model: modelId });
      onDefaultChanged();
    } catch (e) {
      setError(String(e));
    }
  }

  async function setAsDefault(modelId: string) {
    setError(null);
    try {
      const settings = await invoke<HostSettings>("get_host_settings");
      const selected = settings.selectedModels.includes(modelId)
        ? settings.selectedModels
        : [...settings.selectedModels, modelId];
      await invoke("save_host_settings", {
        settings: { ...settings, selectedModels: selected, defaultModel: modelId },
      });
      onDefaultChanged();
    } catch (e) {
      setError(String(e));
    }
  }

  return (
    <section className="panel">
      <div className="panel__head">
        <h2>Gérer les modèles</h2>
      </div>
      {hardware && (
        <p className="muted panel__meta">
          RAM système : {hardware.totalRamGb} Go · {hardware.cpuCores} cœurs
        </p>
      )}
      <div className="model-filters">
        {CATEGORIES.map((c) => (
          <button
            key={c.id}
            type="button"
            className={`chip-filter ${category === c.id ? "chip-filter--active" : ""}`}
            onClick={() => setCategory(c.id)}
          >
            {c.label}
          </button>
        ))}
      </div>
      <input
        type="search"
        placeholder="Rechercher dans le catalogue Ollama…"
        value={search}
        onChange={(e) => setSearch(e.target.value)}
        className="model-search"
      />
      {registryHits.length > 0 && (
        <ul className="registry-hits">
          {registryHits.map((m) => (
            <li key={m.name}>
              <span>{m.name}</span>
              <button
                type="button"
                className="btn-ghost"
                disabled={!!pulling}
                onClick={() => void pullOne(m.name)}
              >
                {pulling === m.name ? "…" : "Télécharger"}
              </button>
            </li>
          ))}
        </ul>
      )}
      <ul className="model-catalog">
        {catalog.map((model) => {
          const compat = getCompatibility(model, ramGb);
          const installed = isInstalled(model.id);
          return (
            <li key={model.id} className="model-catalog__item">
              <div className="model-catalog__main">
                <strong>{model.name}</strong>
                <span className={`compat compat--${compat}`}>{compatibilityLabel(compat)}</span>
                {installed && <span className="model-chip__tag">installé</span>}
                {defaultModel === model.id && <span className="model-chip__tag">défaut</span>}
              </div>
              <p className="muted">{model.description}</p>
              <div className="model-catalog__actions">
                {!installed ? (
                  <button
                    type="button"
                    className="btn-secondary"
                    disabled={!!pulling}
                    onClick={() => void pullOne(model.id)}
                  >
                    {pulling === model.id ? "Téléchargement…" : "Télécharger"}
                  </button>
                ) : (
                  <>
                    <button type="button" className="btn-ghost" onClick={() => void setAsDefault(model.id)}>
                      Définir par défaut
                    </button>
                    <button type="button" className="btn-ghost" onClick={() => void removeModel(model.id)}>
                      Supprimer
                    </button>
                  </>
                )}
              </div>
            </li>
          );
        })}
      </ul>
      <div className="custom-pull">
        <input
          value={customModel}
          onChange={(e) => setCustomModel(e.target.value)}
          placeholder="Nom Ollama personnalisé (ex. llama3.2:3b)"
        />
        <button
          type="button"
          className="btn-secondary"
          disabled={!customModel.trim() || !!pulling}
          onClick={() => void pullOne(customModel.trim())}
        >
          Télécharger
        </button>
      </div>
      {progress && pulling && (
        <p className="muted">{progress.message}</p>
      )}
      {error && <p className="error-line">{error}</p>}
    </section>
  );
}
