import { useCallback, useEffect, useState } from "react";
import { invoke } from "@tauri-apps/api/core";

interface KnowledgeBase {
  id: string;
  name: string;
  description: string;
  docCount: number;
  status: string;
}

interface ProjectSummary {
  id: string;
  name: string;
  description: string;
  systemInstruction: string;
  knowledgeBaseIds: string[];
  createdAt: string;
  updatedAt: string;
  isActive: boolean;
}

export default function ProjectManager() {
  const [projects, setProjects] = useState<ProjectSummary[]>([]);
  const [bases, setBases] = useState<KnowledgeBase[]>([]);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [newName, setNewName] = useState("");
  const [projectInstruction, setProjectInstruction] = useState("");
  const [instructionDirty, setInstructionDirty] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const refresh = useCallback(async () => {
    try {
      const [list, kbList] = await Promise.all([
        invoke<ProjectSummary[]>("list_projects"),
        invoke<KnowledgeBase[]>("list_knowledge_bases"),
      ]);
      setProjects(list);
      setBases(kbList);
    } catch (e) {
      setError(String(e));
    }
  }, []);

  useEffect(() => {
    void refresh();
  }, [refresh]);

  const selected = projects.find((p) => p.id === selectedId) ?? null;

  useEffect(() => {
    setProjectInstruction(selected?.systemInstruction ?? "");
    setInstructionDirty(false);
  }, [selected?.id, selected?.systemInstruction]);

  async function saveProjectInstruction() {
    if (!selected) return;
    setError(null);
    try {
      await invoke("update_project", {
        id: selected.id,
        name: null,
        description: null,
        systemInstruction: projectInstruction,
        knowledgeBaseIds: null,
      });
      setInstructionDirty(false);
      await refresh();
    } catch (e) {
      setError(String(e));
    }
  }

  async function handleCreate() {
    setError(null);
    try {
      await invoke("create_project", {
        name: newName.trim() || "Nouveau projet",
        description: "",
        knowledgeBaseIds: [],
      });
      setNewName("");
      await refresh();
    } catch (e) {
      setError(String(e));
    }
  }

  async function handleOpen(id: string) {
    setError(null);
    try {
      await invoke("open_project", { id });
      await refresh();
    } catch (e) {
      setError(String(e));
    }
  }

  async function handleDelete(id: string) {
    if (!window.confirm("Supprimer ce projet ? Les bases de contexte ne seront pas supprimées.")) {
      return;
    }
    setError(null);
    try {
      await invoke("delete_project", { id });
      if (selectedId === id) setSelectedId(null);
      await refresh();
    } catch (e) {
      setError(String(e));
    }
  }

  async function toggleKb(kbId: string) {
    if (!selected) return;
    const next = selected.knowledgeBaseIds.includes(kbId)
      ? selected.knowledgeBaseIds.filter((x) => x !== kbId)
      : [...selected.knowledgeBaseIds, kbId];
    setError(null);
    try {
      await invoke("update_project", {
        id: selected.id,
        name: null,
        description: null,
        systemInstruction: null,
        knowledgeBaseIds: next,
      });
      await refresh();
    } catch (e) {
      setError(String(e));
    }
  }

  return (
    <div className="context-manager">
      <h2>Projets / espaces de travail</h2>
      <p className="muted panel__meta">
        Regroupez vos bases de contexte par projet. Ouvrir un projet active toutes ses bases en un clic.
      </p>

      <div className="context-create-row">
        <input
          value={newName}
          onChange={(e) => setNewName(e.target.value)}
          placeholder="Nouveau projet"
          className="context-input"
        />
        <button type="button" className="btn-secondary" onClick={() => void handleCreate()}>
          Créer
        </button>
      </div>

      <ul className="context-base-list">
        {projects.map((project) => (
          <li
            key={project.id}
            className={`context-base-item ${project.isActive ? "context-base-item--active" : ""}`}
          >
            <div className="context-base-item__head">
              <button
                type="button"
                className={`btn-ghost ${project.isActive ? "btn-ghost--active" : ""}`}
                onClick={() => void handleOpen(project.id)}
              >
                {project.isActive ? "Actif" : "Ouvrir"}
              </button>
              <button
                type="button"
                className="context-base-item__title"
                onClick={() => setSelectedId(selectedId === project.id ? null : project.id)}
              >
                {project.name}
              </button>
              <button
                type="button"
                className="btn-ghost btn-ghost--danger"
                onClick={() => void handleDelete(project.id)}
              >
                ×
              </button>
            </div>
            <p className="muted">
              {project.knowledgeBaseIds.length} base(s) ·{" "}
              {project.isActive ? "projet actif" : "inactif"}
            </p>
            {selectedId === project.id && (
              <div className="context-docs">
                <p className="panel__meta">Instruction système du projet</p>
                <textarea
                  className="context-instruction"
                  rows={4}
                  value={projectInstruction}
                  onChange={(e) => {
                    setProjectInstruction(e.target.value);
                    setInstructionDirty(true);
                  }}
                  placeholder="Ex. : Tu es un assistant juridique…"
                />
                <button
                  type="button"
                  className="btn-secondary"
                  disabled={!instructionDirty}
                  onClick={() => void saveProjectInstruction()}
                >
                  Enregistrer l&apos;instruction
                </button>
                <p className="panel__meta">Bases associées</p>
                {bases.length === 0 ? (
                  <p className="panel__empty">Créez d&apos;abord une base dans l&apos;onglet Contexte.</p>
                ) : (
                  <ul className="model-chips">
                    {bases.map((kb) => {
                      const on = project.knowledgeBaseIds.includes(kb.id);
                      return (
                        <li key={kb.id}>
                          <button
                            type="button"
                            className={`model-chip ${on ? "model-chip--default" : ""}`}
                            onClick={() => void toggleKb(kb.id)}
                          >
                            {kb.name}
                            {on ? <span className="model-chip__tag">inclus</span> : null}
                          </button>
                        </li>
                      );
                    })}
                  </ul>
                )}
              </div>
            )}
          </li>
        ))}
      </ul>

      {projects.length === 0 && (
        <p className="panel__empty">Aucun projet — créez-en un pour grouper vos bases.</p>
      )}
      {error && (
        <p className="error-banner" role="alert">
          {error}
        </p>
      )}
    </div>
  );
}
