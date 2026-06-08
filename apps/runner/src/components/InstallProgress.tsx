import type { OllamaStatus, SetupProgress } from "../types";

interface InstallProgressProps {
  progress: SetupProgress | null;
  ollamaStatus: OllamaStatus | null;
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

const PHASE_LABELS: Record<string, string> = {
  ollama_download: "Téléchargement d'Ollama",
  ollama_install: "Installation d'Ollama",
  ollama_start: "Démarrage d'Ollama",
  model_pull: "Téléchargement des modèles",
};

export default function InstallProgress({
  progress,
  ollamaStatus,
}: InstallProgressProps) {
  const percent = progress?.percent ?? null;
  const barWidth =
    percent !== null ? `${Math.min(100, Math.max(0, percent))}%` : progress ? "40%" : "10%";

  const phaseLabel = progress ? (PHASE_LABELS[progress.phase] ?? progress.phase) : null;

  return (
    <>
      <h1>Préparation de l&apos;IA</h1>

      {phaseLabel && <p className="progress-phase">{phaseLabel}</p>}
      {progress?.message && <p>{progress.message}</p>}

      {progress?.currentModel && (
        <p className="muted" style={{ fontSize: 13 }}>
          Modèle : <code className="inline-code">{progress.currentModel}</code>
          {progress.modelIndex && progress.modelCount
            ? ` (${progress.modelIndex}/${progress.modelCount})`
            : null}
        </p>
      )}

      {progress?.bytesDownloaded != null && progress.bytesTotal != null && (
        <p className="muted" style={{ fontSize: 13 }}>
          {formatBytes(progress.bytesDownloaded)} / {formatBytes(progress.bytesTotal)}
        </p>
      )}

      {ollamaStatus && (
        <p className="muted" style={{ fontSize: 14 }}>
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

      {percent !== null && (
        <p className="progress-percent">{percent.toFixed(0)} %</p>
      )}
    </>
  );
}
