import { useCallback, useEffect, useState } from "react";
import { invoke } from "@tauri-apps/api/core";
import type { HostSettings, ModelTaskRouting } from "../types";

interface ModelTaskRoutingPanelProps {
  installedModels: string[];
  defaultModel: string;
}

const AUTO_OPTION = "";

export default function ModelTaskRoutingPanel({
  installedModels,
  defaultModel,
}: ModelTaskRoutingPanelProps) {
  const [routing, setRouting] = useState<ModelTaskRouting>({});
  const [error, setError] = useState<string | null>(null);

  const loadRouting = useCallback(async () => {
    try {
      const settings = await invoke<HostSettings>("get_host_settings");
      setRouting(settings.modelRouting ?? {});
    } catch {
      /* ignore */
    }
  }, []);

  useEffect(() => {
    void loadRouting();
  }, [loadRouting]);

  const modelOptions = Array.from(
    new Set([defaultModel, ...installedModels].filter(Boolean)),
  ).sort((a, b) => a.localeCompare(b, "fr"));

  async function saveRouting(next: ModelTaskRouting) {
    setRouting(next);
    setError(null);
    try {
      const settings = await invoke<HostSettings>("get_host_settings");
      const modelRouting: ModelTaskRouting = {};
      if (next.summaryModel?.trim()) {
        modelRouting.summaryModel = next.summaryModel.trim();
      }
      if (next.writingModel?.trim()) {
        modelRouting.writingModel = next.writingModel.trim();
      }
      await invoke("save_host_settings", {
        settings: {
          ...settings,
          modelRouting: Object.keys(modelRouting).length > 0 ? modelRouting : {},
        },
      });
    } catch (e) {
      setError(String(e));
    }
  }

  if (modelOptions.length === 0) {
    return null;
  }

  return (
    <div className="model-routing-panel">
      <h3 className="model-routing-panel__title">Routage par tâche</h3>
      <p className="muted path-hint">
        Le Host choisit automatiquement un modèle selon l&apos;intention du message
        (résumé ou rédaction). Sans sélection, le modèle par défaut est utilisé.
      </p>
      <div className="model-routing-panel__grid">
        <div className="field-row">
          <label className="field-label" htmlFor="summary-model">
            Modèle résumé
          </label>
          <select
            id="summary-model"
            value={routing.summaryModel ?? AUTO_OPTION}
            onChange={(e) =>
              void saveRouting({
                ...routing,
                summaryModel: e.target.value || undefined,
              })
            }
            className="model-search"
          >
            <option value={AUTO_OPTION}>Automatique (modèle par défaut)</option>
            {modelOptions.map((m) => (
              <option key={`summary-${m}`} value={m}>
                {m}
              </option>
            ))}
          </select>
          <p className="muted path-hint">
            Déclenché par « résume », « synthèse », « en bref », etc.
          </p>
        </div>
        <div className="field-row">
          <label className="field-label" htmlFor="writing-model">
            Modèle rédaction
          </label>
          <select
            id="writing-model"
            value={routing.writingModel ?? AUTO_OPTION}
            onChange={(e) =>
              void saveRouting({
                ...routing,
                writingModel: e.target.value || undefined,
              })
            }
            className="model-search"
          >
            <option value={AUTO_OPTION}>Automatique (modèle par défaut)</option>
            {modelOptions.map((m) => (
              <option key={`writing-${m}`} value={m}>
                {m}
              </option>
            ))}
          </select>
          <p className="muted path-hint">
            Déclenché par « rédige », « écris », « article », « email », etc.
          </p>
        </div>
      </div>
      {error && <p className="error-line">{error}</p>}
    </div>
  );
}
