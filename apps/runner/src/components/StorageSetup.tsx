import { useCallback, useEffect, useState } from "react";
import { invoke } from "@tauri-apps/api/core";
import { open } from "@tauri-apps/plugin-dialog";
import type { HostDataLayout } from "../types";

interface StorageSetupProps {
  onContinue: (dataDir: string) => void;
  error: string | null;
}

export default function StorageSetup({ onContinue, error }: StorageSetupProps) {
  const [dataDir, setDataDir] = useState("");
  const [layout, setLayout] = useState<HostDataLayout | null>(null);
  const [localError, setLocalError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);

  const previewLayout = useCallback((dir: string): HostDataLayout => {
    const root = dir.trim();
    return {
      dataDir: root,
      modelsDir: `${root}\\models`,
      contextDir: `${root}\\context`,
      creativesDir: `${root}\\creatives`,
      activityDir: `${root}\\activity`,
    };
  }, []);

  const refreshLayout = useCallback(
    (dir: string) => {
      if (!dir.trim()) return;
      setLayout(previewLayout(dir));
    },
    [previewLayout],
  );

  const loadDefaults = useCallback(async () => {
    try {
      const settings = await invoke<{ dataDir?: string }>("get_host_settings");
      const fallback = await invoke<string>("get_default_data_dir");
      const initial = settings.dataDir?.trim() || fallback;
      setDataDir(initial);
      refreshLayout(initial);
    } catch {
      const fallback = await invoke<string>("get_default_data_dir");
      setDataDir(fallback);
      refreshLayout(fallback);
    }
  }, [refreshLayout]);

  useEffect(() => {
    void loadDefaults();
  }, [loadDefaults]);

  async function browseDataDir() {
    const picked = await open({
      directory: true,
      multiple: false,
      title: "Choisir le dossier de données OwnMyOwnAI",
      defaultPath: dataDir || undefined,
    });
    if (typeof picked === "string") {
      setDataDir(picked);
      refreshLayout(picked);
    }
  }

  async function handleContinue() {
    setLocalError(null);
    const trimmed = dataDir.trim();
    if (!trimmed) {
      setLocalError("Choisissez un dossier ou un disque.");
      return;
    }

    setSaving(true);
    try {
      await invoke("save_host_data_dir", { dataDir: trimmed });
      const next = await invoke<HostDataLayout>("get_host_data_layout");
      setLayout(next);
      onContinue(trimmed);
    } catch (e) {
      setLocalError(String(e));
    } finally {
      setSaving(false);
    }
  }

  return (
    <>
      <h1>Dossier de données</h1>
      <p className="muted" style={{ fontSize: 14 }}>
        Choisissez où le Host stocke tout : modèles IA, contexte, historique des
        conversations, activité des clients et créations générées. Un disque entier
        ou un simple dossier convient — si vous choisissez la racine d&apos;un disque,
        un sous-dossier <code className="inline-code">OwnMyOwnAI-Host</code> sera créé.
      </p>

      <label className="field-label" style={{ marginTop: 16 }}>
        Emplacement principal
      </label>
      <div className="path-row">
        <input
          value={dataDir}
          onChange={(e) => setDataDir(e.target.value)}
          placeholder="D:\OwnMyOwnAI ou E:\"
        />
        <button type="button" className="btn-secondary" onClick={browseDataDir}>
          Parcourir…
        </button>
      </div>

      {layout && (
        <ul className="storage-layout muted" style={{ fontSize: 13, marginTop: 12 }}>
          <li>
            <strong>Modèles IA</strong> — {layout.modelsDir}
          </li>
          <li>
            <strong>Contexte &amp; base</strong> — {layout.contextDir}
          </li>
          <li>
            <strong>Créations</strong> — {layout.creativesDir}
          </li>
          <li>
            <strong>Activité clients</strong> — {layout.activityDir}
          </li>
        </ul>
      )}

      <button
        type="button"
        className="btn-primary"
        style={{ width: "100%", marginTop: 16 }}
        onClick={handleContinue}
        disabled={saving || !dataDir.trim()}
      >
        {saving ? "Préparation…" : "Continuer"}
      </button>

      {(localError || error) && (
        <p className="error-banner">{localError ?? error}</p>
      )}
    </>
  );
}
