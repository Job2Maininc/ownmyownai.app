import { useCallback, useEffect, useState } from "react";
import { invoke } from "@tauri-apps/api/core";
import { open, save } from "@tauri-apps/plugin-dialog";

interface KnowledgeBase {
  id: string;
  name: string;
  description: string;
  systemInstruction?: string;
  docCount: number;
  status: string;
}

interface DocumentInfo {
  id: string;
  filename: string;
  status: string;
  chunkCount: number;
  errorMessage?: string | null;
  sourceType?: string;
  externalPath?: string | null;
}

interface ContextLink {
  id: string;
  knowledgeBaseId: string;
  linkType: string;
  path: string;
  recursive: boolean;
  enabled: boolean;
  lastSyncAt?: string | null;
  lastSyncStatus: string;
  lastSyncError?: string | null;
  docCount: number;
  symbolCount?: number;
}

const SUPPORTED_FILTERS = [
  { name: "Documents", extensions: ["txt", "md", "pdf", "docx"] },
];

function truncatePath(path: string, max = 48) {
  if (path.length <= max) return path;
  return `…${path.slice(-max + 1)}`;
}

function syncStatusLabel(link: ContextLink) {
  if (!link.enabled) return "En pause";
  switch (link.lastSyncStatus) {
    case "syncing":
      return "Indexation…";
    case "ready":
      return link.lastSyncAt ? `Synchronisé (${link.lastSyncAt})` : "Synchronisé";
    case "error":
      return "Erreur";
    default:
      return "En attente";
  }
}

export default function ContextManager() {
  const [bases, setBases] = useState<KnowledgeBase[]>([]);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [documents, setDocuments] = useState<DocumentInfo[]>([]);
  const [links, setLinks] = useState<ContextLink[]>([]);
  const [newName, setNewName] = useState("");
  const [systemInstruction, setSystemInstruction] = useState("");
  const [instructionDirty, setInstructionDirty] = useState(false);
  const [syncing, setSyncing] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const refreshBases = useCallback(async () => {
    try {
      const list = await invoke<KnowledgeBase[]>("list_knowledge_bases");
      setBases(list);
    } catch (e) {
      setError(String(e));
    }
  }, []);

  const refreshDocs = useCallback(async (kbId: string) => {
    try {
      const docs = await invoke<DocumentInfo[]>("list_context_documents", { kbId });
      setDocuments(docs);
    } catch (e) {
      setError(String(e));
    }
  }, []);

  const refreshLinks = useCallback(async (kbId: string) => {
    try {
      const list = await invoke<ContextLink[]>("list_context_links", { kbId });
      setLinks(list);
    } catch (e) {
      setError(String(e));
    }
  }, []);

  useEffect(() => {
    void refreshBases();
  }, [refreshBases]);

  useEffect(() => {
    if (!selectedId) return;
    void refreshDocs(selectedId);
    void refreshLinks(selectedId);
    const kb = bases.find((b) => b.id === selectedId);
    setSystemInstruction(kb?.systemInstruction ?? "");
    setInstructionDirty(false);
  }, [selectedId, refreshDocs, refreshLinks, bases]);

  async function saveSystemInstruction() {
    if (!selectedId) return;
    setError(null);
    try {
      await invoke("set_knowledge_base_system_instruction", {
        kbId: selectedId,
        systemInstruction,
      });
      setInstructionDirty(false);
      await refreshBases();
    } catch (e) {
      setError(String(e));
    }
  }

  async function createBase() {
    const name = newName.trim() || "Nouvelle base";
    setError(null);
    try {
      await invoke("ensure_embedding_model");
      await invoke("create_knowledge_base", { name, description: "" });
      setNewName("");
      await refreshBases();
    } catch (e) {
      setError(String(e));
    }
  }

  async function deleteBase(id: string) {
    if (!window.confirm("Supprimer cette base et tous ses documents indexés ?")) return;
    try {
      await invoke("delete_knowledge_base", { id });
      if (selectedId === id) setSelectedId(null);
      await refreshBases();
    } catch (e) {
      setError(String(e));
    }
  }

  async function exportBase(id: string) {
    const path = await save({
      title: "Exporter la base",
      defaultPath: "base-contexte.zip",
      filters: [{ name: "ZIP", extensions: ["zip"] }],
    });
    if (!path) return;
    try {
      await invoke("export_knowledge_base", { kbId: id, destPath: path });
    } catch (e) {
      setError(String(e));
    }
  }

  async function importBase() {
    const path = await open({
      title: "Importer une base",
      filters: [{ name: "ZIP", extensions: ["zip"] }],
      multiple: false,
    });
    if (!path || typeof path !== "string") return;
    try {
      await invoke("ensure_embedding_model");
      await invoke("import_knowledge_base", { zipPath: path });
      await refreshBases();
    } catch (e) {
      setError(String(e));
    }
  }

  async function linkFiles(kbId: string) {
    const paths = await open({
      title: "Lier des fichiers",
      multiple: true,
      filters: SUPPORTED_FILTERS,
    });
    if (!paths) return;
    const list = Array.isArray(paths) ? paths : [paths];
    setSyncing(true);
    setError(null);
    try {
      await invoke("ensure_embedding_model");
      await invoke("link_context_file", { kbId, paths: list });
      await refreshLinks(kbId);
      await refreshDocs(kbId);
      await refreshBases();
    } catch (e) {
      setError(String(e));
    } finally {
      setSyncing(false);
    }
  }

  async function linkFolder(kbId: string) {
    const path = await open({
      title: "Lier un dossier",
      directory: true,
      multiple: false,
    });
    if (!path || typeof path !== "string") return;
    setSyncing(true);
    setError(null);
    try {
      await invoke("ensure_embedding_model");
      await invoke("link_context_folder", { kbId, path, recursive: true });
      await refreshLinks(kbId);
      await refreshDocs(kbId);
      await refreshBases();
    } catch (e) {
      setError(String(e));
    } finally {
      setSyncing(false);
    }
  }

  async function linkRepo(kbId: string) {
    const path = await open({
      title: "Lier un dépôt Git",
      directory: true,
      multiple: false,
    });
    if (!path || typeof path !== "string") return;
    setSyncing(true);
    setError(null);
    try {
      await invoke("ensure_embedding_model");
      await invoke("link_context_repo", { kbId, path });
      await refreshLinks(kbId);
      await refreshDocs(kbId);
      await refreshBases();
    } catch (e) {
      setError(String(e));
    } finally {
      setSyncing(false);
    }
  }

  async function linkDrive(kbId: string) {
    const path = await open({
      title: "Lier un disque ou une racine",
      directory: true,
      multiple: false,
    });
    if (!path || typeof path !== "string") return;
    const ok = window.confirm(
      `Indexer tout le contenu sous « ${path} » peut prendre du temps et est limité à 500 fichiers.\n\nContinuer ?`,
    );
    if (!ok) return;
    setSyncing(true);
    setError(null);
    try {
      await invoke("ensure_embedding_model");
      await invoke("link_context_drive", { kbId, drivePath: path });
      await refreshLinks(kbId);
      await refreshDocs(kbId);
      await refreshBases();
    } catch (e) {
      setError(String(e));
    } finally {
      setSyncing(false);
    }
  }

  async function syncLink(linkId: string) {
    if (!selectedId) return;
    setSyncing(true);
    setError(null);
    try {
      await invoke("ensure_embedding_model");
      await invoke("sync_context_link", { linkId });
      await refreshLinks(selectedId);
      await refreshDocs(selectedId);
    } catch (e) {
      setError(String(e));
    } finally {
      setSyncing(false);
    }
  }

  async function toggleLink(link: ContextLink) {
    try {
      await invoke("set_context_link_enabled", { linkId: link.id, enabled: !link.enabled });
      if (selectedId) await refreshLinks(selectedId);
    } catch (e) {
      setError(String(e));
    }
  }

  async function unlinkLink(linkId: string) {
    if (!window.confirm("Supprimer ce lien ? Les fichiers sur le disque ne seront pas touchés.")) return;
    try {
      await invoke("unlink_context_link", { linkId });
      if (selectedId) {
        await refreshLinks(selectedId);
        await refreshDocs(selectedId);
        await refreshBases();
      }
    } catch (e) {
      setError(String(e));
    }
  }

  return (
    <section className="panel">
      <div className="panel__head">
        <h2>Bases de contexte</h2>
      </div>
      <p className="muted">
        Liez des fichiers ou dossiers (Google Drive local, disque…) — lus sur place, jamais envoyés au cloud.
      </p>
      <div className="context-create">
        <input
          value={newName}
          onChange={(e) => setNewName(e.target.value)}
          placeholder="Nom de la nouvelle base"
        />
        <button type="button" className="btn-secondary" onClick={() => void createBase()}>
          Créer
        </button>
        <button type="button" className="btn-ghost" onClick={() => void importBase()}>
          Importer ZIP
        </button>
      </div>
      <ul className="context-list">
        {bases.map((kb) => (
          <li key={kb.id} className={selectedId === kb.id ? "context-list__item--active" : ""}>
            <button type="button" className="context-list__btn" onClick={() => setSelectedId(kb.id)}>
              <strong>{kb.name}</strong>
              <span className="muted">
                {kb.docCount} doc(s) · {kb.status}
              </span>
            </button>
            <button type="button" className="btn-ghost" onClick={() => void exportBase(kb.id)}>
              Export
            </button>
            <button type="button" className="btn-ghost" onClick={() => void deleteBase(kb.id)}>
              Suppr.
            </button>
          </li>
        ))}
      </ul>
      {selectedId && (
        <div className="context-docs">
          <h3>Instruction système</h3>
          <p className="muted">
            Injectée avant le contexte RAG à chaque message (visible en lecture seule sur le web).
          </p>
          <textarea
            className="context-instruction"
            rows={4}
            value={systemInstruction}
            onChange={(e) => {
              setSystemInstruction(e.target.value);
              setInstructionDirty(true);
            }}
            placeholder="Ex. : Réponds toujours en français, style concis…"
          />
          <button
            type="button"
            className="btn-secondary"
            disabled={!instructionDirty}
            onClick={() => void saveSystemInstruction()}
          >
            Enregistrer l&apos;instruction
          </button>

          <h3>Sources liées</h3>
          <div className="context-create">
            <button
              type="button"
              className="btn-secondary"
              disabled={syncing}
              onClick={() => void linkFiles(selectedId)}
            >
              Fichier(s)
            </button>
            <button
              type="button"
              className="btn-secondary"
              disabled={syncing}
              onClick={() => void linkFolder(selectedId)}
            >
              Dossier
            </button>
            <button
              type="button"
              className="btn-secondary"
              disabled={syncing}
              onClick={() => void linkRepo(selectedId)}
            >
              Dépôt Git
            </button>
            <button
              type="button"
              className="btn-ghost"
              disabled={syncing}
              onClick={() => void linkDrive(selectedId)}
            >
              Disque…
            </button>
          </div>
          {syncing && <p className="muted">Synchronisation en cours…</p>}
          <ul>
            {links.length === 0 && (
              <li className="muted">Aucun lien — ajoutez un dossier Google Drive local par exemple.</li>
            )}
            {links.map((link) => (
              <li key={link.id}>
                <strong>{link.linkType}</strong> — {truncatePath(link.path)}
                <br />
                <span className="muted">
                  {syncStatusLabel(link)} · {link.docCount} doc(s)
                  {link.linkType === "repo" && (link.symbolCount ?? 0) > 0
                    ? ` · ${link.symbolCount} symbole(s)`
                    : ""}
                </span>
                {link.lastSyncError && (
                  <span className="error-line"> — {link.lastSyncError}</span>
                )}
                <div className="context-create">
                  <button type="button" className="btn-ghost" onClick={() => void syncLink(link.id)}>
                    Sync
                  </button>
                  <button type="button" className="btn-ghost" onClick={() => void toggleLink(link)}>
                    {link.enabled ? "Pause" : "Reprendre"}
                  </button>
                  <button type="button" className="btn-ghost" onClick={() => void unlinkLink(link.id)}>
                    Suppr. lien
                  </button>
                </div>
              </li>
            ))}
          </ul>

          <h3>Documents indexés</h3>
          <p className="muted">Vous pouvez aussi ajouter des fichiers depuis le chat web.</p>
          <ul>
            {documents.map((d) => (
              <li key={d.id}>
                {d.sourceType === "linked" ? "🔗 " : "📤 "}
                {d.filename} — {d.status}
                {d.chunkCount > 0 && ` (${d.chunkCount} extraits)`}
                {d.externalPath && (
                  <span className="muted"> — {truncatePath(d.externalPath)}</span>
                )}
                {d.errorMessage && <span className="error-line"> — {d.errorMessage}</span>}
              </li>
            ))}
          </ul>
        </div>
      )}
      {error && <p className="error-line">{error}</p>}
    </section>
  );
}
