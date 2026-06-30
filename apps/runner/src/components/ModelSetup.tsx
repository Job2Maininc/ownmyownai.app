import { useCallback, useEffect, useState } from "react";
import { invoke } from "@tauri-apps/api/core";
import {
  DEFAULT_MODEL,
  RECOMMENDED_MODELS,
  compatibilityLabel,
  getCompatibility,
} from "../data/models";
import QuantizationAdviceBanner from "./QuantizationAdviceBanner";
import { useQuantizationAdvice } from "../hooks/useQuantizationAdvice";
import type { HostSettings } from "../types";

interface ModelSetupProps {
  onContinue: (settings: HostSettings) => void;
  error: string | null;
}

export default function ModelSetup({ onContinue, error }: ModelSetupProps) {
  const [modelsDir, setModelsDir] = useState("");
  const [selectedModels, setSelectedModels] = useState<string[]>([DEFAULT_MODEL]);
  const [defaultModel, setDefaultModel] = useState(DEFAULT_MODEL);
  const [localError, setLocalError] = useState<string | null>(null);
  const [ramGb, setRamGb] = useState(8);
  const [gpuLabel, setGpuLabel] = useState<string | null>(null);
  const [hideIncompatible, setHideIncompatible] = useState(false);
  const [adviceModel, setAdviceModel] = useState<string | null>(null);
  const { advice, loading: adviceLoading } = useQuantizationAdvice(adviceModel);

  const loadSettings = useCallback(async () => {
    try {
      const settings = await invoke<HostSettings>("get_host_settings");
      const layout = await invoke<{ modelsDir: string }>("get_host_data_layout");
      setModelsDir(layout.modelsDir || settings.modelsDir);
      setSelectedModels(settings.selectedModels);
      setDefaultModel(settings.defaultModel);
    } catch {
      const layout = await invoke<{ modelsDir: string }>("get_host_data_layout");
      setModelsDir(layout.modelsDir);
    }
  }, []);

  useEffect(() => {
    loadSettings();
    void invoke<{ totalRamGb: number; gpus?: { name: string; vramGb: number | null }[] }>(
      "get_hardware_info",
    )
      .then((h) => {
        setRamGb(h.totalRamGb);
        const primary = h.gpus?.[0];
        if (primary) {
          setGpuLabel(
            primary.vramGb != null
              ? `${primary.name} (${primary.vramGb} Go VRAM)`
              : primary.name,
          );
        }
      })
      .catch(() => undefined);
  }, [loadSettings]);

  function toggleModel(id: string) {
    setSelectedModels((prev) => {
      if (prev.includes(id)) {
        const next = prev.filter((m) => m !== id);
        if (defaultModel === id && next.length > 0) {
          setDefaultModel(next[0]);
        }
        if (adviceModel === id) {
          setAdviceModel(next[0] ?? null);
        }
        return next;
      }
      setAdviceModel(id);
      return [...prev, id];
    });
  }

  async function handleContinue() {
    setLocalError(null);
    if (selectedModels.length === 0) {
      setLocalError("Sélectionnez au moins un modèle.");
      return;
    }
    if (!selectedModels.includes(defaultModel)) {
      setLocalError("Le modèle par défaut doit être coché.");
      return;
    }

    const settings: HostSettings = {
      modelsDir: modelsDir.trim(),
      selectedModels,
      defaultModel,
    };

    try {
      await invoke("save_host_settings", { settings });
      onContinue(settings);
    } catch (e) {
      setLocalError(String(e));
    }
  }

  const totalSize = selectedModels.reduce((sum, id) => {
    const model = RECOMMENDED_MODELS.find((m) => m.id === id);
    return sum + (model?.sizeGb ?? 0);
  }, 0);

  const maxRam = selectedModels.reduce((max, id) => {
    const model = RECOMMENDED_MODELS.find((m) => m.id === id);
    return Math.max(max, model?.ramGb ?? 0);
  }, 0);

  return (
    <>
      <h1>Choisir vos modèles</h1>
      <p className="muted" style={{ fontSize: 14 }}>
        Sélectionnez les modèles à télécharger et l&apos;emplacement de stockage sur
        votre disque.
      </p>
      {gpuLabel && (
        <p className="muted" style={{ fontSize: 13 }}>
          GPU détecté : <span className="gpu-badge gpu-badge--discrete">{gpuLabel}</span>
        </p>
      )}

      <p className="muted path-hint" style={{ marginTop: 12 }}>
        Modèles IA : <code className="inline-code">{modelsDir || "…"}</code>
        <br />
        Défini à l&apos;étape précédente dans votre dossier de données.
      </p>

      <label className="filter-toggle">
        <input
          type="checkbox"
          checked={hideIncompatible}
          onChange={(e) => setHideIncompatible(e.target.checked)}
        />
        Masquer les modèles non recommandés pour {ramGb} Go RAM
      </label>

      <div className="model-list">
        {RECOMMENDED_MODELS.filter((model) => {
          if (!hideIncompatible) return true;
          return getCompatibility(model, ramGb) !== "not_recommended";
        }).map((model) => {
          const checked = selectedModels.includes(model.id);
          const isDefault = defaultModel === model.id;
          const compat = getCompatibility(model, ramGb);
          return (
            <label
              key={model.id}
              className={`model-card ${checked ? "model-card--selected" : ""}`}
            >
              <div className="model-card__head">
                <input
                  type="checkbox"
                  checked={checked}
                  onChange={() => toggleModel(model.id)}
                />
                <div className="model-card__title">
                  <strong>{model.name}</strong>
                  <span className="model-card__meta">
                    ~{model.sizeGb} Go · {model.ramGb} Go RAM min. ·{" "}
                    <span className={`compat compat--${compat}`}>
                      {compatibilityLabel(compat)}
                    </span>
                  </span>
                </div>
                {checked && (
                  <button
                    type="button"
                    className={`btn-ghost model-card__default ${isDefault ? "model-card__default--on" : ""}`}
                    onClick={(e) => {
                      e.preventDefault();
                      setDefaultModel(model.id);
                    }}
                  >
                    {isDefault ? "Par défaut" : "Définir par défaut"}
                  </button>
                )}
              </div>
              <p className="model-card__desc">{model.description}</p>
              <div className="model-card__tags">
                {model.tags.map((tag) => (
                  <span key={tag} className="model-tag">
                    {tag}
                  </span>
                ))}
              </div>
              <p className="model-card__best">
                <span className="model-card__best-label">Idéal pour :</span>{" "}
                {model.bestFor.join(" · ")}
              </p>
              {checked && adviceModel === model.id && (
                <QuantizationAdviceBanner advice={advice} loading={adviceLoading} />
              )}
            </label>
          );
        })}
      </div>

      <p className="muted selection-summary">
        {selectedModels.length} modèle(s) sélectionné(s) · ~{totalSize.toFixed(1)} Go
        à télécharger · {maxRam} Go RAM recommandés
      </p>

      <button
        type="button"
        className="btn-primary"
        style={{ width: "100%", marginTop: 12 }}
        onClick={handleContinue}
        disabled={selectedModels.length === 0}
      >
        Installer et télécharger
      </button>

      {(localError || error) && (
        <p className="error-banner">{localError ?? error}</p>
      )}
    </>
  );
}
