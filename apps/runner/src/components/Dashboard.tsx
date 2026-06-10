import { useCallback, useEffect, useState } from "react";
import { getVersion } from "@tauri-apps/api/app";
import { invoke } from "@tauri-apps/api/core";
import { listen } from "@tauri-apps/api/event";
import AuditTrail from "./AuditTrail";
import ContextManager from "./ContextManager";
import PrReviewPanel from "./PrReviewPanel";
import ProjectManager from "./ProjectManager";
import LocalChat from "./LocalChat";
import ModelManager from "./ModelManager";
import type {
  HostSettings,
  HostStatusSnapshot,
  LastRequestMetrics,
  UpdateCheckResult,
} from "../types";

type DashboardTab = "status" | "chat" | "models" | "context" | "review" | "projects" | "audit";

interface DashboardProps {
  appUrl: string;
  onUnpaired: () => void;
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

function formatLatency(ms: number): string {
  if (ms < 1000) return `${ms} ms`;
  return `${(ms / 1000).toFixed(1)} s`;
}

function MetricsPanel({ metrics }: { metrics: LastRequestMetrics }) {
  return (
    <section className="panel" aria-label="Dernière requête">
      <h2>Dernière requête</h2>
      <div className="metrics-grid">
        <div className="metric-card">
          <span className="metric-card__value">{metrics.tokensPerSecond}</span>
          <span className="metric-card__label">tokens/s</span>
        </div>
        <div className="metric-card">
          <span className="metric-card__value">{formatLatency(metrics.latencyMs)}</span>
          <span className="metric-card__label">latence</span>
        </div>
        <div className="metric-card">
          <span className="metric-card__value">{metrics.ramUsedGb} Go</span>
          <span className="metric-card__label">RAM utilisée</span>
        </div>
      </div>
      <p className="panel__meta muted">
        Modèle {metrics.model}
        {(metrics.completionTokens ?? 0) > 0
          ? ` · ${metrics.completionTokens} tokens générés`
          : ""}
        {" · "}
        {formatRelativeTime(metrics.completedAt)}
      </p>
    </section>
  );
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

export default function Dashboard({ appUrl, onUnpaired }: DashboardProps) {
  const [status, setStatus] = useState<HostStatusSnapshot | null>(null);
  const [refreshing, setRefreshing] = useState(false);
  const [copied, setCopied] = useState(false);
  const [unpairing, setUnpairing] = useState(false);
  const [tab, setTab] = useState<DashboardTab>("status");
  const [openError, setOpenError] = useState<string | null>(null);
  const [airGapped, setAirGapped] = useState(false);
  const [togglingAirGapped, setTogglingAirGapped] = useState(false);
  const [appVersion, setAppVersion] = useState<string | null>(null);
  const [updateInfo, setUpdateInfo] = useState<UpdateCheckResult | null>(null);
  const [checkingUpdate, setCheckingUpdate] = useState(false);
  const [installingUpdate, setInstallingUpdate] = useState(false);

  const refresh = useCallback(async () => {
    try {
      const snap = await invoke<HostStatusSnapshot>("get_host_status");
      setStatus(snap);
    } catch {
      /* ignore */
    }
  }, []);

  useEffect(() => {
    void getVersion().then(setAppVersion).catch(() => undefined);
  }, []);

  const refreshUpdateStatus = useCallback(async () => {
    setCheckingUpdate(true);
    try {
      const info = await invoke<UpdateCheckResult>("check_for_updates");
      setUpdateInfo(info);
    } catch {
      setUpdateInfo(null);
    } finally {
      setCheckingUpdate(false);
    }
  }, []);

  useEffect(() => {
    void refreshUpdateStatus();
  }, [refreshUpdateStatus]);

  useEffect(() => {
    invoke<HostSettings>("get_host_settings")
      .then((s) => setAirGapped(!!s.airGapped))
      .catch(() => undefined);
  }, []);

  useEffect(() => {
    if (status?.airGapped != null) {
      setAirGapped(status.airGapped);
    }
  }, [status?.airGapped]);

  useEffect(() => {
    refresh();
    const poll = window.setInterval(refresh, 12_000);
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

  async function openInBrowser(path: string) {
    setOpenError(null);
    try {
      await invoke("open_url", { url: path });
    } catch (e) {
      setOpenError(`Impossible d'ouvrir le navigateur : ${String(e)}`);
    }
  }

  async function handleUnpair() {
    if (
      !window.confirm(
        "Délier ce PC ? Vous devrez refaire le pairing pour reconnecter le host.",
      )
    ) {
      return;
    }
    setUnpairing(true);
    try {
      await invoke("unpair_host");
      onUnpaired();
    } catch {
      /* ignore */
    } finally {
      setUnpairing(false);
    }
  }

  const airGappedMode = airGapped || !!status?.airGapped;
  const allOk = airGappedMode
    ? !!status?.ollamaRunning
    : status?.ollamaRunning && status?.relayConnected && status?.cloudSynced;

  async function handleAirGappedToggle(enabled: boolean) {
    setTogglingAirGapped(true);
    setOpenError(null);
    try {
      const settings = await invoke<HostSettings>("get_host_settings");
      await invoke("save_host_settings", {
        settings: { ...settings, airGapped: enabled },
      });
      setAirGapped(enabled);
      await invoke("restart_background_services");
      await refresh();
      if (enabled) {
        setTab("chat");
      }
    } catch (e) {
      setOpenError(String(e));
    } finally {
      setTogglingAirGapped(false);
    }
  }

  return (
    <div className="dashboard">
      <header className="dashboard__header">
        <div className="dashboard__title-row">
          <span
            className={`live-dot ${allOk ? "live-dot--on" : "live-dot--partial"}`}
            title="Mise à jour en direct"
          />
          <h1>
            {airGappedMode
              ? "Mode air-gapped"
              : allOk
                ? "En ligne"
                : "Partiellement actif"}
          </h1>
        </div>
        <p className="dashboard__subtitle">
          {appVersion ? `Host v${appVersion}` : "Host"}
          {" · "}
          {airGappedMode
            ? "Chat local uniquement — relay et cloud désactivés"
            : status?.activeSessions
              ? `${status.activeSessions} chat${status.activeSessions > 1 ? "s" : ""} actif${status.activeSessions > 1 ? "s" : ""}`
              : status?.webViewers
                ? `${status.webViewers} navigateur${status.webViewers > 1 ? "s" : ""} connecté${status.webViewers > 1 ? "s" : ""}`
                : "En attente de clients"}
        </p>
      </header>

      <nav className="dashboard-tabs" aria-label="Sections">
        {(
          [
            ["status", "État"],
            ["chat", "Chat local"],
            ["models", "Modèles"],
            ["context", "Contexte"],
            ["review", "Revue code"],
            ["projects", "Projets"],
            ["audit", "Journal"],
          ] as const
        ).map(([id, label]) => (
          <button
            key={id}
            type="button"
            className={`dashboard-tab ${tab === id ? "dashboard-tab--active" : ""}`}
            onClick={() => setTab(id)}
          >
            {label}
          </button>
        ))}
      </nav>

      {tab === "models" && (
        <ModelManager
          installedModels={status?.models ?? []}
          defaultModel={status?.defaultModel ?? "llama3.2:3b"}
          onDefaultChanged={refresh}
        />
      )}

      {tab === "context" && <ContextManager />}

      {tab === "review" && <PrReviewPanel />}

      {tab === "projects" && <ProjectManager />}

      {tab === "audit" && <AuditTrail />}

      {tab === "status" && (
      <>
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
          ok={airGappedMode ? false : !!status?.relayConnected}
          detail={
            airGappedMode
              ? "Désactivé"
              : status?.relayConnected
                ? "Connecté"
                : "Reconnexion…"
          }
        />
        <StatusPill
          label="Cloud"
          ok={airGappedMode ? false : !!status?.cloudSynced}
          detail={
            airGappedMode
              ? "Désactivé"
              : formatRelativeTime(status?.lastHeartbeatAt ?? null)
          }
        />
      </section>

      {status?.diskFreeGb != null && (
        <p className="muted panel__meta">
          Espace disque libre (modèles) : {status.diskFreeGb} Go
        </p>
      )}

      {status?.lastRequestMetrics ? (
        <MetricsPanel metrics={status.lastRequestMetrics} />
      ) : (
        <section className="panel">
          <h2>Dernière requête</h2>
          <p className="panel__empty">
            Aucune génération encore. Lancez un chat pour voir tokens/s, latence et RAM.
          </p>
        </section>
      )}

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
        {status && (status.webViewers > 0 || status.activeSessions > 0) ? (
          <ul className="session-list">
            {status.webViewers > 0 ? (
              <li className="session-item">
                <span className="session-item__dot" />
                {status.webViewers === 1
                  ? "1 onglet web ouvert"
                  : `${status.webViewers} onglets web ouverts`}
              </li>
            ) : null}
            {Array.from({ length: status.activeSessions }).map((_, i) => (
              <li key={`chat-${i}`} className="session-item">
                <span className="session-item__dot" />
                Génération IA en cours
              </li>
            ))}
          </ul>
        ) : (
          <p className="panel__empty">
            Aucun client. Ouvrez le chat web depuis votre navigateur.
          </p>
        )}
      </section>

      <section className="panel" aria-label="Mises à jour">
        <div className="panel__head">
          <h2>Mises à jour</h2>
          <button
            type="button"
            className="btn-ghost"
            onClick={() => void refreshUpdateStatus()}
            disabled={checkingUpdate || installingUpdate}
          >
            {checkingUpdate ? "…" : "Vérifier"}
          </button>
        </div>
        <p className="panel__meta">
          Installée : <strong>{appVersion ?? updateInfo?.currentVersion ?? "—"}</strong>
          {updateInfo?.remoteVersion ? (
            <>
              {" "}
              · Publiée : <strong>{updateInfo.remoteVersion}</strong>
            </>
          ) : null}
        </p>
        <p className="panel__meta muted">
          {updateInfo?.message ??
            "Vérification automatique au démarrage puis toutes les heures."}
        </p>
        {updateInfo?.updateAvailable ? (
          <div className="dashboard__actions" style={{ marginTop: 12 }}>
            {updateInfo.autoUpdateReady ? (
              <button
                type="button"
                className="btn-primary"
                style={{ width: "100%" }}
                disabled={installingUpdate}
                onClick={() => {
                  setInstallingUpdate(true);
                  void invoke("install_host_update")
                    .catch((e) => setOpenError(String(e)))
                    .finally(() => setInstallingUpdate(false));
                }}
              >
                {installingUpdate ? "Installation…" : "Installer maintenant"}
              </button>
            ) : (
              <button
                type="button"
                className="btn-primary"
                style={{ width: "100%" }}
                onClick={() => void openInBrowser(`${appUrl}/download`)}
              >
                Télécharger l&apos;installateur
              </button>
            )}
          </div>
        ) : null}
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
      </>
      )}

      <div className="dashboard__actions">
        {openError ? (
          <p className="error-banner" role="alert">
            {openError}
          </p>
        ) : null}
        <button
          type="button"
          className="btn-primary"
          style={{ width: "100%" }}
          onClick={() => void openInBrowser(`${appUrl}/dashboard`)}
        >
          Ouvrir le tableau de bord web
        </button>
        <button
          type="button"
          className="btn-secondary"
          style={{ width: "100%" }}
          onClick={() => void openInBrowser(`${appUrl}/chat/${status?.hostId ?? ""}`)}
          disabled={!status?.hostId}
        >
          Nouveau chat
        </button>
        <button
          type="button"
          className="btn-ghost"
          style={{ width: "100%" }}
          onClick={handleUnpair}
          disabled={unpairing}
        >
          {unpairing ? "Déliaison…" : "Délier ce PC"}
        </button>
      </div>
    </div>
  );
}
