import { useCallback, useEffect, useState } from "react";
import { invoke } from "@tauri-apps/api/core";

interface UserMemoryFact {
  id: string;
  content: string;
  createdAt: string;
  updatedAt: string;
}

interface UserMemoryState {
  enabled: boolean;
  facts: UserMemoryFact[];
}

const MAX_FACT_CHARS = 500;
const MAX_FACTS = 100;

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

export default function UserMemoryPanel() {
  const [state, setState] = useState<UserMemoryState | null>(null);
  const [draft, setDraft] = useState("");
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const refresh = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const next = await invoke<UserMemoryState>("get_user_memory");
      setState(next);
    } catch (e) {
      setError(String(e));
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void refresh();
  }, [refresh]);

  async function handleToggle(enabled: boolean) {
    setSaving(true);
    setError(null);
    try {
      await invoke("set_user_memory_enabled", { enabled });
      setState((prev) => (prev ? { ...prev, enabled } : prev));
    } catch (e) {
      setError(String(e));
    } finally {
      setSaving(false);
    }
  }

  async function handleAdd() {
    const content = draft.trim();
    if (!content) return;
    setSaving(true);
    setError(null);
    try {
      await invoke<UserMemoryFact>("add_user_memory_fact", { content });
      setDraft("");
      await refresh();
    } catch (e) {
      setError(String(e));
    } finally {
      setSaving(false);
    }
  }

  async function handleDelete(id: string) {
    if (!window.confirm("Supprimer ce fait mémorisé ?")) return;
    setSaving(true);
    setError(null);
    try {
      await invoke("delete_user_memory_fact", { id });
      await refresh();
    } catch (e) {
      setError(String(e));
    } finally {
      setSaving(false);
    }
  }

  const charCount = draft.length;
  const atLimit = (state?.facts.length ?? 0) >= MAX_FACTS;

  return (
    <section className="panel context-manager" aria-label="Mémoire utilisateur">
      <div className="panel__head">
        <h2>Mémoire utilisateur</h2>
        <button
          type="button"
          className="btn-ghost"
          onClick={() => void refresh()}
          disabled={loading || saving}
        >
          {loading ? "…" : "Actualiser"}
        </button>
      </div>

      <p className="muted panel__meta">
        Faits opt-in stockés localement sur ce PC. Seuls les faits pertinents pour votre question
        sont injectés au chat — jamais exposés au web ni au relay.
      </p>

      <label className="toggle-row" style={{ marginBottom: 12 }}>
        <input
          type="checkbox"
          checked={state?.enabled ?? false}
          disabled={saving || state == null}
          onChange={(e) => void handleToggle(e.target.checked)}
        />
        Mémoire activée
      </label>

      <div className="context-create-row">
        <textarea
          className="context-instruction"
          rows={2}
          value={draft}
          disabled={saving || atLimit || !state?.enabled}
          placeholder={
            state?.enabled
              ? "Ex. : Je préfère les réponses concises en français"
              : "Activez la mémoire pour ajouter un fait"
          }
          maxLength={MAX_FACT_CHARS}
          onChange={(e) => setDraft(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "Enter" && (e.ctrlKey || e.metaKey)) {
              e.preventDefault();
              void handleAdd();
            }
          }}
        />
        <button
          type="button"
          className="btn-secondary"
          disabled={saving || !draft.trim() || atLimit || !state?.enabled}
          onClick={() => void handleAdd()}
        >
          Ajouter
        </button>
      </div>

      <p className="panel__meta muted">
        {charCount}/{MAX_FACT_CHARS} caractères · {state?.facts.length ?? 0}/{MAX_FACTS} faits
        {" · "}
        <kbd>Ctrl+Entrée</kbd> pour ajouter
      </p>

      {state?.facts.length === 0 && !loading ? (
        <p className="panel__empty">
          Aucun fait mémorisé. Ajoutez des préférences ou informations utiles pour vos conversations.
        </p>
      ) : (
        <ul className="context-base-list">
          {state?.facts.map((fact) => (
            <li key={fact.id} className="context-base-item">
              <div className="context-base-item__head">
                <p className="memory-fact__content">{fact.content}</p>
                <button
                  type="button"
                  className="btn-ghost btn-ghost--danger"
                  disabled={saving}
                  onClick={() => void handleDelete(fact.id)}
                  aria-label="Supprimer ce fait"
                >
                  ×
                </button>
              </div>
              <p className="muted panel__meta">Mis à jour {formatTime(fact.updatedAt)}</p>
            </li>
          ))}
        </ul>
      )}

      {error && (
        <p className="error-banner" role="alert">
          {error}
        </p>
      )}
    </section>
  );
}
