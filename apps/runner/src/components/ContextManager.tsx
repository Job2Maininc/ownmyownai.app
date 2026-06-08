import { useCallback, useEffect, useState } from "react";
import { invoke } from "@tauri-apps/api/core";
import { open, save } from "@tauri-apps/plugin-dialog";

interface KnowledgeBase {
  id: string;
  name: string;
  description: string;
  docCount: number;
  status: string;
}

interface DocumentInfo {
  id: string;
  filename: string;
  status: string;
  chunkCount: number;
  errorMessage?: string | null;
}

export default function ContextManager() {
  const [bases, setBases] = useState<KnowledgeBase[]>([]);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [documents, setDocuments] = useState<DocumentInfo[]>([]);
  const [newName, setNewName] = useState("");
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

  useEffect(() => {
    void refreshBases();
  }, [refreshBases]);

  useEffect(() => {
    if (selectedId) void refreshDocs(selectedId);
  }, [selectedId, refreshDocs]);

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
    if (!window.confirm("Supprimer cette base et tous ses documents ?")) return;
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
      await invoke("import_knowledge_base", { zipPath: path });
      await refreshBases();
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
        Documents locaux utilisés comme contexte pour vos conversations (jamais envoyés au cloud).
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
          <h3>Documents</h3>
          <p className="muted">Ajoutez des fichiers depuis le chat web (glisser-déposer).</p>
          <ul>
            {documents.map((d) => (
              <li key={d.id}>
                {d.filename} — {d.status}
                {d.chunkCount > 0 && ` (${d.chunkCount} extraits)`}
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
