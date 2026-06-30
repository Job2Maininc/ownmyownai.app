import { useCallback, useEffect, useState, type ReactNode } from "react";
import { invoke } from "@tauri-apps/api/core";
import { open } from "@tauri-apps/plugin-dialog";
import CursorIntegration from "./CursorIntegration";
import FallbackModelSelect from "./FallbackModelSelect";
import ModelTaskRoutingPanel from "./ModelTaskRoutingPanel";
import UserMemoryPanel from "./UserMemoryPanel";
import type { HostDataLayout, HostSettings } from "../types";

interface HostSettingsPanelProps {
  installedModels: string[];
  defaultModel: string;
  airGapped: boolean;
  togglingAirGapped: boolean;
  onAirGappedChange: (enabled: boolean) => void;
  onSettingsSaved?: () => void;
}

function SettingsSection({
  title,
  description,
  children,
}: {
  title: string;
  description?: string;
  children: ReactNode;
}) {
  return (
    <section className="panel settings-section" aria-label={title}>
      <h2>{title}</h2>
      {description ? <p className="muted panel__meta">{description}</p> : null}
      {children}
    </section>
  );
}

export default function HostSettingsPanel({
  installedModels,
  defaultModel,
  airGapped,
  togglingAirGapped,
  onAirGappedChange,
  onSettingsSaved,
}: HostSettingsPanelProps) {
  const [settings, setSettings] = useState<HostSettings | null>(null);
  const [layout, setLayout] = useState<HostDataLayout | null>(null);
  const [dataDirDraft, setDataDirDraft] = useState("");
  const [savingDataDir, setSavingDataDir] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const refresh = useCallback(async () => {
    try {
      const [nextSettings, nextLayout] = await Promise.all([
        invoke<HostSettings>("get_host_settings"),
        invoke<HostDataLayout>("get_host_data_layout"),
      ]);
      setSettings(nextSettings);
      setLayout(nextLayout);
      setDataDirDraft(nextSettings.dataDir?.trim() || nextLayout.dataDir);
    } catch (e) {
      setError(String(e));
    }
  }, []);

  useEffect(() => {
    void refresh();
  }, [refresh]);

  async function patchSettings(patch: Partial<HostSettings>) {
    if (!settings) return;
    setSaving(true);
    setError(null);
    try {
      const next = { ...settings, ...patch };
      await invoke("save_host_settings", { settings: next });
      setSettings(next);
      onSettingsSaved?.();
    } catch (e) {
      setError(String(e));
    } finally {
      setSaving(false);
    }
  }

  async function saveDataDir() {
    const trimmed = dataDirDraft.trim();
    if (!trimmed) return;
    setSavingDataDir(true);
    setError(null);
    try {
      await invoke("save_host_data_dir", { dataDir: trimmed });
      await refresh();
      onSettingsSaved?.();
    } catch (e) {
      setError(String(e));
    } finally {
      setSavingDataDir(false);
    }
  }

  async function browseDataDir() {
    const picked = await open({
      directory: true,
      multiple: false,
      title: "Choisir le dossier de données OwnMyOwnAI",
      defaultPath: dataDirDraft || undefined,
    });
    if (typeof picked === "string") {
      setDataDirDraft(picked);
    }
  }

  return (
    <div className="settings-stack">
      <SettingsSection
        title="Réseau et sécurité"
        description="Le mode air-gapped désactive le relay WebSocket et la synchronisation cloud. Le chat local reste disponible."
      >
        <label className="toggle-row">
          <input
            type="checkbox"
            checked={airGapped}
            disabled={togglingAirGapped || saving}
            onChange={(e) => onAirGappedChange(e.target.checked)}
          />
          Mode air-gapped (hors ligne total)
        </label>
      </SettingsSection>

      <SettingsSection
        title="Stockage"
        description="Emplacement des modèles, du contexte RAG, de l'historique et des créations."
      >
        <label className="field-label" htmlFor="settings-data-dir">
          Dossier de données
        </label>
        <div className="path-row">
          <input
            id="settings-data-dir"
            value={dataDirDraft}
            onChange={(e) => setDataDirDraft(e.target.value)}
            placeholder="D:\OwnMyOwnAI"
          />
          <button type="button" className="btn-secondary" onClick={() => void browseDataDir()}>
            Parcourir…
          </button>
        </div>
        {layout ? (
          <ul className="storage-layout muted" style={{ fontSize: 13, marginTop: 12 }}>
            <li>
              <strong>Modèles</strong> — {layout.modelsDir}
            </li>
            <li>
              <strong>Contexte</strong> — {layout.contextDir}
            </li>
            <li>
              <strong>Créations</strong> — {layout.creativesDir}
            </li>
            <li>
              <strong>Activité</strong> — {layout.activityDir}
            </li>
          </ul>
        ) : null}
        <button
          type="button"
          className="btn-secondary"
          style={{ marginTop: 12 }}
          disabled={savingDataDir || !dataDirDraft.trim()}
          onClick={() => void saveDataDir()}
        >
          {savingDataDir ? "Enregistrement…" : "Enregistrer l'emplacement"}
        </button>
      </SettingsSection>

      <SettingsSection
        title="Modèles"
        description="Routage automatique par intention et modèle de secours."
      >
        <ModelTaskRoutingPanel installedModels={installedModels} defaultModel={defaultModel} />
        <FallbackModelSelect
          installedModels={installedModels}
          defaultModel={defaultModel}
          selectId="settings-fallback-model"
          disabled={saving}
          onError={setError}
          onChange={() => onSettingsSaved?.()}
        />
      </SettingsSection>

      <SettingsSection
        title="RAG"
        description="Recherche documentaire et découpage à l'indexation. Réindexez les liens après modification de la taille des extraits."
      >
        <div className="settings-fields-grid">
          <div className="field-row">
            <label className="field-label" htmlFor="rag-top-k">
              Passages RAG (top K)
            </label>
            <input
              id="rag-top-k"
              type="number"
              min={1}
              max={50}
              step={1}
              value={settings?.ragTopK ?? 5}
              disabled={saving || !settings}
              onChange={(e) =>
                void patchSettings({ ragTopK: Math.max(1, Number(e.target.value) || 5) })
              }
            />
            <p className="muted path-hint">Extraits injectés par question (1–50).</p>
          </div>
          <div className="field-row">
            <label className="field-label" htmlFor="rag-chunk-tokens">
              Taille des extraits (tokens)
            </label>
            <input
              id="rag-chunk-tokens"
              type="number"
              min={50}
              max={4000}
              step={50}
              value={settings?.ragChunkTokens ?? 400}
              disabled={saving || !settings}
              onChange={(e) =>
                void patchSettings({
                  ragChunkTokens: Math.max(50, Number(e.target.value) || 400),
                })
              }
            />
            <p className="muted path-hint">Découpage à l&apos;indexation — réindexez pour appliquer.</p>
          </div>
        </div>
      </SettingsSection>

      <SettingsSection
        title="Conversation"
        description="Compaction automatique de l'historique quand le contexte devient trop long."
      >
        <div className="settings-fields-grid">
          <div className="field-row">
            <label className="field-label" htmlFor="chat-token-threshold">
              Seuil de tokens
            </label>
            <input
              id="chat-token-threshold"
              type="number"
              min={1000}
              max={100000}
              step={500}
              value={settings?.chatTokenThreshold ?? 6000}
              disabled={saving || !settings}
              onChange={(e) =>
                void patchSettings({ chatTokenThreshold: Number(e.target.value) || 6000 })
              }
            />
          </div>
          <div className="field-row">
            <label className="field-label" htmlFor="chat-recent-messages">
              Messages récents conservés
            </label>
            <input
              id="chat-recent-messages"
              type="number"
              min={4}
              max={50}
              step={1}
              value={settings?.chatRecentMessages ?? 12}
              disabled={saving || !settings}
              onChange={(e) =>
                void patchSettings({ chatRecentMessages: Number(e.target.value) || 12 })
              }
            />
          </div>
        </div>
      </SettingsSection>

      <SettingsSection
        title="Notifications"
        description="Alertes Windows à la fin d'une indexation ou d'un agent en arrière-plan."
      >
        <label className="toggle-row">
          <input
            type="checkbox"
            checked={settings?.desktopNotifications ?? true}
            disabled={saving || !settings}
            onChange={(e) => void patchSettings({ desktopNotifications: e.target.checked })}
          />
          Notifications bureau activées
        </label>
      </SettingsSection>

      <CursorIntegration />

      <SettingsSection
        title="Synchronisation planifiée"
        description="Resynchronisation automatique des liens de contexte (expression cron 5 champs)."
      >
        <label className="toggle-row">
          <input
            type="checkbox"
            checked={settings?.scheduledSync?.enabled ?? false}
            disabled={saving || !settings}
            onChange={(e) =>
              void patchSettings({
                scheduledSync: {
                  enabled: e.target.checked,
                  cron: settings?.scheduledSync?.cron ?? "0 3 * * *",
                },
              })
            }
          />
          Synchronisation planifiée activée
        </label>
        <div className="field-row" style={{ marginTop: 12 }}>
          <label className="field-label" htmlFor="scheduled-sync-cron">
            Expression cron
          </label>
          <input
            id="scheduled-sync-cron"
            value={settings?.scheduledSync?.cron ?? "0 3 * * *"}
            disabled={saving || !settings || !settings.scheduledSync?.enabled}
            placeholder="0 3 * * *"
            onChange={(e) =>
              void patchSettings({
                scheduledSync: {
                  enabled: settings?.scheduledSync?.enabled ?? false,
                  cron: e.target.value,
                },
              })
            }
          />
          <p className="muted path-hint">Ex. 0 3 * * * = chaque jour à 03:00.</p>
        </div>
      </SettingsSection>

      <UserMemoryPanel />

      {error ? (
        <p className="error-banner" role="alert">
          {error}
        </p>
      ) : null}
    </div>
  );
}
