import { useCallback, useEffect, useState } from "react";
import { invoke } from "@tauri-apps/api/core";
import type { ScheduledSyncReport, ScheduledSyncSettings } from "../types";

const DEFAULT_CRON = "0 3 * * *";

const CRON_PRESETS: { label: string; cron: string }[] = [
  { label: "Chaque jour à 3 h", cron: "0 3 * * *" },
  { label: "Chaque jour à minuit", cron: "0 0 * * *" },
  { label: "Chaque lundi à 6 h", cron: "0 6 * * 1" },
];

function formatTime(iso: string): string {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return iso;
  return d.toLocaleString("fr-FR", {
    day: "2-digit",
    month: "short",
    hour: "2-digit",
    minute: "2-digit",
  });
}

export default function ScheduledSyncPanel() {
  const [settings, setSettings] = useState<ScheduledSyncSettings>({
    enabled: false,
    cron: DEFAULT_CRON,
  });
  const [draftCron, setDraftCron] = useState(DEFAULT_CRON);
  const [dirty, setDirty] = useState(false);
  const [lastReport, setLastReport] = useState<ScheduledSyncReport | null>(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [running, setRunning] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const refresh = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const [syncSettings, report] = await Promise.all([
        invoke<ScheduledSyncSettings>("get_scheduled_sync"),
        invoke<ScheduledSyncReport | null>("get_last_scheduled_sync_report"),
      ]);
      setSettings(syncSettings);
      setDraftCron(syncSettings.cron);
      setDirty(false);
      setLastReport(report);
    } catch (e) {
      setError(String(e));
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void refresh();
  }, [refresh]);

  async function handleSave() {
    setSaving(true);
    setError(null);
    const next: ScheduledSyncSettings = {
      enabled: settings.enabled,
      cron: draftCron.trim() || DEFAULT_CRON,
    };
    try {
      await invoke("set_scheduled_sync", { settings: next });
      setSettings(next);
      setDraftCron(next.cron);
      setDirty(false);
    } catch (e) {
      setError(String(e));
    } finally {
      setSaving(false);
    }
  }

  async function handleToggleEnabled(enabled: boolean) {
    setSaving(true);
    setError(null);
    const next = { ...settings, enabled, cron: draftCron.trim() || DEFAULT_CRON };
    try {
      await invoke("set_scheduled_sync", { settings: next });
      setSettings(next);
      setDirty(false);
    } catch (e) {
      setError(String(e));
    } finally {
      setSaving(false);
    }
  }

  async function handleRunNow() {
    setRunning(true);
    setError(null);
    try {
      const report = await invoke<ScheduledSyncReport>("run_scheduled_sync_now");
      setLastReport(report);
    } catch (e) {
      setError(String(e));
    } finally {
      setRunning(false);
    }
  }

  function applyPreset(cron: string) {
    setDraftCron(cron);
    setDirty(cron !== settings.cron || settings.enabled);
  }

  if (loading) {
    return (
      <div className="scheduled-sync">
        <h3>Synchronisation planifiée</h3>
        <p className="muted">Chargement…</p>
      </div>
    );
  }

  return (
    <div className="scheduled-sync">
      <h3>Synchronisation planifiée</h3>
      <p className="muted">
        Réindexe automatiquement tous les liens actifs selon un horaire cron. Le rapport est
        enregistré localement dans <code>activity/sync-schedule.log</code>.
      </p>

      <label className="toggle-row">
        <input
          type="checkbox"
          checked={settings.enabled}
          disabled={saving || running}
          onChange={(e) => void handleToggleEnabled(e.target.checked)}
        />
        Activer la synchronisation planifiée
      </label>

      <div className="scheduled-sync__cron">
        <label htmlFor="scheduled-sync-cron">Expression cron</label>
        <input
          id="scheduled-sync-cron"
          type="text"
          value={draftCron}
          disabled={saving || running}
          onChange={(e) => {
            setDraftCron(e.target.value);
            setDirty(e.target.value.trim() !== settings.cron);
          }}
          placeholder="0 3 * * *"
          spellCheck={false}
        />
        <p className="muted">
          Format : minute heure jour mois jour-semaine. Ex. <code>0 3 * * *</code> = chaque jour à
          3 h.
        </p>
      </div>

      <div className="scheduled-sync__presets">
        {CRON_PRESETS.map((preset) => (
          <button
            key={preset.cron}
            type="button"
            className={`chip-filter${draftCron === preset.cron ? " chip-filter--active" : ""}`}
            disabled={saving || running}
            onClick={() => applyPreset(preset.cron)}
          >
            {preset.label}
          </button>
        ))}
      </div>

      <div className="context-create">
        <button
          type="button"
          className="btn-secondary"
          disabled={!dirty || saving || running}
          onClick={() => void handleSave()}
        >
          Enregistrer l&apos;horaire
        </button>
        <button
          type="button"
          className="btn-ghost"
          disabled={saving || running}
          onClick={() => void handleRunNow()}
        >
          {running ? "Synchronisation…" : "Exécuter maintenant"}
        </button>
      </div>

      {lastReport && (
        <div className="scheduled-sync__report">
          <h4>Dernière exécution</h4>
          <p className="muted">
            {formatTime(lastReport.finishedAt)} — {lastReport.linksTotal} lien(s),{" "}
            {lastReport.linksOk} ok
            {lastReport.linksError > 0 ? `, ${lastReport.linksError} erreur(s)` : ""}
          </p>
          {lastReport.links.length > 0 && (
            <ul className="scheduled-sync__links">
              {lastReport.links.map((link) => (
                <li key={link.linkId} className="muted">
                  {link.path} — {link.status}
                  {link.error ? ` (${link.error})` : ""}
                </li>
              ))}
            </ul>
          )}
        </div>
      )}

      {error && <p className="error-line">{error}</p>}
    </div>
  );
}
