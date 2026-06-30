"use client";

import { useCallback, useEffect, useState } from "react";
import type { UserMemoryFact, UserMemoryState } from "@ownmyownai/protocol";
import type { RelayClient } from "@/lib/relay-client";
import { Button } from "@/components/ui/button";
import { EmptyState } from "@/components/ui/empty-state";
import { ErrorAlert } from "@/components/ui/error-alert";
import { formatApiError, type UserError } from "@/lib/user-errors";

interface MemoryPanelProps {
  relay: RelayClient | null;
  connected: boolean;
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

export function MemoryPanel({ relay, connected }: MemoryPanelProps) {
  const [state, setState] = useState<UserMemoryState | null>(null);
  const [draft, setDraft] = useState("");
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<UserError | null>(null);

  const refresh = useCallback(async () => {
    if (!relay || !connected) return;
    setLoading(true);
    setError(null);
    try {
      const next = await relay.listMemory();
      setState(next);
    } catch (e) {
      setError(formatApiError(e));
    } finally {
      setLoading(false);
    }
  }, [relay, connected]);

  useEffect(() => {
    void refresh();
  }, [refresh]);

  async function handleToggle(enabled: boolean) {
    if (!relay || !connected) return;
    setSaving(true);
    setError(null);
    try {
      const nextEnabled = await relay.setMemoryEnabled(enabled);
      setState((prev) => (prev ? { ...prev, enabled: nextEnabled } : prev));
    } catch (e) {
      setError(formatApiError(e));
    } finally {
      setSaving(false);
    }
  }

  async function handleAdd() {
    const content = draft.trim();
    if (!content || !relay || !connected) return;
    setSaving(true);
    setError(null);
    try {
      const fact = await relay.addMemoryFact(content);
      setDraft("");
      setState((prev) =>
        prev
          ? { ...prev, facts: [fact, ...prev.facts.filter((f) => f.id !== fact.id)] }
          : { enabled: true, facts: [fact] },
      );
    } catch (e) {
      setError(formatApiError(e));
    } finally {
      setSaving(false);
    }
  }

  async function handleDelete(fact: UserMemoryFact) {
    if (!relay || !connected) return;
    if (!window.confirm("Supprimer ce fait mémorisé ?")) return;
    setSaving(true);
    setError(null);
    try {
      await relay.deleteMemoryFact(fact.id);
      setState((prev) =>
        prev ? { ...prev, facts: prev.facts.filter((f) => f.id !== fact.id) } : prev,
      );
    } catch (e) {
      setError(formatApiError(e));
    } finally {
      setSaving(false);
    }
  }

  const charCount = draft.length;
  const atLimit = (state?.facts.length ?? 0) >= MAX_FACTS;

  return (
    <aside className="context-panel" aria-label="Mémoire utilisateur">
      <h2 className="context-panel__title">Mémoire utilisateur</h2>
      <p className="text-xs text-[var(--muted)]">
        Faits opt-in stockés localement sur votre PC. Seuls les faits pertinents pour votre question
        sont injectés au chat — jamais exposés au relay ni au cloud.
      </p>

      <div className="mt-3 flex items-center justify-between gap-2">
        <label className="flex items-center gap-2 text-sm">
          <input
            type="checkbox"
            checked={state?.enabled ?? false}
            disabled={saving || state == null || !connected}
            onChange={(e) => void handleToggle(e.target.checked)}
          />
          Mémoire activée
        </label>
        <Button
          type="button"
          variant="ghost"
          disabled={loading || saving || !connected}
          onClick={() => void refresh()}
        >
          {loading ? "…" : "Actualiser"}
        </Button>
      </div>

      {!connected && (
        <p className="mt-3 text-sm text-[var(--muted)]">
          Connectez-vous au Host pour gérer la mémoire utilisateur.
        </p>
      )}

      {connected && (
        <>
          <div className="mt-3 space-y-2">
            <textarea
              rows={3}
              value={draft}
              disabled={saving || atLimit || !state?.enabled}
              placeholder={
                state?.enabled
                  ? "Ex. : Je préfère les réponses concises en français"
                  : "Activez la mémoire pour ajouter un fait"
              }
              maxLength={MAX_FACT_CHARS}
              className="input-field w-full resize-y text-sm"
              onChange={(e) => setDraft(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === "Enter" && (e.ctrlKey || e.metaKey)) {
                  e.preventDefault();
                  void handleAdd();
                }
              }}
            />
            <Button
              type="button"
              variant="secondary"
              disabled={saving || !draft.trim() || atLimit || !state?.enabled}
              onClick={() => void handleAdd()}
            >
              Ajouter
            </Button>
          </div>

          <p className="mt-2 text-xs text-[var(--muted)]">
            {charCount}/{MAX_FACT_CHARS} caractères · {state?.facts.length ?? 0}/{MAX_FACTS} faits
            {" · "}
            <kbd className="rounded border border-[var(--border)] px-1">Ctrl+Entrée</kbd> pour
            ajouter
          </p>

          {loading && <p className="mt-3 text-sm text-[var(--muted)]">Chargement…</p>}

          {!loading && state?.facts.length === 0 && (
            <div className="mt-4 rounded-xl border border-dashed border-[var(--border)] bg-[var(--surface-subtle)]">
              <EmptyState
                icon="brain"
                title="Aucun fait mémorisé"
                description="Ajoutez des préférences ou informations utiles pour vos conversations."
              />
            </div>
          )}

          <ul className="mt-3 space-y-2">
            {state?.facts.map((fact) => (
              <li key={fact.id} className="rounded border border-[var(--border)] p-2">
                <div className="flex items-start gap-2">
                  <p className="flex-1 text-sm">{fact.content}</p>
                  <button
                    type="button"
                    className="text-[var(--muted)] hover:text-[var(--danger)]"
                    disabled={saving}
                    onClick={() => void handleDelete(fact)}
                    aria-label="Supprimer ce fait"
                  >
                    ×
                  </button>
                </div>
                <p className="mt-1 text-xs text-[var(--muted)]">
                  Mis à jour {formatTime(fact.updatedAt)}
                </p>
              </li>
            ))}
          </ul>
        </>
      )}

      {error && (
        <div className="mt-3">
          <ErrorAlert {...error} />
        </div>
      )}
    </aside>
  );
}
