import { useCallback, useEffect, useMemo, useState } from "react";
import { getVersion } from "@tauri-apps/api/app";
import { invoke } from "@tauri-apps/api/core";
import { listen } from "@tauri-apps/api/event";
import { DEFAULT_MODEL } from "../data/models";
import {
  CommandPaletteProvider,
  PALETTE_SHORTCUT_LABEL,
  useRegisterPaletteCommands,
  type PaletteCommand,
} from "./command-palette/command-palette-provider";
import AuditTrail from "./AuditTrail";
import CloudProvidersPanel from "./CloudProvidersPanel";
import ContextManager from "./ContextManager";
import HostBreadcrumbs from "./dashboard/HostBreadcrumbs";
import HostSidebar from "./dashboard/HostSidebar";
import { DASHBOARD_NAV, type DashboardTab } from "./dashboard/dashboard-nav";
import HostSettingsPanel from "./HostSettingsPanel";
import LocalImagePanel from "./LocalImagePanel";
import PrReviewPanel from "./PrReviewPanel";
import ProjectManager from "./ProjectManager";
import UpdatesPanel from "./UpdatesPanel";
import LocalChat from "./LocalChat";
import McpServersManager from "./McpServersManager";
import ModelManager from "./ModelManager";
import type {
  HostSettings,
  HostStatusSnapshot,
  LastRequestMetrics,
} from "../types";
import { ThemeToggle } from "./ThemeToggle";
import EmptyState from "./EmptyState";

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

function DashboardContent({ appUrl, onUnpaired }: DashboardProps) {
  const [status, setStatus] = useState<HostStatusSnapshot | null>(null);
  const [refreshing, setRefreshing] = useState(false);
  const [copied, setCopied] = useState(false);
  const [unpairing, setUnpairing] = useState(false);
  const [tab, setTab] = useState<DashboardTab>("status");
  const [openError, setOpenError] = useState<string | null>(null);
  const [airGapped, setAirGapped] = useState(false);
  const [fallbackModel, setFallbackModel] = useState<string | null>(null);
  const [togglingAirGapped, setTogglingAirGapped] = useState(false);
  const [appVersion, setAppVersion] = useState<string | null>(null);

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

  useEffect(() => {
    invoke<HostSettings>("get_host_settings")
      .then((s) => {
        setAirGapped(!!s.airGapped);
        setFallbackModel(s.fallbackModel ?? null);
      })
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

  const paletteCommands = useMemo<PaletteCommand[]>(
    () => [
      ...DASHBOARD_NAV.map((item) => ({
        id: `tab-${item.id}`,
        label: item.label,
        keywords: item.id,
        group: "Navigation",
        onSelect: () => setTab(item.id),
      })),
      {
        id: "open-dashboard",
        label: "Ouvrir le tableau de bord web",
        keywords: "navigateur browser",
        group: "Web",
        onSelect: () => void openInBrowser(`${appUrl}/dashboard`),
      },
      {
        id: "open-chat",
        label: "Nouveau chat web",
        keywords: "conversation relay",
        group: "Web",
        disabled: !status?.hostId,
        onSelect: () => void openInBrowser(`${appUrl}/chat/${status?.hostId ?? ""}`),
      },
      {
        id: "refresh-status",
        label: "Actualiser l'état",
        keywords: "reload sync",
        group: "Host",
        disabled: refreshing,
        onSelect: () => void handleRefresh(),
      },
    ],
    [appUrl, refreshing, status?.hostId],
  );

  useRegisterPaletteCommands(paletteCommands);

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
        <div className="dashboard__header-top">
          <ThemeToggle />
        </div>
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
          <span className="dashboard__shortcut-hint" title="Palette de commandes">
            {PALETTE_SHORTCUT_LABEL}
          </span>
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

      <div className="dashboard-layout">
        <HostSidebar activeTab={tab} onTabChange={setTab} />

        <div className="dashboard-main">
          <HostBreadcrumbs tab={tab} />

          <div className="dashboard-content">
            {tab === "chat" && (
              <LocalChat
                defaultModel={status?.defaultModel ?? DEFAULT_MODEL}
                ollamaRunning={!!status?.ollamaRunning}
              />
            )}

            {tab === "models" && (
              <>
                <CloudProvidersPanel onChanged={refresh} />
                <ModelManager
                  installedModels={status?.models ?? []}
                  defaultModel={status?.defaultModel ?? DEFAULT_MODEL}
                  onDefaultChanged={refresh}
                />
              </>
            )}

            {tab === "image" && <LocalImagePanel />}

            {tab === "context" && <ContextManager />}

            {tab === "review" && <PrReviewPanel />}

            {tab === "projects" && <ProjectManager />}

            {tab === "mcp" && <McpServersManager />}

            {tab === "settings" && (
              <HostSettingsPanel
                installedModels={status?.models ?? []}
                defaultModel={status?.defaultModel ?? DEFAULT_MODEL}
                airGapped={airGappedMode}
                togglingAirGapped={togglingAirGapped}
                onAirGappedChange={handleAirGappedToggle}
                onSettingsSaved={refresh}
              />
            )}

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

      <section className="panel" aria-label="File d'attente chat">
        <h2>File d&apos;attente chat</h2>
        {status && (status.queueDepth ?? 0) === 0 && (status.queuePosition ?? 0) === 0 ? (
          <EmptyState
            icon="activity"
            variant="compact"
            title="File vide"
            description="Aucune requête en file — le host est disponible."
          />
        ) : (
          <ul className="session-list">
            {(status?.queuePosition ?? 0) > 0 ? (
              <li className="session-item">
                <span className="session-item__dot" />
                Génération en cours (position {status?.queuePosition})
              </li>
            ) : null}
            {(status?.queueDepth ?? 0) > 0 ? (
              <li className="session-item">
                <span className="session-item__dot" />
                {(status?.queueDepth ?? 0) === 1
                  ? "1 requête en attente"
                  : `${status?.queueDepth} requêtes en attente`}
                {" "}
                (positions {(status?.queuePosition ?? 0) + 1}–
                {(status?.queuePosition ?? 0) + (status?.queueDepth ?? 0)})
              </li>
            ) : null}
          </ul>
        )}
        <p className="panel__meta muted">
          Profondeur file : {status?.queueDepth ?? 0}
          {" · "}
          Position active : {(status?.queuePosition ?? 0) > 0 ? status?.queuePosition : "—"}
        </p>
      </section>

      <section className="panel" aria-label="Génération média">
        <h2>Génération média</h2>
        {(status?.activeMediaGenerations ?? 0) === 0 ? (
          <EmptyState
            icon="sparkles"
            variant="compact"
            title="Aucune génération média"
            description="Image, voix, musique ou vidéo — rien en cours pour le moment."
          />
        ) : (
          <ul className="session-list">
            {(status?.mediaJobs ?? []).map((job) => (
              <li key={job.id} className="session-item">
                <span className="session-item__dot" />
                {job.kind === "image"
                  ? "Image"
                  : job.kind === "voice"
                    ? "Voix"
                    : job.kind === "music"
                      ? "Musique"
                      : job.kind === "video"
                        ? "Vidéo"
                        : job.kind}
                {" · "}
                {job.status === "queued" ? "En file" : `${job.progress} %`}
                {job.message ? ` — ${job.message}` : ""}
              </li>
            ))}
          </ul>
        )}
        <p className="panel__meta muted">
          Actives : {status?.activeMediaGenerations ?? 0}
        </p>
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
          <EmptyState
            icon="activity"
            variant="compact"
            title="Pas encore de génération"
            description="Lancez un chat pour voir tokens/s, latence et RAM."
          />
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
                {fallbackModel && m.startsWith(fallbackModel) ? (
                  <span className="model-chip__tag">secours</span>
                ) : null}
              </li>
            ))}
          </ul>
        ) : (
          <EmptyState
            icon="sparkles"
            variant="compact"
            title="Aucun modèle chargé"
            description={
              status?.ollamaRunning
                ? "Téléchargez un modèle depuis l'onglet Modèles."
                : "Démarrez Ollama pour voir les modèles."
            }
          />
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
          <EmptyState
            icon="users"
            variant="compact"
            title="Aucun client connecté"
            description="Ouvrez le chat web depuis votre navigateur pour commencer."
          />
        )}
      </section>

      <UpdatesPanel appUrl={appUrl} onError={setOpenError} />

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

          </div>

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
      </div>
    </div>
  );
}

export default function Dashboard(props: DashboardProps) {
  return (
    <CommandPaletteProvider>
      <DashboardContent {...props} />
    </CommandPaletteProvider>
  );
}
