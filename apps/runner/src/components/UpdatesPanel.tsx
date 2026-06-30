import { useCallback, useEffect, useState } from "react";
import { getVersion } from "@tauri-apps/api/app";
import { invoke } from "@tauri-apps/api/core";
import type { UpdateCheckResult, UpdateStatus } from "../types";

interface UpdatesPanelProps {
  appUrl: string;
  onError?: (message: string) => void;
}

const STATUS_LABELS: Record<UpdateStatus, string> = {
  upToDate: "À jour",
  ahead: "Build avancé",
  updateAuto: "Mise à jour disponible",
  updateManual: "Mise à jour manuelle",
  checkFailed: "Vérification impossible",
};

const STATUS_VARIANTS: Record<UpdateStatus, "ok" | "warn" | "off" | "info"> = {
  upToDate: "ok",
  ahead: "info",
  updateAuto: "info",
  updateManual: "warn",
  checkFailed: "off",
};

function formatCheckedAt(date: Date): string {
  return date.toLocaleString("fr-FR", {
    day: "2-digit",
    month: "short",
    hour: "2-digit",
    minute: "2-digit",
  });
}

export default function UpdatesPanel({ appUrl, onError }: UpdatesPanelProps) {
  const [appVersion, setAppVersion] = useState<string | null>(null);
  const [updateInfo, setUpdateInfo] = useState<UpdateCheckResult | null>(null);
  const [checkingUpdate, setCheckingUpdate] = useState(false);
  const [installingUpdate, setInstallingUpdate] = useState(false);
  const [lastCheckedAt, setLastCheckedAt] = useState<Date | null>(null);

  useEffect(() => {
    void getVersion().then(setAppVersion).catch(() => undefined);
  }, []);

  const refresh = useCallback(async () => {
    setCheckingUpdate(true);
    try {
      const info = await invoke<UpdateCheckResult>("check_for_updates");
      setUpdateInfo(info);
      setLastCheckedAt(new Date());
    } catch (e) {
      setUpdateInfo(null);
      onError?.(String(e));
    } finally {
      setCheckingUpdate(false);
    }
  }, [onError]);

  useEffect(() => {
    void refresh();
  }, [refresh]);

  async function openDownloadPage() {
    try {
      await invoke("open_url", { url: `${appUrl}/download` });
    } catch (e) {
      onError?.(`Impossible d'ouvrir le navigateur : ${String(e)}`);
    }
  }

  async function installUpdate() {
    setInstallingUpdate(true);
    try {
      await invoke("install_host_update");
    } catch (e) {
      onError?.(String(e));
    } finally {
      setInstallingUpdate(false);
    }
  }

  const installedVersion = appVersion ?? updateInfo?.currentVersion ?? "—";
  const publishedVersion = updateInfo?.remoteVersion ?? "—";
  const status = checkingUpdate ? null : updateInfo?.status ?? null;
  const statusVariant = status ? STATUS_VARIANTS[status] : "off";
  const statusLabel = checkingUpdate
    ? "Vérification…"
    : status
      ? STATUS_LABELS[status]
      : "—";

  return (
    <section className="panel" aria-label="Mises à jour">
      <div className="panel__head">
        <h2>Mises à jour</h2>
        <button
          type="button"
          className="btn-ghost"
          onClick={() => void refresh()}
          disabled={checkingUpdate || installingUpdate}
        >
          {checkingUpdate ? "…" : "Vérifier"}
        </button>
      </div>

      <div className={`update-status update-status--${statusVariant}`} role="status" aria-live="polite">
        <span className="update-status__dot" aria-hidden />
        <span className="update-status__label">{statusLabel}</span>
      </div>

      <dl className="update-versions">
        <div className="update-versions__row">
          <dt>Installée</dt>
          <dd>
            <strong>{installedVersion}</strong>
          </dd>
        </div>
        <div className="update-versions__row">
          <dt>Publiée</dt>
          <dd>
            <strong>{publishedVersion}</strong>
          </dd>
        </div>
        {lastCheckedAt ? (
          <div className="update-versions__row">
            <dt>Dernière vérif.</dt>
            <dd className="muted">{formatCheckedAt(lastCheckedAt)}</dd>
          </div>
        ) : null}
      </dl>

      <p className="panel__meta muted">
        {checkingUpdate
          ? "Interrogation du serveur de releases…"
          : (updateInfo?.message ??
            "Vérification automatique au démarrage puis toutes les heures.")}
      </p>

      {updateInfo?.status === "updateManual" ? (
        <div className="update-callout update-callout--warn" role="note">
          <p className="update-callout__title">Installation manuelle requise</p>
          <p className="update-callout__body">
            Une version plus récente est en ligne, mais le canal de mise à jour automatique
            n&apos;est pas encore actif pour cette release. Téléchargez{" "}
            <strong>OwnMyOwnAI-Host-setup.exe</strong> et relancez l&apos;installateur.
          </p>
        </div>
      ) : null}

      {updateInfo?.status === "ahead" ? (
        <div className="update-callout update-callout--info" role="note">
          <p className="update-callout__body">
            Votre version locale est plus récente que celle publiée. Normal en développement ou
            avec un build local non tagué.
          </p>
        </div>
      ) : null}

      {updateInfo?.status === "checkFailed" ? (
        <div className="update-callout update-callout--warn" role="note">
          <p className="update-callout__body">
            Impossible de confirmer la version distante. Vérifiez votre connexion Internet ou
            consultez la page Télécharger.
          </p>
        </div>
      ) : null}

      {updateInfo?.updateAvailable ? (
        <div className="dashboard__actions" style={{ marginTop: 12 }}>
          {updateInfo.autoUpdateReady ? (
            <button
              type="button"
              className="btn-primary"
              style={{ width: "100%" }}
              disabled={installingUpdate}
              onClick={() => void installUpdate()}
            >
              {installingUpdate ? "Installation…" : "Installer maintenant"}
            </button>
          ) : (
            <>
              <button
                type="button"
                className="btn-primary"
                style={{ width: "100%" }}
                onClick={() => void openDownloadPage()}
              >
                Télécharger l&apos;installateur
              </button>
              <button
                type="button"
                className="btn-ghost"
                style={{ width: "100%" }}
                onClick={() => void refresh()}
                disabled={checkingUpdate}
              >
                Revérifier après installation
              </button>
            </>
          )}
        </div>
      ) : updateInfo?.status === "checkFailed" ? (
        <div className="dashboard__actions" style={{ marginTop: 12 }}>
          <button
            type="button"
            className="btn-secondary"
            style={{ width: "100%" }}
            onClick={() => void openDownloadPage()}
          >
            Ouvrir la page Télécharger
          </button>
        </div>
      ) : null}

      <p className="panel__meta muted update-footnote">
        Mises à jour automatiques : installateur NSIS uniquement (pas le ZIP portable). Vérification
        au démarrage puis toutes les heures.
      </p>
    </section>
  );
}
