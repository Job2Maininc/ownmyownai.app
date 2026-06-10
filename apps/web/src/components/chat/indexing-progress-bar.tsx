"use client";

interface IndexingProgressBarProps {
  progress: number;
  message?: string;
  compact?: boolean;
}

export function IndexingProgressBar({
  progress,
  message,
  compact = false,
}: IndexingProgressBarProps) {
  const clamped = Math.min(100, Math.max(0, Math.round(progress)));

  return (
    <div className={compact ? "indexing-progress indexing-progress--compact" : "indexing-progress"}>
      <div className="indexing-progress__head">
        <span className="indexing-progress__label">Indexation en cours</span>
        <span className="indexing-progress__percent">{clamped}%</span>
      </div>
      <div
        className="indexing-progress__track"
        role="progressbar"
        aria-valuenow={clamped}
        aria-valuemin={0}
        aria-valuemax={100}
        aria-label={message || "Progression de l'indexation"}
      >
        <div className="indexing-progress__fill" style={{ width: `${clamped}%` }} />
      </div>
      {message ? <p className="indexing-progress__message">{message}</p> : null}
    </div>
  );
}
