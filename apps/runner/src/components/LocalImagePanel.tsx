import { useCallback, useEffect, useState } from "react";
import { invoke } from "@tauri-apps/api/core";
import { formatInvokeError } from "../lib/tauri-errors";
import type {
  GenerateImageInput,
  HostSettings,
  LocalImageResult,
  LocalImageSettings,
  LocalImageStatus,
} from "../types";

const DEFAULTS: LocalImageSettings = {
  enabled: false,
  backend: "comfyui",
  baseUrl: "http://127.0.0.1:8188",
  steps: 20,
  width: 512,
  height: 512,
};

const BACKEND_URLS: Record<string, string> = {
  comfyui: "http://127.0.0.1:8188",
  "sd-webui": "http://127.0.0.1:7860",
};

export default function LocalImagePanel() {
  const [settings, setSettings] = useState<LocalImageSettings>(DEFAULTS);
  const [status, setStatus] = useState<LocalImageStatus | null>(null);
  const [checkpoints, setCheckpoints] = useState<string[]>([]);
  const [prompt, setPrompt] = useState("");
  const [negativePrompt, setNegativePrompt] = useState("");
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [generating, setGenerating] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [saved, setSaved] = useState(false);
  const [lastResult, setLastResult] = useState<LocalImageResult | null>(null);

  const refreshStatus = useCallback(async (localSettings?: LocalImageSettings) => {
    try {
      const data = await invoke<LocalImageStatus>("get_local_image_status");
      setStatus(data);
      const cfg = localSettings ?? settings;
      if (cfg.backend === "comfyui" && cfg.enabled) {
        try {
          const list = await invoke<string[]>("list_comfyui_checkpoints", {
            baseUrl: cfg.baseUrl,
          });
          setCheckpoints(list);
        } catch {
          setCheckpoints([]);
        }
      } else {
        setCheckpoints([]);
      }
    } catch (e) {
      setError(formatInvokeError(e));
    }
  }, [settings]);

  const loadSettings = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const host = await invoke<HostSettings>("get_host_settings");
      const local = { ...DEFAULTS, ...host.localImage };
      setSettings(local);
      await refreshStatus(local);
    } catch (e) {
      setError(formatInvokeError(e));
    } finally {
      setLoading(false);
    }
  }, [refreshStatus]);

  useEffect(() => {
    void loadSettings();
  }, [loadSettings]);

  async function saveSettings() {
    setSaving(true);
    setError(null);
    setSaved(false);
    try {
      const host = await invoke<HostSettings>("get_host_settings");
      await invoke("save_host_settings", {
        settings: { ...host, localImage: settings },
      });
      setSaved(true);
      window.setTimeout(() => setSaved(false), 2500);
      await refreshStatus(settings);
    } catch (e) {
      setError(formatInvokeError(e));
    } finally {
      setSaving(false);
    }
  }

  async function generateImage() {
    setGenerating(true);
    setError(null);
    setLastResult(null);
    try {
      const input: GenerateImageInput = {
        prompt: prompt.trim(),
        negativePrompt: negativePrompt.trim() || undefined,
        width: settings.width,
        height: settings.height,
        steps: settings.steps,
      };
      const result = await invoke<LocalImageResult>("generate_local_image", { input });
      setLastResult(result);
    } catch (e) {
      setError(formatInvokeError(e));
    } finally {
      setGenerating(false);
    }
  }

  function updateBackend(backend: string) {
    const baseUrl = BACKEND_URLS[backend] ?? settings.baseUrl;
    setSettings((prev) => ({ ...prev, backend, baseUrl }));
  }

  if (loading) {
    return (
      <section className="panel">
        <h2>Images locales</h2>
        <p className="panel__empty muted">Chargement…</p>
      </section>
    );
  }

  return (
    <div className="local-image">
      <section className="panel">
        <div className="panel__head">
          <h2>Images locales</h2>
          <button type="button" className="btn-ghost" onClick={() => void loadSettings()}>
            Actualiser
          </button>
        </div>
        <p className="panel__meta muted">
          Générez des images via ComfyUI ou Automatic1111 (SD WebUI) sur votre PC — endpoint HTTP
          localhost configurable.
        </p>

        {error ? (
          <p className="error-line" role="alert">
            {error}
          </p>
        ) : null}

        <label className="local-image__toggle">
          <input
            type="checkbox"
            checked={settings.enabled}
            onChange={(e) => setSettings((prev) => ({ ...prev, enabled: e.target.checked }))}
          />
          <span>Génération d&apos;images locale active</span>
        </label>

        <div className="local-image__grid">
          <label className="local-image__field">
            <span className="local-image__label">Backend</span>
            <select
              className="local-image__select"
              value={settings.backend}
              onChange={(e) => updateBackend(e.target.value)}
            >
              <option value="comfyui">ComfyUI</option>
              <option value="sd-webui">SD WebUI (Automatic1111)</option>
            </select>
          </label>

          <label className="local-image__field">
            <span className="local-image__label">URL de base (localhost)</span>
            <input
              type="url"
              value={settings.baseUrl}
              onChange={(e) => setSettings((prev) => ({ ...prev, baseUrl: e.target.value }))}
              placeholder="http://127.0.0.1:8188"
            />
          </label>

          {settings.backend === "comfyui" ? (
            <label className="local-image__field">
              <span className="local-image__label">Checkpoint ComfyUI</span>
              <select
                className="local-image__select"
                value={settings.checkpoint ?? ""}
                onChange={(e) =>
                  setSettings((prev) => ({
                    ...prev,
                    checkpoint: e.target.value || undefined,
                  }))
                }
              >
                <option value="">Premier disponible</option>
                {checkpoints.map((ckpt) => (
                  <option key={ckpt} value={ckpt}>
                    {ckpt}
                  </option>
                ))}
              </select>
            </label>
          ) : null}

          <label className="local-image__field">
            <span className="local-image__label">Largeur</span>
            <input
              type="number"
              min={64}
              max={2048}
              step={64}
              value={settings.width}
              onChange={(e) =>
                setSettings((prev) => ({ ...prev, width: Number(e.target.value) || 512 }))
              }
            />
          </label>

          <label className="local-image__field">
            <span className="local-image__label">Hauteur</span>
            <input
              type="number"
              min={64}
              max={2048}
              step={64}
              value={settings.height}
              onChange={(e) =>
                setSettings((prev) => ({ ...prev, height: Number(e.target.value) || 512 }))
              }
            />
          </label>

          <label className="local-image__field">
            <span className="local-image__label">Étapes</span>
            <input
              type="number"
              min={1}
              max={150}
              value={settings.steps}
              onChange={(e) =>
                setSettings((prev) => ({ ...prev, steps: Number(e.target.value) || 20 }))
              }
            />
          </label>
        </div>

        <div className="local-image__actions">
          <button
            type="button"
            className="btn-secondary"
            disabled={saving}
            onClick={() => void saveSettings()}
          >
            {saving ? "Enregistrement…" : "Enregistrer"}
          </button>
          {saved ? <span className="muted">Enregistré.</span> : null}
        </div>

        {status ? (
          <p
            className={`local-image__status ${status.reachable ? "local-image__status--ok" : "local-image__status--off"}`}
          >
            {status.message}
          </p>
        ) : null}
      </section>

      <section className="panel">
        <h3>Test de génération</h3>
        <label className="local-image__field">
          <span className="local-image__label">Prompt</span>
          <textarea
            rows={3}
            value={prompt}
            onChange={(e) => setPrompt(e.target.value)}
            placeholder="Un chat roux sur un canapé vintage, lumière douce…"
          />
        </label>
        <label className="local-image__field">
          <span className="local-image__label">Prompt négatif (optionnel)</span>
          <input
            type="text"
            value={negativePrompt}
            onChange={(e) => setNegativePrompt(e.target.value)}
            placeholder="flou, basse qualité…"
          />
        </label>
        <button
          type="button"
          className="btn-primary"
          disabled={!settings.enabled || generating || !prompt.trim()}
          onClick={() => void generateImage()}
        >
          {generating ? "Génération…" : "Générer une image"}
        </button>
        {lastResult ? (
          <p className="panel__meta muted">
            Image enregistrée : <code>{lastResult.filename}</code>
            {" · "}
            {lastResult.width}×{lastResult.height}
            {" · "}
            {lastResult.backend}
          </p>
        ) : null}
      </section>
    </div>
  );
}
