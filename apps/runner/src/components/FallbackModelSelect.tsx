import { useCallback, useEffect, useState } from "react";
import { invoke } from "@tauri-apps/api/core";
import type { HostSettings } from "../types";

export function buildFallbackOptions(
  installedModels: string[],
  defaultModel: string,
  currentFallback: string,
): string[] {
  const options = installedModels.filter((m) => m !== defaultModel);
  if (
    currentFallback &&
    currentFallback !== defaultModel &&
    !options.some((m) => m === currentFallback || m.startsWith(`${currentFallback}:`))
  ) {
    options.unshift(currentFallback);
  }
  return options;
}

interface FallbackModelSelectProps {
  installedModels: string[];
  defaultModel: string;
  value?: string;
  onChange?: (value: string) => void;
  onError?: (message: string) => void;
  persist?: boolean;
  disabled?: boolean;
  selectId?: string;
  className?: string;
}

export default function FallbackModelSelect({
  installedModels,
  defaultModel,
  value,
  onChange,
  onError,
  persist = true,
  disabled = false,
  selectId = "fallback-model",
  className,
}: FallbackModelSelectProps) {
  const controlled = value !== undefined;
  const [internalValue, setInternalValue] = useState("");
  const [saving, setSaving] = useState(false);

  const fallbackModel = controlled ? value : internalValue;

  useEffect(() => {
    if (controlled) return;
    void invoke<HostSettings>("get_host_settings")
      .then((s) => setInternalValue(s.fallbackModel ?? ""))
      .catch(() => undefined);
  }, [controlled]);

  const saveFallbackModel = useCallback(
    async (next: string) => {
      if (!controlled) {
        setInternalValue(next);
      }
      onChange?.(next);

      if (!persist) return;

      setSaving(true);
      try {
        const settings = await invoke<HostSettings>("get_host_settings");
        await invoke("save_host_settings", {
          settings: {
            ...settings,
            fallbackModel: next.trim() || undefined,
          },
        });
      } catch (e) {
        onError?.(String(e));
      } finally {
        setSaving(false);
      }
    },
    [controlled, onChange, onError, persist],
  );

  const fallbackOptions = buildFallbackOptions(
    installedModels,
    defaultModel,
    fallbackModel,
  );
  const canChoose = fallbackOptions.length > 0;

  if (installedModels.length === 0) {
    return null;
  }

  return (
    <div className={className ?? "field-row"} style={{ marginBottom: 12 }}>
      <label className="field-label" htmlFor={selectId}>
        Modèle secours
      </label>
      <select
        id={selectId}
        value={fallbackModel}
        disabled={!canChoose || saving || disabled}
        onChange={(e) => void saveFallbackModel(e.target.value)}
        className="model-search"
        aria-describedby={`${selectId}-hint`}
      >
        <option value="">Aucun (chaîne automatique)</option>
        {fallbackOptions.map((m) => (
          <option key={m} value={m}>
            {m}
          </option>
        ))}
      </select>
      <p id={`${selectId}-hint`} className="muted path-hint">
        {canChoose
          ? "Utilisé automatiquement si le modèle demandé est absent ou met plus de 45 s à répondre."
          : "Installez un second modèle (autre que le défaut) pour choisir un secours explicite. Sinon la chaîne automatique s'applique."}
      </p>
    </div>
  );
}
