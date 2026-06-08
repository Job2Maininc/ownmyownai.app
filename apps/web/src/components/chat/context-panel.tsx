"use client";

import { useCallback, useEffect, useState } from "react";
import type {
  ChunkPreview,
  ContextDocumentSummary,
  KnowledgeBaseSummary,
} from "@ownmyownai/protocol";
import type { RelayClient } from "@/lib/relay-client";
import { Button } from "@/components/ui/button";
import { ContextUploadSkeleton } from "./chat-skeleton";

interface ContextPanelProps {
  relay: RelayClient | null;
  connected: boolean;
  activeIds: string[];
  onActiveChange: (ids: string[]) => void;
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

export function ContextPanel({
  relay,
  connected,
  activeIds,
  onActiveChange,
}: ContextPanelProps) {
  const [bases, setBases] = useState<KnowledgeBaseSummary[]>([]);
  const [expandedId, setExpandedId] = useState<string | null>(null);
  const [documents, setDocuments] = useState<ContextDocumentSummary[]>([]);
  const [newName, setNewName] = useState("");
  const [loading, setLoading] = useState(false);
  const [uploading, setUploading] = useState(false);
  const [chunksDocId, setChunksDocId] = useState<string | null>(null);
  const [chunks, setChunks] = useState<ChunkPreview[]>([]);
  const [chunksLoading, setChunksLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const refresh = useCallback(async () => {
    if (!relay || !connected) return;
    setLoading(true);
    setError(null);
    try {
      const list = await relay.listContextBases();
      setBases(list);
    } catch (e) {
      setError(formatPanelError(e));
    } finally {
      setLoading(false);
    }
  }, [relay, connected]);

  useEffect(() => {
    void refresh();
  }, [refresh]);

  useEffect(() => {
    if (!expandedId || !relay || !connected) return;
    void relay.getContextStatus(expandedId).then(setDocuments).catch(() => undefined);
  }, [expandedId, relay, connected, bases]);

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

  async function handleViewChunks(documentId: string) {
    if (!relay) return;
    if (chunksDocId === documentId) {
      setChunksDocId(null);
      setChunks([]);
      return;
    }
    setChunksLoading(true);
    setError(null);
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

  async function handleUpload(kbId: string, files: FileList | null) {
    if (!relay || !files?.length) return;
    setUploading(true);
    setError(null);
    try {
      for (const file of Array.from(files)) {
        const buf = await file.arrayBuffer();
        await relay.uploadContextDocument(kbId, file.name, buf);
      }
      if (expandedId === kbId) {
        setDocuments(await relay.getContextStatus(kbId));
      }
      await refresh();
    } catch (e) {
      setError(formatPanelError(e));
    } finally {
      setUploading(false);
    }
  }

  return (
    <aside className="context-panel" aria-label="Bases de contexte">
      <h2 className="context-panel__title">Bases de contexte</h2>
      <p className="text-xs text-[var(--muted)]">
        Documents locaux sur votre PC — jamais stockés dans le cloud.
      </p>
      <div className="mt-2 flex gap-2">
        <input
          value={newName}
          onChange={(e) => setNewName(e.target.value)}
          placeholder="Nouvelle base"
          className="flex-1 rounded border border-[var(--border)] bg-black/30 px-2 py-1 text-sm"
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
                className={`rounded px-2 py-0.5 text-xs ${activeIds.includes(kb.id) ? "bg-brand-600/40" : "bg-black/30"}`}
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
                {uploading ? (
                  <ContextUploadSkeleton />
                ) : (
                  <label className="block cursor-pointer rounded border border-dashed border-[var(--border)] p-3 text-center text-xs text-[var(--muted)] hover:border-brand-500">
                    Glisser-déposer ou cliquer (.txt, .md, .pdf)
                    <input
                      type="file"
                      className="hidden"
                      accept=".txt,.md,.pdf"
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
                          {d.filename} — {d.status}
                          {d.chunkCount > 0 && ` (${d.chunkCount} extraits)`}
                        </span>
                        {d.status === "ready" && d.chunkCount > 0 && (
                          <button
                            type="button"
                            className="text-brand-400 hover:underline"
                            onClick={() => void handleViewChunks(d.id)}
                          >
                            {chunksDocId === d.id ? "Masquer" : "Extraits"}
                          </button>
                        )}
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
                    {chunks.map((c) => (
                      <li key={c.id}>
                        <span className="text-[var(--muted)]">#{c.index + 1}</span>{" "}
                        {c.preview}
                      </li>
                    ))}
                  </ol>
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
