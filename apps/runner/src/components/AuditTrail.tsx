import { useCallback, useEffect, useState } from "react";
import { invoke } from "@tauri-apps/api/core";
import { EmptyStatePanel } from "./EmptyState";

interface AuditEntry {
  id: string;
  action: string;
  targetType?: string | null;
  targetId?: string | null;
  details?: string | null;
  createdAt: string;
}

const ACTION_LABELS: Record<string, string> = {
  index: "Indexation",
  index_error: "Erreur d'indexation",
  delete: "Suppression",
  agent_access: "Accès agent",
};

const TARGET_LABELS: Record<string, string> = {
  openai_gateway: "Gateway Cursor",
  chat: "Chat web",
};

const FILTER_OPTIONS = [
  { value: "", label: "Toutes" },
  { value: "index", label: "Indexation" },
  { value: "index_error", label: "Erreurs" },
  { value: "delete", label: "Suppressions" },
  { value: "agent_access", label: "Accès agent" },
] as const;

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

function summarizeDetails(entry: AuditEntry): string {
  if (!entry.details) return "";
  try {
    const data = JSON.parse(entry.details) as Record<string, unknown>;
    if (typeof data.filename === "string") return data.filename;
    if (typeof data.relativePath === "string") return data.relativePath;
    if (Array.isArray(data.contextIds) && data.contextIds.length > 0) {
      return `${data.contextIds.length} base(s) de contexte`;
    }
    if (typeof data.model === "string") return data.model;
    if (typeof data.path === "string") return data.path;
  } catch {
    return entry.details.slice(0, 80);
  }
  return "";
}

export default function AuditTrail() {
  const [entries, setEntries] = useState<AuditEntry[]>([]);
  const [filter, setFilter] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const refresh = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const list = await invoke<AuditEntry[]>("list_audit_log", {
        limit: 100,
        actionFilter: filter || null,
      });
      setEntries(list);
    } catch (e) {
      setError(String(e));
    } finally {
      setLoading(false);
    }
  }, [filter]);

  useEffect(() => {
    void refresh();
  }, [refresh]);

  return (
    <section className="panel">
      <div className="panel__head">
        <h2>Journal d'audit local</h2>
        <button type="button" className="btn-ghost" onClick={() => void refresh()} disabled={loading}>
          {loading ? "…" : "Actualiser"}
        </button>
      </div>
      <p className="muted">
        Historique des indexations, suppressions et accès agent (chat, gateway Cursor) — stocké uniquement sur ce PC.
      </p>
      <div className="model-filters">
        {FILTER_OPTIONS.map((opt) => (
          <button
            key={opt.value}
            type="button"
            className={`chip-filter ${filter === opt.value ? "chip-filter--active" : ""}`}
            onClick={() => setFilter(opt.value)}
          >
            {opt.label}
          </button>
        ))}
      </div>
      {entries.length === 0 && !loading ? (
        <EmptyStatePanel
          icon="clock"
          title="Journal vide"
          description="Les indexations, suppressions et accès agent au contexte apparaîtront ici."
        />
      ) : (
        <ul className="audit-list">
          {entries.map((entry) => (
            <li key={entry.id} className="audit-list__item">
              <span className="audit-list__action">
                {ACTION_LABELS[entry.action] ?? entry.action}
              </span>
              <span className="audit-list__time">{formatTime(entry.createdAt)}</span>
              {entry.targetType && (
                <span className="muted audit-list__target">
                  {TARGET_LABELS[entry.targetType] ?? entry.targetType}
                </span>
              )}
              {summarizeDetails(entry) && (
                <span className="audit-list__detail">{summarizeDetails(entry)}</span>
              )}
            </li>
          ))}
        </ul>
      )}
      {error && <p className="error-line">{error}</p>}
    </section>
  );
}
