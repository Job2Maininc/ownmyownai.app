import { useCallback, useEffect, useState } from "react";
import { invoke } from "@tauri-apps/api/core";
import { formatInvokeError } from "../lib/tauri-errors";
import type { CursorIntegrationInfo, HostSettings } from "../types";
import CursorMcpWizard from "./CursorMcpWizard";
import { EmptyStatePanel } from "./EmptyState";

type CopyKind = "url" | "token" | "config";

export default function CursorIntegration() {
  const [info, setInfo] = useState<CursorIntegrationInfo | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [copied, setCopied] = useState<CopyKind | null>(null);
  const [toggling, setToggling] = useState(false);
  const [savingBind, setSavingBind] = useState(false);

  const refresh = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const data = await invoke<CursorIntegrationInfo>("get_cursor_integration");
      setInfo(data);
    } catch (e) {
      setError(formatInvokeError(e));
      setInfo(null);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void refresh();
  }, [refresh]);

  async function copyText(text: string, kind: CopyKind) {
    await navigator.clipboard.writeText(text);
    setCopied(kind);
    window.setTimeout(() => setCopied(null), 2000);
  }

  async function patchGatewaySettings(patch: Partial<HostSettings>) {
    setSavingBind(true);
    setError(null);
    try {
      const settings = await invoke<HostSettings>("get_host_settings");
      await invoke("save_host_settings", {
        settings: { ...settings, ...patch },
      });
      await refresh();
    } catch (e) {
      setError(formatInvokeError(e));
    } finally {
      setSavingBind(false);
    }
  }

  async function toggleEnabled(enabled: boolean) {
    setToggling(true);
    setError(null);
    try {
      const settings = await invoke<HostSettings>("get_host_settings");
      await invoke("save_host_settings", {
        settings: { ...settings, cursorGatewayEnabled: enabled },
      });
      await refresh();
    } catch (e) {
      setError(formatInvokeError(e));
    } finally {
      setToggling(false);
    }
  }

  if (loading) {
    return (
      <section className="panel">
        <h2>Intégration Cursor</h2>
        <p className="panel__empty muted">Chargement…</p>
      </section>
    );
  }

  return (
    <div className="cursor-integration">
      <section className="panel">
        <div className="panel__head">
          <h2>Intégration Cursor</h2>
          <button type="button" className="btn-ghost" onClick={() => void refresh()}>
            Actualiser
          </button>
        </div>
        <p className="panel__meta muted">
          Connectez Cursor à votre Host pour l&apos;inférence locale — 0 crédit cloud, avec RAG et
          règles projet OwnMyOwnAI.
        </p>

        {error ? (
          <p className="error-line" role="alert">
            {error}
          </p>
        ) : null}

        {info ? (
          <>
            <label className="cursor-integration__toggle">
              <input
                type="checkbox"
                checked={info.enabled}
                disabled={toggling}
                onChange={(e) => void toggleEnabled(e.target.checked)}
              />
              <span>Passerelle OpenAI locale active</span>
            </label>

            <fieldset className="cursor-integration__bind" disabled={savingBind}>
              <legend className="cursor-integration__label">Écoute réseau</legend>
              <label className="cursor-integration__toggle">
                <input
                  type="radio"
                  name="gateway-bind"
                  checked={!info.lanEnabled}
                  onChange={() => void patchGatewaySettings({ cursorGatewayLan: false })}
                />
                <span>Localhost uniquement (127.0.0.1)</span>
              </label>
              <label className="cursor-integration__toggle">
                <input
                  type="radio"
                  name="gateway-bind"
                  checked={info.lanEnabled}
                  onChange={() => void patchGatewaySettings({ cursorGatewayLan: true })}
                />
                <span>Réseau local (LAN)</span>
              </label>
              {info.lanEnabled ? (
                <p className="error-line" role="note">
                  Accessible depuis les autres appareils du réseau local
                  {info.lanIp ? (
                    <>
                      {" "}
                      — IP suggérée : <code>{info.lanIp}</code>
                    </>
                  ) : (
                    " — IP locale non détectée ; vérifiez votre connexion réseau."
                  )}
                </p>
              ) : (
                <p className="panel__meta muted">
                  Recommandé : seul Cursor sur ce PC peut joindre la passerelle.
                </p>
              )}
              <label className="cursor-integration__field" htmlFor="cursor-gateway-port">
                <span className="cursor-integration__label">Port</span>
                <input
                  id="cursor-gateway-port"
                  type="number"
                  min={1024}
                  max={65535}
                  defaultValue={info.port}
                  key={info.port}
                  onBlur={(e) => {
                    const next = Number(e.target.value) || info.port;
                    if (next !== info.port) {
                      void patchGatewaySettings({ cursorGatewayPort: next });
                    }
                  }}
                />
              </label>
            </fieldset>

            <div className="cursor-integration__field">
              <span className="cursor-integration__label">URL de base</span>
              <div className="host-id-row">
                <code className="host-id">{info.baseUrl}</code>
                <button
                  type="button"
                  className="btn-ghost"
                  onClick={() => void copyText(info.baseUrl, "url")}
                >
                  {copied === "url" ? "Copié" : "Copier"}
                </button>
              </div>
            </div>

            <div className="cursor-integration__field">
              <span className="cursor-integration__label">Token API (Bearer)</span>
              <div className="host-id-row">
                <code className="host-id">{info.apiToken}</code>
                <button
                  type="button"
                  className="btn-ghost"
                  onClick={() => void copyText(info.apiToken, "token")}
                >
                  {copied === "token" ? "Copié" : "Copier"}
                </button>
              </div>
            </div>

            <p className="panel__meta muted">
              Modèle par défaut : <strong>{info.defaultModel}</strong>
              {" · "}
              Écoute :{" "}
              <strong>{info.lanEnabled ? "LAN" : "localhost"}</strong>
              {" · "}
              Port : <strong>{info.port}</strong>
            </p>

            <button
              type="button"
              className="btn-primary"
              style={{ width: "100%", marginTop: 12 }}
              onClick={() => void copyText(info.settingsJson, "config")}
            >
              {copied === "config" ? "Config copiée !" : "Copier config Cursor"}
            </button>

            <details className="cursor-integration__details">
              <summary>Snippet JSON Settings (Override OpenAI Base URL + modèle)</summary>
              <pre className="cursor-integration__snippet">{info.settingsJson}</pre>
            </details>

            <ol className="cursor-integration__steps muted">
              <li>Dans Cursor : Paramètres → Modèles → activer « Override OpenAI Base URL ».</li>
              <li>Collez l&apos;URL et le token ci-dessus, ou importez le JSON copié.</li>
              <li>Choisissez le modèle <code>{info.defaultModel}</code> dans la liste Cursor.</li>
            </ol>
          </>
        ) : (
          <EmptyStatePanel
            icon="link"
            title="PC non lié"
            description="Liez ce PC à votre compte pour afficher l'URL et le token d'intégration Cursor."
          />
        )}
      </section>

      <CursorMcpWizard />
    </div>
  );
}
