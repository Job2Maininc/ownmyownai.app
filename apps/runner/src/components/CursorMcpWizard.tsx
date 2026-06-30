import { useCallback, useEffect, useState } from "react";
import { invoke } from "@tauri-apps/api/core";
import { open } from "@tauri-apps/plugin-dialog";
import { formatInvokeError } from "../lib/tauri-errors";
import type { CursorMcpPreview, CursorMcpWriteResult } from "../types";

type CopyKind = "preview" | null;

export default function CursorMcpWizard() {
  const [preview, setPreview] = useState<CursorMcpPreview | null>(null);
  const [projectDir, setProjectDir] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [writing, setWriting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<CursorMcpWriteResult | null>(null);
  const [copied, setCopied] = useState<CopyKind>(null);

  const refreshPreview = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const data = await invoke<CursorMcpPreview>("preview_cursor_mcp_config");
      setPreview(data);
    } catch (e) {
      setError(formatInvokeError(e));
      setPreview(null);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void refreshPreview();
  }, [refreshPreview]);

  async function pickProjectDir() {
    setError(null);
    setSuccess(null);
    const path = await open({
      directory: true,
      multiple: false,
      title: "Dossier du projet Cursor",
    });
    if (typeof path === "string") {
      setProjectDir(path);
    }
  }

  async function copyPreview() {
    if (!preview?.configJson) return;
    await navigator.clipboard.writeText(preview.configJson);
    setCopied("preview");
    window.setTimeout(() => setCopied(null), 2000);
  }

  async function writeConfig() {
    if (!projectDir) {
      setError("Choisissez d'abord le dossier racine de votre projet.");
      return;
    }
    if (!preview?.serverFound) {
      setError(
        "Serveur MCP introuvable. Compilez-le avec : npm run build --workspace=@ownmyownai/omoa-mcp-server",
      );
      return;
    }

    setWriting(true);
    setError(null);
    setSuccess(null);
    try {
      const result = await invoke<CursorMcpWriteResult>("write_cursor_mcp_config", {
        projectDir,
      });
      setSuccess(result);
      await refreshPreview();
    } catch (e) {
      setError(formatInvokeError(e));
    } finally {
      setWriting(false);
    }
  }

  return (
    <section className="panel">
      <div className="panel__head">
        <h2>Ajouter à Cursor (MCP)</h2>
        <button type="button" className="btn-ghost" onClick={() => void refreshPreview()}>
          Actualiser
        </button>
      </div>
      <p className="panel__meta muted">
        Génère <code>.cursor/mcp.json</code> pour exposer le contexte OwnMyOwnAI dans Cursor :
        <code>search_chunks</code>, <code>read_file</code>, <code>list_dir</code>.
      </p>

      {loading ? (
        <p className="panel__empty muted">Chargement de la configuration MCP…</p>
      ) : null}

      {preview ? (
        <>
          <p className="panel__meta muted">
            Données Host : <code>{preview.dataDir}</code>
            {preview.serverPath ? (
              <>
                {" · "}
                Serveur : <code>{preview.serverPath}</code>
              </>
            ) : null}
          </p>

          {!preview.serverFound ? (
            <p className="error-line" role="alert">
              Serveur MCP non trouvé. Depuis la racine du monorepo :{" "}
              <code>npm run build --workspace=@ownmyownai/omoa-mcp-server</code>
            </p>
          ) : null}

          <ol className="cursor-integration__steps">
            <li>Choisissez le dossier racine de votre projet (là où Cursor ouvre le workspace).</li>
            <li>Cliquez <strong>Ajouter à Cursor</strong> — le fichier est créé ou fusionné.</li>
            <li>Redémarrez Cursor ou rechargez les serveurs MCP.</li>
          </ol>

          <div className="cursor-integration__field">
            <span className="cursor-integration__label">Dossier projet</span>
            <div className="host-id-row">
              <code className="host-id">
                {projectDir ?? "Aucun dossier sélectionné"}
              </code>
              <button type="button" className="btn-ghost" onClick={() => void pickProjectDir()}>
                Parcourir…
              </button>
            </div>
          </div>

          <div className="cursor-mcp-wizard__actions">
            <button
              type="button"
              className="btn-primary"
              style={{ flex: 1 }}
              disabled={writing || !preview.serverFound || !projectDir}
              onClick={() => void writeConfig()}
            >
              {writing ? "Écriture…" : "Ajouter à Cursor"}
            </button>
            <button
              type="button"
              className="btn-ghost"
              disabled={!preview.configJson}
              onClick={() => void copyPreview()}
            >
              {copied === "preview" ? "Copié" : "Copier JSON"}
            </button>
          </div>

          <details className="cursor-integration__details">
            <summary>Aperçu de .cursor/mcp.json</summary>
            <pre className="cursor-integration__snippet">{preview.configJson}</pre>
          </details>

          <p className="panel__meta muted">
            Le Host doit avoir démarré au moins une fois pour déchiffrer{" "}
            <code>context.db</code> (DPAPI Windows).
          </p>
        </>
      ) : null}

      {success ? (
        <p className="panel__meta" role="status">
          {success.merged ? "Configuration fusionnée dans" : "Fichier créé :"}{" "}
          <code>{success.path}</code>
        </p>
      ) : null}

      {error ? (
        <p className="error-line" role="alert">
          {error}
        </p>
      ) : null}
    </section>
  );
}
