import { useCallback, useEffect, useState } from "react";
import { invoke } from "@tauri-apps/api/core";
import { listen } from "@tauri-apps/api/event";
import { open } from "@tauri-apps/plugin-shell";
import type { HostStatusSnapshot } from "../types";

interface DashboardProps {
  appUrl: string;
}

function formatRelativeTime(iso: string | null): string {
  if (!iso) return "—";
  const then = new Date(iso).getTime();
  if (Number.isNaN(then)) return "—";
  const sec = Math.floor((Date.now() - then) / 1000);
  if (sec < 5) return "à l'instant";
  if (sec < 60) return `il y a ${sec} s`;
  const min = Math.floor(sec / 60);
  if (min < 60) return `il y a ${min} min`;
  return new Date(iso).toLocaleTimeString("fr-FR", {
    hour: "2-digit",
    minute: "2-digit",
  });
}

function StatusPill({
  label,
  ok,
  warn,
  detail,
}: {
  label: string;
  ok: boolean;
  warn?: boolean;
  detail?: string;
}) {
  const state = ok ? "ok" : warn ? "warn" : "off";
  return (
    <div className={`status-pill status-pill--${state}`}>
      <span className="status-pill__dot" />
      <span className="status-pill__label">{label}</span>
      {detail ? <span className="status-pill__detail">{detail}</span> : null}
    </div>
  );
}

export default function Dashboard({ appUrl }: DashboardProps) {
  const [status, setStatus] = useState<HostStatusSnapshot | null>(null);
  const [refreshing, setRefreshing] = useState(false);
  const [copied, setCopied] = useState(false);

  const refresh = useCallback(async () => {
    try {
      const snap = await invoke<HostStatusSnapshot>("get_host_status");
      setStatus(snap);
    } catch {
      /* ignore */
    }
  }, []);

  useEffect(() => {
    refresh();
    const poll = window.setInterval(refresh, 3000);
    const unlisten = listen<HostStatusSnapshot>("host-status", (event) => {
      setStatus(event.payload);
    });
    return () => {
      window.clearInterval(poll);
      unlisten.then((fn) => fn());
    };
  }, [refresh]);

  async function handleRefresh() {
    setRefreshing(true);
    await refresh();
    setRefreshing(false);
  }

  async function copyHostId() {
    if (!status?.hostId) return;
    await navigator.clipboard.writeText(status.hostId);
    setCopied(true);
    window.setTimeout(() => setCopied(false), 2000);
  }

  const allOk =
    status?.ollamaRunning && status?.relayConnected && status?.cloudSynced;

  return (
    <div className="dashboard">
      <header className="dashboard__header">
        <div className="dashboard__title-row">
          <span
            className={`live-dot ${allOk ? "live-dot--on" : "live-dot--partial"}`}
            title="Mise à jour en direct"
          />
          <h1>{allOk ? "En ligne" : "Partiellement actif"}</h1>
        </div>
        <p className="dashboard__subtitle">
          {status?.activeSessions
            ? `${status.activeSessions} client${status.activeSessions > 1 ? "s" : ""} en chat`
            : "En attente de clients"}
        </p>
      </header>

      <section className="status-grid" aria-label="État des services">
        <StatusPill
          label="Ollama"
          ok={!!status?.ollamaRunning}
          warn={!!status?.ollamaInstalled && !status?.ollamaRunning}
          detail={
            status?.ollamaRunning
              ? `${status.models.length} modèle(s)`
              : status?.ollamaInstalled
                ? "Arrêté"
                : "Absent"
          }
        />
        <StatusPill
          label="Relay"
          ok={!!status?.relayConnected}
          detail={status?.relayConnected ? "Connecté" : "Reconnexion…"}
        />
        <StatusPill
          label="Cloud"
          ok={!!status?.cloudSynced}
          detail={formatRelativeTime(status?.lastHeartbeatAt ?? null)}
        />
      </section>

      <section className="panel">
        <div className="panel__head">
          <h2>Modèles chargés</h2>
          <button
            type="button"
            className="btn-ghost"
            onClick={handleRefresh}
            disabled={refreshing}
          >
            {refreshing ? "…" : "Actualiser"}
          </button>
        </div>
        {status?.models && status.models.length > 0 ? (
          <ul className="model-chips">
            {status.models.map((m) => (
              <li
                key={m}
                className={`model-chip ${m.startsWith(status.defaultModel) ? "model-chip--default" : ""}`}
              >
                {m}
                {m.startsWith(status.defaultModel) ? (
                  <span className="model-chip__tag">défaut</span>
                ) : null}
              </li>
            ))}
          </ul>
        ) : (
          <p className="panel__empty">
            {status?.ollamaRunning
              ? "Aucun modèle listé — tirez un modèle depuis le setup."
              : "Démarrez Ollama pour voir les modèles."}
          </p>
        )}
      </section>

      <section className="panel">
        <h2>Clients connectés</h2>
        {status && status.activeSessions > 0 ? (
          <ul className="session-list">
            {Array.from({ length: status.activeSessions }).map((_, i) => (
              <li key={i} className="session-item">
                <span className="session-item__dot" />
                Session chat active
              </li>
            ))}
          </ul>
        ) : (
          <p className="panel__empty">
            Aucune session. Ouvrez le chat web depuis votre navigateur.
          </p>
        )}
      </section>

      {status?.hostId ? (
        <section className="panel panel--compact">
          <h2>Identifiant host</h2>
          <div className="host-id-row">
            <code className="host-id">{status.hostId}</code>
            <button type="button" className="btn-ghost" onClick={copyHostId}>
              {copied ? "Copié" : "Copier"}
            </button>
          </div>
        </section>
      ) : null}

      {status?.lastHeartbeatError || status?.lastRelayError ? (
        <section className="panel panel--error" role="alert">
          <h2>Dernières erreurs</h2>
          {status.lastRelayError ? (
            <p className="error-line">Relay : {status.lastRelayError}</p>
          ) : null}
          {status.lastHeartbeatError ? (
            <p className="error-line">Cloud : {status.lastHeartbeatError}</p>
          ) : null}
        </section>
      ) : null}

      <div className="dashboard__actions">
        <button
          type="button"
          className="btn-primary"
          style={{ width: "100%" }}
          onClick={() => open(`${appUrl}/dashboard`)}
        >
          Ouvrir le tableau de bord web
        </button>
        <button
          type="button"
          className="btn-secondary"
          style={{ width: "100%" }}
          onClick={() => open(`${appUrl}/chat/${status?.hostId ?? ""}`)}
          disabled={!status?.hostId}
        >
          Nouveau chat
        </button>
      </div>
    </div>
  );
}
