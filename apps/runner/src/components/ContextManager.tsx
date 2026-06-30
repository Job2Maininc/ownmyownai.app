import { useCallback, useEffect, useState } from "react";
import { InlineDocIcon, SourceIcon, type SourceIconId } from "./Icons";
import ScheduledSyncPanel from "./ScheduledSyncPanel";
import EmptyState, { EmptyStatePanel } from "./EmptyState";
import { invoke } from "@tauri-apps/api/core";
import { listen } from "@tauri-apps/api/event";
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
  allowedExtensions: string[];
}

interface DriveInfo {
  path: string;
  label: string;
}

const EXTRACTABLE_EXTENSIONS = ["txt", "md", "pdf", "docx", "png", "jpg", "jpeg"] as const;

const SOURCE_TYPES: {
  id: SourceIconId;
  title: string;
  hint: string;
  iconId: SourceIconId;
}[] = [
  {
    id: "file",
    title: "Fichiers",
    hint: "Un ou plusieurs fichiers sur votre PC",
    iconId: "file",
  },
  {
    id: "folder",
    title: "Dossier",
    hint: "Un dossier et ses sous-dossiers",
    iconId: "folder",
  },
  {
    id: "repo",
    title: "Dépôt Git",
    hint: "Code source avec index des symboles",
    iconId: "repo",
  },
  {
    id: "drive",
    title: "Disque entier",
    hint: "C:, D:, clé USB — documents, code, PDF, texte",
    iconId: "drive",
  },
];

function truncatePath(path: string, max = 48) {
  if (path.length <= max) return path;
  return `…${path.slice(-max + 1)}`;
}

function linkTypeLabel(linkType: string) {
  switch (linkType) {
    case "file":
      return "Fichiers";
    case "folder":
      return "Dossier";
    case "repo":
      return "Dépôt Git";
    case "drive":
      return "Disque";
    default:
      return linkType;
  }
}

async function waitForBackgroundJob(jobId: string): Promise<void> {
  return new Promise((resolve, reject) => {
    let unlistenDone: (() => void) | undefined;
    let unlistenUpdate: (() => void) | undefined;
    const timeout = setTimeout(() => {
      unlistenDone?.();
      unlistenUpdate?.();
      reject(new Error("Délai d'indexation dépassé"));
    }, 600_000);

    const finish = (ok: () => void, err?: Error) => {
      clearTimeout(timeout);
      unlistenDone?.();
      unlistenUpdate?.();
      if (err) reject(err);
      else ok();
    };

    void listen<{ id: string; status: string; message: string }>(
      "background-job-done",
      (event) => {
        if (event.payload.id !== jobId) return;
        finish(resolve);
      },
    ).then((fn) => {
      unlistenDone = fn;
    });

    void listen<{ id: string; status: string; message: string }>(
      "background-job-update",
      (event) => {
        if (event.payload.id !== jobId) return;
        if (event.payload.status === "error") {
          finish(resolve, new Error(event.payload.message));
        }
        if (event.payload.status === "cancelled") {
          finish(resolve, new Error("Indexation annulée"));
        }
      },
    ).then((fn) => {
      unlistenUpdate = fn;
    });
  });
}

function syncStatusLabel(link: ContextLink) {
  if (!link.enabled) return "En pause";
  switch (link.lastSyncStatus) {
    case "syncing":
      return "Indexation…";
    case "ready":
      return link.lastSyncAt ? "Indexé" : "Prêt";
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
  const [showDrivePicker, setShowDrivePicker] = useState(false);
  const [drives, setDrives] = useState<DriveInfo[]>([]);
  const [showAdvanced, setShowAdvanced] = useState(false);

  const refreshBases = useCallback(async () => {
    try {
      const list = await invoke<KnowledgeBase[]>("list_knowledge_bases");
      setBases(list);
      if (!selectedId && list.length > 0) {
        setSelectedId(list[0].id);
      }
    } catch (e) {
      setError(String(e));
    }
  }, [selectedId]);

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

  async function ensureSelectedBase(): Promise<string | null> {
    if (selectedId) return selectedId;
    const name = newName.trim() || "Ma base IA";
    setError(null);
    try {
      await invoke("ensure_embedding_model");
      const kb = await invoke<KnowledgeBase>("create_knowledge_base", {
        name,
        description: "",
      });
      setNewName("");
      await refreshBases();
      setSelectedId(kb.id);
      return kb.id;
    } catch (e) {
      setError(String(e));
      return null;
    }
  }

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
    const kbId = await ensureSelectedBase();
    if (kbId) setSelectedId(kbId);
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
      title: "Choisir des fichiers",
      multiple: true,
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
      title: "Choisir un dossier",
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
      title: "Choisir un dépôt Git",
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

  async function linkDrivePath(kbId: string, drivePath: string) {
    const ok = window.confirm(
      `Indexer le contenu de « ${drivePath} » ?\n\n` +
        "Documents, code, PDF, images et fichiers texte (.log, .csv, .json…) seront indexés. " +
        "Les dossiers système (Windows, Program Files…) et les binaires sont ignorés. " +
        "Limite : 500 fichiers par scan.",
    );
    if (!ok) return;
    setSyncing(true);
    setError(null);
    setShowDrivePicker(false);
    try {
      await invoke("ensure_embedding_model");
      await invoke("link_context_drive", { kbId, drivePath });
      await refreshLinks(kbId);
      await refreshDocs(kbId);
      await refreshBases();
    } catch (e) {
      setError(String(e));
    } finally {
      setSyncing(false);
    }
  }

  async function openDrivePicker(kbId: string) {
    setError(null);
    try {
      const list = await invoke<DriveInfo[]>("list_windows_drives");
      setDrives(list);
      setShowDrivePicker(true);
    } catch (e) {
      setError(String(e));
    }
  }

  async function handleSourcePick(sourceId: (typeof SOURCE_TYPES)[number]["id"]) {
    const kbId = await ensureSelectedBase();
    if (!kbId) return;

    switch (sourceId) {
      case "file":
        await linkFiles(kbId);
        break;
      case "folder":
        await linkFolder(kbId);
        break;
      case "repo":
        await linkRepo(kbId);
        break;
      case "drive":
        await openDrivePicker(kbId);
        break;
    }
  }

  async function syncLink(linkId: string) {
    if (!selectedId) return;
    setSyncing(true);
    setError(null);
    try {
      await invoke("ensure_embedding_model");
      const jobId = await invoke<string>("sync_context_link", { linkId });
      await waitForBackgroundJob(jobId);
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

  async function toggleExtension(link: ContextLink, ext: string) {
    if (link.allowedExtensions.includes("*")) return;
    const current = new Set(link.allowedExtensions ?? [...EXTRACTABLE_EXTENSIONS]);
    if (current.has(ext)) {
      if (current.size <= 1) {
        setError("Au moins une extension doit rester active.");
        return;
      }
      current.delete(ext);
    } else {
      current.add(ext);
    }
    setSyncing(true);
    setError(null);
    try {
      await invoke("ensure_embedding_model");
      await invoke("set_context_link_extensions", {
        linkId: link.id,
        allowedExtensions: [...current],
      });
      if (selectedId) {
        await refreshLinks(selectedId);
        await refreshDocs(selectedId);
      }
    } catch (e) {
      setError(String(e));
    } finally {
      setSyncing(false);
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
        <h2>Base de données IA</h2>
      </div>
      <p className="muted">
        Choisissez d&apos;où l&apos;IA lit vos données. Tout reste sur votre PC — rien n&apos;est
        envoyé au cloud.
      </p>

      <div className="context-create">
        <input
          value={newName}
          onChange={(e) => setNewName(e.target.value)}
          placeholder="Nom de la base (ex. Mon projet)"
        />
        <button type="button" className="btn-secondary" onClick={() => void createBase()}>
          Créer
        </button>
        <button type="button" className="btn-ghost" onClick={() => void importBase()}>
          Importer ZIP
        </button>
      </div>

      {bases.length === 0 && (
        <EmptyStatePanel
          icon="folder"
          title="Créez votre première base"
          description="Nommez une base, puis liez des fichiers, dossiers ou dépôts Git pour alimenter le RAG local."
        />
      )}

      {bases.length > 0 && (
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
      )}

      <div className="source-picker">
        <h3>Choisissez la source de votre base de données IA</h3>
        <p className="muted source-picker__lead">
          Sélectionnez un type de source ci-dessous. L&apos;indexation démarre automatiquement après
          votre choix.
        </p>
        <div className="source-picker__grid">
          {SOURCE_TYPES.map((source) => (
            <button
              key={source.id}
              type="button"
              className="source-card"
              disabled={syncing}
              onClick={() => void handleSourcePick(source.id)}
            >
              <span className="source-card__icon" aria-hidden>
                <SourceIcon id={source.iconId} size={20} />
              </span>
              <strong>{source.title}</strong>
              <span className="muted">{source.hint}</span>
            </button>
          ))}
        </div>
        {syncing && <p className="muted">Indexation en cours…</p>}
      </div>

      {showDrivePicker && (
        <div className="drive-picker">
          <h4>Quel disque indexer ?</h4>
          <div className="drive-picker__grid">
            {drives.map((drive) => (
              <button
                key={drive.path}
                type="button"
                className="btn-secondary drive-picker__btn"
                disabled={syncing || !selectedId}
                onClick={() => selectedId && void linkDrivePath(selectedId, drive.path)}
              >
                {drive.label}
                <span className="muted">{drive.path}</span>
              </button>
            ))}
            <button
              type="button"
              className="btn-secondary drive-picker__btn"
              disabled={syncing || !selectedId}
              onClick={() => {
                setShowDrivePicker(false);
                if (selectedId) void linkFolder(selectedId);
              }}
            >
              Autre dossier…
              <span className="muted">Parcourir manuellement</span>
            </button>
          </div>
          <button type="button" className="btn-ghost" onClick={() => setShowDrivePicker(false)}>
            Annuler
          </button>
        </div>
      )}

      {selectedId && links.length > 0 && (
        <div className="context-sources">
          <h3>Sources connectées</h3>
          <ul className="context-sources__list">
            {links.map((link) => (
              <li key={link.id} className="context-sources__item">
                <div className="context-sources__head">
                  <strong>{linkTypeLabel(link.linkType)}</strong>
                  <span className="muted">{truncatePath(link.path)}</span>
                </div>
                <p className="muted">
                  {syncStatusLabel(link)} · {link.docCount} doc(s)
                  {link.linkType === "repo" && (link.symbolCount ?? 0) > 0
                    ? ` · ${link.symbolCount} symbole(s)`
                    : ""}
                  {link.allowedExtensions.includes("*") ? " · tous types de fichiers" : ""}
                </p>
                {link.lastSyncError && (
                  <p className={link.lastSyncStatus === "error" ? "error-line" : "muted"}>
                    {link.lastSyncError}
                  </p>
                )}
                {link.linkType !== "repo" && !link.allowedExtensions.includes("*") && (
                  <div className="context-create" role="group" aria-label="Types de fichiers indexés">
                    {EXTRACTABLE_EXTENSIONS.map((ext) => (
                      <label key={ext} className="muted" style={{ marginRight: "0.5rem" }}>
                        <input
                          type="checkbox"
                          checked={link.allowedExtensions.includes(ext)}
                          disabled={syncing}
                          onChange={() => void toggleExtension(link, ext)}
                        />{" "}
                        .{ext}
                      </label>
                    ))}
                  </div>
                )}
                <div className="context-create">
                  <button type="button" className="btn-ghost" onClick={() => void syncLink(link.id)}>
                    Réindexer
                  </button>
                  <button type="button" className="btn-ghost" onClick={() => void toggleLink(link)}>
                    {link.enabled ? "Pause" : "Reprendre"}
                  </button>
                  <button type="button" className="btn-ghost" onClick={() => void unlinkLink(link.id)}>
                    Supprimer
                  </button>
                </div>
              </li>
            ))}
          </ul>
        </div>
      )}

      <ScheduledSyncPanel />

      <button
        type="button"
        className="btn-ghost context-advanced-toggle"
        onClick={() => setShowAdvanced((v) => !v)}
      >
        {showAdvanced ? "Masquer les options avancées" : "Options avancées"}
      </button>

      {showAdvanced && selectedId && (
        <div className="context-advanced">
          <h3>Instruction système</h3>
          <p className="muted">
            Texte injecté avant chaque réponse de l&apos;IA (optionnel).
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

          <h3>Documents indexés</h3>
          <p className="muted">Vous pouvez aussi ajouter des fichiers depuis le chat web.</p>
          <ul>
            {documents.length === 0 && (
              <li>
                <EmptyState
                  icon="file"
                  variant="compact"
                  title="Aucun document indexé"
                  description="Liez une source ou uploadez des fichiers depuis le chat web."
                />
              </li>
            )}
            {documents.map((d) => (
              <li key={d.id} className="doc-list-item">
                <InlineDocIcon linked={d.sourceType === "linked"} />
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
