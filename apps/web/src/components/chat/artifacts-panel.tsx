"use client";

import { useState } from "react";
import type { ParsedArtifact } from "@/lib/artifacts";
import { copyArtifactToClipboard, downloadArtifact } from "@/lib/artifacts";
import { renderMarkdownToHtml } from "@/lib/markdown-render";
import { Button } from "@/components/ui/button";

interface ArtifactsPanelProps {
  artifacts: ParsedArtifact[];
  activeId: string | null;
  onSelect: (id: string | null) => void;
}

function artifactTypeLabel(type: ParsedArtifact["type"]): string {
  return type === "table" ? "Tableau" : "Markdown";
}

export function ArtifactsPanel({ artifacts, activeId, onSelect }: ArtifactsPanelProps) {
  const [copyNotice, setCopyNotice] = useState<string | null>(null);
  const active =
    artifacts.find((artifact) => artifact.id === activeId) ??
    (artifacts.length === 1 ? artifacts[0] : null);

  async function handleCopy(artifact: ParsedArtifact) {
    try {
      await copyArtifactToClipboard(artifact);
      setCopyNotice("Contenu copié dans le presse-papiers.");
      window.setTimeout(() => setCopyNotice(null), 2500);
    } catch {
      setCopyNotice("Impossible de copier — vérifiez les permissions du navigateur.");
    }
  }

  if (artifacts.length === 0) {
    return (
      <aside className="artifacts-panel" aria-label="Artefacts">
        <h2 className="artifacts-panel__title">Artefacts</h2>
        <p className="text-xs text-[var(--muted)]">
          Documents générés par l&apos;assistant (markdown, tableaux). Export local uniquement —
          rien n&apos;est envoyé au cloud.
        </p>
        <p className="mt-3 text-sm text-[var(--muted)]">
          Demandez un rapport ou un tableau : l&apos;assistant peut l&apos;ouvrir ici pour copie ou
          téléchargement.
        </p>
      </aside>
    );
  }

  return (
    <aside className="artifacts-panel" aria-label="Artefacts">
      <h2 className="artifacts-panel__title">Artefacts</h2>
      <p className="text-xs text-[var(--muted)]">
        Export local — copie ou téléchargement .md sans cloud.
      </p>

      {artifacts.length > 1 && (
        <ul className="mt-3 space-y-1">
          {artifacts.map((artifact) => (
            <li key={artifact.id}>
              <button
                type="button"
                className={`w-full rounded border px-2 py-1.5 text-left text-sm ${
                  active?.id === artifact.id
                    ? "border-neutral-400 bg-neutral-100"
                    : "border-[var(--border)] bg-neutral-50 hover:border-neutral-300"
                }`}
                onClick={() => onSelect(artifact.id)}
              >
                <span className="font-medium">{artifact.title}</span>
                <span className="ml-2 text-xs text-[var(--muted)]">
                  {artifactTypeLabel(artifact.type)}
                </span>
              </button>
            </li>
          ))}
        </ul>
      )}

      {active && (
        <div className="mt-3 flex min-h-0 flex-1 flex-col">
          <div className="mb-2 flex items-start justify-between gap-2">
            <div>
              <p className="text-sm font-medium">{active.title}</p>
              <p className="text-xs text-[var(--muted)]">{artifactTypeLabel(active.type)}</p>
            </div>
            <div className="flex shrink-0 gap-1">
              <Button type="button" variant="secondary" onClick={() => void handleCopy(active)}>
                Copier
              </Button>
              <Button type="button" variant="secondary" onClick={() => downloadArtifact(active)}>
                Télécharger
              </Button>
            </div>
          </div>

          {copyNotice && <p className="mb-2 text-xs text-[var(--link)]">{copyNotice}</p>}

          <div
            className="artifacts-panel__preview prose-chat text-sm"
            dangerouslySetInnerHTML={{ __html: renderMarkdownToHtml(active.content) }}
          />
        </div>
      )}
    </aside>
  );
}
