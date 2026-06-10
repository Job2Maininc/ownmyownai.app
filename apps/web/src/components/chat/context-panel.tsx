"use client";

import { useCallback, useEffect, useState } from "react";
import type {
  ChunkPreview,
  ContextDocumentSummary,
  ContextLinkSummary,
  KnowledgeBaseSummary,
  ProjectSummary,
} from "@ownmyownai/protocol";
import type { RelayClient } from "@/lib/relay-client";
import { Button } from "@/components/ui/button";
import { ContextUploadSkeleton } from "./chat-skeleton";
import { InlineEditPanel } from "./inline-edit-panel";

interface ContextPanelProps {
  relay: RelayClient | null;
  connected: boolean;
  activeIds: string[];
  onActiveChange: (ids: string[]) => void;
  activeProjectId?: string | null;
  onProjectChange?: (projectId: string | null, kbaseIds: string[]) => void;
}

function contextStorageKey(hostId: string) {
  return `context-active:${hostId}`;
}

export function loadActiveContextIds(hostId: string): string[] {
  if (typeof window === "undefined") return [];
  try {
    const raw = sessionStorage.getItem(contextStorageKey(hostId));
    return raw ? (JSON.parse(raw) as string[]) : [];
  } catch {
    return [];
  }
}

function formatPanelError(error: unknown): string {
  const message = error instanceof Error ? error.message : String(error);
  return message.replace(/^Error:\s*/i, "");
}

function truncatePath(path: string, max = 40) {
  if (path.length <= max) return path;
  return `…${path.slice(-max + 1)}`;
}

function isLinkedMarkdown(doc: ContextDocumentSummary) {
  return doc.sourceType === "linked" && doc.filename.toLowerCase().endsWith(".md");
}

function linkStatusLabel(link: ContextLinkSummary) {
  if (!link.enabled) return "En pause";
  switch (link.lastSyncStatus) {
    case "syncing":
      return "Indexation…";
    case "ready":
      return "Synchronisé";
    case "error":
      return "Erreur";
    default:
      return "En attente";
  }
}

export function ContextPanel({
  relay,
  connected,
  activeIds,
  onActiveChange,
  activeProjectId = null,
  onProjectChange,
}: ContextPanelProps) {
  const [projects, setProjects] = useState<ProjectSummary[]>([]);
  const [bases, setBases] = useState<KnowledgeBaseSummary[]>([]);
  const [expandedId, setExpandedId] = useState<string | null>(null);
  const [documents, setDocuments] = useState<ContextDocumentSummary[]>([]);
  const [links, setLinks] = useState<ContextLinkSummary[]>([]);
  const [newName, setNewName] = useState("");
  const [loading, setLoading] = useState(false);
  const [uploading, setUploading] = useState(false);
  const [uploadPercent, setUploadPercent] = useState(0);
  const [uploadMessage, setUploadMessage] = useState("");
  const [chunksDocId, setChunksDocId] = useState<string | null>(null);
  const [chunks, setChunks] = useState<ChunkPreview[]>([]);
  const [chunksLoading, setChunksLoading] = useState(false);
  const [inlineEditDoc, setInlineEditDoc] = useState<ContextDocumentSummary | null>(null);
  const [inlineEditSelection, setInlineEditSelection] = useState("");
  const [error, setError] = useState<string | null>(null);

  const refreshProjects = useCallback(async () => {
    if (!relay || !connected) return;
    try {
      const { projects: list } = await relay.listProjects();
      setProjects(list);
    } catch {
      /* Host < v0.3 sans projets */
    }
  }, [relay, connected]);

  const refresh = useCallback(async () => {
    if (!relay || !connected) return;
    setLoading(true);
    setError(null);
    try {
      const [list] = await Promise.all([
        relay.listContextBases(),
        refreshProjects(),
      ]);
      setBases(list);
    } catch (e) {
      const message = formatPanelError(e);
      setError(
        message.includes("ne répond pas")
          ? `${message} (installez la v0.2.0+ si besoin)`
          : message,
      );
    } finally {
      setLoading(false);
    }
  }, [relay, connected, refreshProjects]);

  const refreshStatus = useCallback(
    async (kbId: string) => {
      if (!relay || !connected) return;
      const status = await relay.getContextStatus(kbId);
      setDocuments(status.documents);
      setLinks(status.links);
    },
    [relay, connected],
  );

  useEffect(() => {
    void refresh();
  }, [refresh]);

  useEffect(() => {
    if (!expandedId || !relay || !connected) return;
    void refreshStatus(expandedId).catch(() => undefined);
  }, [expandedId, relay, connected, bases, refreshStatus]);

  async function handleOpenProject(id: string) {
    if (!relay) return;
    setError(null);
    try {
      const opened = await relay.openProject(id);
      onProjectChange?.(opened.project.id, opened.knowledgeBaseIds);
      onActiveChange(opened.knowledgeBaseIds);
      await refreshProjects();
    } catch (e) {
      setError(formatPanelError(e));
    }
  }

  function toggleActive(id: string) {
    const next = activeIds.includes(id)
      ? activeIds.filter((x) => x !== id)
      : [...activeIds, id];
    onActiveChange(next);
  }

  async function handleCreate() {
    if (!relay) return;
    setError(null);
    try {
      await relay.createContextBase(newName.trim() || "Nouvelle base");
      setNewName("");
      await refresh();
    } catch (e) {
      setError(formatPanelError(e));
    }
  }

  async function handleDelete(id: string) {
    if (!relay || !window.confirm("Supprimer cette base ?")) return;
    try {
      await relay.deleteContextBase(id);
      onActiveChange(activeIds.filter((x) => x !== id));
      await refresh();
    } catch (e) {
      setError(formatPanelError(e));
    }
  }

  async function handleDeleteDocument(documentId: string) {
    if (!relay || !expandedId || !window.confirm("Retirer ce document de l'index ?")) return;
    try {
      await relay.deleteContextDocument(documentId);
      await refreshStatus(expandedId);
      await refresh();
    } catch (e) {
      setError(formatPanelError(e));
    }
  }

  async function handleViewChunks(documentId: string) {
    if (!relay) return;
    if (chunksDocId === documentId) {
      setChunksDocId(null);
      setChunks([]);
      setInlineEditDoc(null);
      setInlineEditSelection("");
      return;
    }
    setChunksLoading(true);
    setError(null);
    setInlineEditDoc(null);
    setInlineEditSelection("");
    try {
      const list = await relay.getContextChunks(documentId);
      setChunksDocId(documentId);
      setChunks(list);
    } catch (e) {
      setError(formatPanelError(e));
    } finally {
      setChunksLoading(false);
    }
  }

  function openInlineEdit(doc: ContextDocumentSummary, selection: string) {
    setInlineEditDoc(doc);
    setInlineEditSelection(selection);
  }

  async function handleInlineEditApplied() {
    if (!relay || !expandedId) return;
    await refreshStatus(expandedId);
    if (inlineEditDoc) {
      const list = await relay.getContextChunks(inlineEditDoc.id);
      setChunks(list);
    }
    await refresh();
  }

  async function handleUpload(kbId: string, files: FileList | null) {
    if (!relay || !files?.length) return;
    setUploading(true);
    setUploadPercent(0);
    setUploadMessage("Envoi…");
    setError(null);
    try {
      for (const file of Array.from(files)) {
        await relay.uploadContextDocument(kbId, file.name, await file.arrayBuffer(), (percent, message) => {
          setUploadPercent(percent);
          setUploadMessage(message);
        });
      }
      if (expandedId === kbId) {
        await refreshStatus(kbId);
      }
      await refresh();
    } catch (e) {
      setError(formatPanelError(e));
    } finally {
      setUploading(false);
      setUploadPercent(0);
      setUploadMessage("");
    }
  }

  return (
    <aside className="context-panel" aria-label="Bases de contexte">
      {projects.length > 0 && (
        <section className="mb-4">
          <h2 className="context-panel__title">Projets</h2>
          <p className="text-xs text-[var(--muted)]">
            Ouvrir un projet active toutes ses bases en un clic.
          </p>
          <ul className="mt-2 space-y-2">
            {projects.map((project) => (
              <li key={project.id} className="rounded border border-[var(--border)] p-2">
                <div className="flex items-center gap-2">
                  <button
                    type="button"
                    className={`rounded px-2 py-0.5 text-xs ${activeProjectId === project.id ? "bg-neutral-100" : "bg-white"}`}
                    onClick={() => void handleOpenProject(project.id)}
                  >
                    {activeProjectId === project.id ? "Actif" : "Ouvrir"}
                  </button>
                  <span className="flex-1 text-sm font-medium">{project.name}</span>
                </div>
                <p className="text-xs text-[var(--muted)]">
                  {project.knowledgeBaseIds.length} base(s)
                </p>
                {project.systemInstruction?.trim() && (
                  <p className="mt-1 text-xs text-[var(--muted)]" title={project.systemInstruction}>
                    Instruction :{" "}
                    {project.systemInstruction.length > 80
                      ? `${project.systemInstruction.slice(0, 80)}…`
                      : project.systemInstruction}
                  </p>
                )}
              </li>
            ))}
          </ul>
        </section>
      )}
      <h2 className="context-panel__title">Bases de contexte</h2>
      <p className="text-xs text-[var(--muted)]">
        Documents locaux sur votre PC — jamais stockés dans le cloud. Liez des dossiers depuis l&apos;app Host.
      </p>
      <div className="mt-2 flex gap-2">
        <input
          value={newName}
          onChange={(e) => setNewName(e.target.value)}
          placeholder="Nouvelle base"
          className="flex-1 rounded border border-[var(--border)] bg-white px-2 py-1 text-sm"
          disabled={!connected}
        />
        <Button type="button" variant="secondary" disabled={!connected} onClick={() => void handleCreate()}>
          Créer
        </Button>
      </div>
      {loading && <p className="mt-2 text-sm text-[var(--muted)]">Chargement…</p>}
      <ul className="mt-3 space-y-2">
        {bases.map((kb) => (
          <li key={kb.id} className="rounded border border-[var(--border)] p-2">
            <div className="flex items-center gap-2">
              <button
                type="button"
                className={`rounded px-2 py-0.5 text-xs ${activeIds.includes(kb.id) ? "bg-neutral-100" : "bg-white"}`}
                onClick={() => toggleActive(kb.id)}
              >
                {activeIds.includes(kb.id) ? "Actif" : "Activer"}
              </button>
              <button
                type="button"
                className="flex-1 text-left text-sm font-medium"
                onClick={() => setExpandedId(expandedId === kb.id ? null : kb.id)}
              >
                {kb.name}
              </button>
              <button
                type="button"
                className="text-xs text-red-400"
                onClick={() => void handleDelete(kb.id)}
              >
                ×
              </button>
            </div>
            <p className="text-xs text-[var(--muted)]">
              {kb.docCount} doc(s) · {kb.status}
            </p>
            {expandedId === kb.id && (
              <div className="mt-2">
                {kb.systemInstruction?.trim() ? (
                  <div className="mb-2 rounded border border-[var(--border)] p-2">
                    <p className="text-xs font-medium">Instruction système (lecture seule)</p>
                    <p className="mt-1 whitespace-pre-wrap text-xs text-[var(--muted)]">
                      {kb.systemInstruction}
                    </p>
                  </div>
                ) : (
                  <p className="mb-2 text-xs text-[var(--muted)]">
                    Aucune instruction — définissez-en une dans l&apos;app Host.
                  </p>
                )}
                {links.length > 0 && (
                  <div className="mb-2 rounded border border-[var(--border)] p-2">
                    <p className="text-xs font-medium">Sources liées (Host)</p>
                    <ul className="mt-1 space-y-1 text-xs text-[var(--muted)]">
                      {links.map((link) => (
                        <li key={link.id}>
                          🔗 {truncatePath(link.path)} — {linkStatusLabel(link)}
                          {link.lastSyncError && (
                            <span className="text-red-400"> ({link.lastSyncError})</span>
                          )}
                        </li>
                      ))}
                    </ul>
                  </div>
                )}
                {links.length === 0 && (
                  <p className="mb-2 text-xs text-[var(--muted)]">
                    Ajoutez des dossiers depuis l&apos;app Host sur ce PC (Google Drive local, etc.).
                  </p>
                )}
                {uploading ? (
                  <div>
                    <ContextUploadSkeleton />
                    {uploadPercent > 0 && (
                      <p className="mt-1 text-xs text-[var(--muted)]">
                        {uploadMessage || "Indexation…"} ({Math.round(uploadPercent)}%)
                      </p>
                    )}
                  </div>
                ) : (
                  <label className="block cursor-pointer rounded border border-dashed border-[var(--border)] p-3 text-center text-xs text-[var(--muted)] hover:border-neutral-400">
                    Glisser-déposer ou cliquer (.txt, .md, .pdf, .docx)
                    <input
                      type="file"
                      className="hidden"
                      accept=".txt,.md,.pdf,.docx"
                      multiple
                      disabled={uploading}
                      onChange={(e) => void handleUpload(kb.id, e.target.files)}
                    />
                  </label>
                )}
                <ul className="mt-2 space-y-1 text-xs">
                  {documents.map((d) => (
                    <li key={d.id}>
                      <div className="flex items-center gap-2">
                        <span>
                          {d.sourceType === "linked" ? "🔗" : "📤"} {d.filename} — {d.status}
                          {d.chunkCount > 0 && ` (${d.chunkCount} extraits)`}
                        </span>
                        {d.externalPath && (
                          <span className="text-[var(--muted)]" title={d.externalPath}>
                            {truncatePath(d.externalPath)}
                          </span>
                        )}
                        {d.status === "ready" && d.chunkCount > 0 && (
                          <button
                            type="button"
                            className="link"
                            onClick={() => void handleViewChunks(d.id)}
                          >
                            {chunksDocId === d.id ? "Masquer" : "Extraits"}
                          </button>
                        )}
                        <button
                          type="button"
                          className="text-red-400 hover:underline"
                          onClick={() => void handleDeleteDocument(d.id)}
                        >
                          Retirer
                        </button>
                      </div>
                      {d.errorMessage && (
                        <p className="text-red-400">{d.errorMessage}</p>
                      )}
                    </li>
                  ))}
                </ul>
                {chunksLoading && (
                  <p className="mt-2 text-xs text-[var(--muted)]">Chargement des extraits…</p>
                )}
                {chunksDocId && chunks.length > 0 && (
                  <ol className="mt-2 max-h-48 space-y-2 overflow-y-auto rounded border border-[var(--border)] p-2 text-xs">
                    {chunks.map((c) => {
                      const doc = documents.find((d) => d.id === chunksDocId);
                      const editable = doc && isLinkedMarkdown(doc);
                      return (
                        <li key={c.id}>
                          <div className="flex items-start justify-between gap-2">
                            <p className="flex-1 whitespace-pre-wrap">
                              <span className="text-[var(--muted)]">#{c.index + 1}</span>{" "}
                              {c.preview}
                            </p>
                            {editable && relay && (
                              <button
                                type="button"
                                className="shrink-0 link"
                                onClick={() => openInlineEdit(doc, c.preview)}
                              >
                                Reformuler
                              </button>
                            )}
                          </div>
                        </li>
                      );
                    })}
                  </ol>
                )}
                {inlineEditDoc && relay && (
                  <InlineEditPanel
                    relay={relay}
                    documentId={inlineEditDoc.id}
                    filename={inlineEditDoc.filename}
                    initialSelection={inlineEditSelection}
                    onApplied={() => void handleInlineEditApplied()}
                    onClose={() => {
                      setInlineEditDoc(null);
                      setInlineEditSelection("");
                    }}
                  />
                )}
              </div>
            )}
          </li>
        ))}
      </ul>
      {error && <p className="mt-2 text-sm text-red-400">{error}</p>}
    </aside>
  );
}
