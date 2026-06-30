import { useEffect, useRef, useState } from "react";
import type { OllamaStatus, SetupProgress } from "../types";

interface InstallProgressProps {
  progress: SetupProgress | null;
  ollamaStatus: OllamaStatus | null;
  activityLog: string[];
}

function formatBytes(bytes: number): string {
  const units = ["o", "Ko", "Mo", "Go"];
  let value = bytes;
  let unit = 0;
  while (value >= 1024 && unit < units.length - 1) {
    value /= 1024;
    unit += 1;
  }
  return unit === 0 ? `${bytes} ${units[0]}` : `${value.toFixed(1)} ${units[unit]}`;
}

function formatElapsed(seconds: number): string {
  const m = Math.floor(seconds / 60);
  const s = seconds % 60;
  return m > 0 ? `${m} min ${s} s` : `${s} s`;
}

const PHASE_LABELS: Record<string, string> = {
  ollama_download: "Téléchargement d'Ollama",
  ollama_install: "Installation d'Ollama",
  ollama_start: "Démarrage d'Ollama",
  model_pull: "Téléchargement des modèles",
};

export default function InstallProgress({
  progress,
  ollamaStatus,
  activityLog,
}: InstallProgressProps) {
  const logEndRef = useRef<HTMLDivElement>(null);
  const [startedAt] = useState(() => Date.now());
  const [elapsedSec, setElapsedSec] = useState(0);

  useEffect(() => {
    logEndRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [activityLog]);

  useEffect(() => {
    const id = window.setInterval(() => {
      setElapsedSec(Math.floor((Date.now() - startedAt) / 1000));
    }, 1000);
    return () => window.clearInterval(id);
  }, [startedAt]);

  const percent = progress?.percent ?? null;
  const barWidth =
    percent !== null ? `${Math.min(100, Math.max(0, percent))}%` : progress ? "40%" : "10%";

  const phaseLabel = progress ? (PHASE_LABELS[progress.phase] ?? progress.phase) : null;

  const bytesDone = progress?.bytesDownloaded ?? null;
  const bytesTotal = progress?.bytesTotal ?? null;
  const bytesRemaining =
    bytesDone != null && bytesTotal != null ? Math.max(0, bytesTotal - bytesDone) : null;

  return (
    <>
      <h1>Préparation de l&apos;IA</h1>

      {phaseLabel && <p className="progress-phase">{phaseLabel}</p>}
      {progress?.message && <p className="progress-status">{progress.message}</p>}

      {bytesDone != null && bytesTotal != null && (
        <div className="progress-stats">
          <div className="progress-stat">
            <span className="progress-stat-label">Téléchargé</span>
            <span className="progress-stat-value">{formatBytes(bytesDone)}</span>
          </div>
          <div className="progress-stat">
            <span className="progress-stat-label">Total</span>
            <span className="progress-stat-value">{formatBytes(bytesTotal)}</span>
          </div>
          {bytesRemaining != null && (
            <div className="progress-stat">
              <span className="progress-stat-label">Reste</span>
              <span className="progress-stat-value">{formatBytes(bytesRemaining)}</span>
            </div>
          )}
        </div>
      )}

      {progress?.currentModel && (
        <p className="muted type-caption">
          Modèle : <code className="inline-code">{progress.currentModel}</code>
          {progress.modelIndex && progress.modelCount
            ? ` (${progress.modelIndex}/${progress.modelCount})`
            : null}
        </p>
      )}

      {ollamaStatus && (
        <p className="muted type-small">
          {ollamaStatus.running ? "Moteur IA actif" : "Installation ou démarrage…"}
          {ollamaStatus.models.length > 0 &&
            ` · ${ollamaStatus.models.length} modèle(s) installé(s)`}
        </p>
      )}

      <div className="progress">
        <div
          className={`progress-bar ${percent === null && progress ? "progress-bar--indeterminate" : ""}`}
          style={{ width: barWidth }}
        />
      </div>

      <div className="progress-footer">
        {percent !== null && <span className="progress-percent">{percent.toFixed(0)} %</span>}
        <span className="progress-elapsed">Temps écoulé : {formatElapsed(elapsedSec)}</span>
      </div>

      {activityLog.length > 0 && (
        <div className="activity-log" aria-live="polite">
          <p className="activity-log-title">Activité</p>
          <div className="activity-log-body">
            {activityLog.map((line, i) => (
              <div key={`${i}-${line.slice(0, 24)}`} className="activity-log-line">
                {line}
              </div>
            ))}
            <div ref={logEndRef} />
          </div>
        </div>
      )}
    </>
  );
}
