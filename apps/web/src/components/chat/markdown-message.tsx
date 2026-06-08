"use client";

import type { ParsedArtifact } from "@/lib/artifacts";
import { extractArtifacts, hasOpenArtifactFence } from "@/lib/artifacts";
import { renderMarkdownToHtml } from "@/lib/markdown-render";
import type { RelayClient } from "@/lib/relay-client";
import { extractUnifiedPatches } from "@/lib/unified-patch";
import { DiffPatchPanel } from "./diff-patch-panel";

interface MarkdownMessageProps {
  content: string;
  messageKey: string;
  onOpenArtifact?: (artifact: ParsedArtifact) => void;
  relay?: RelayClient | null;
  contextIds?: string[];
  connected?: boolean;
}

const PLACEHOLDER_RE = /\[\[ARTIFACT:([^\]]+)\]\]/g;

function artifactTypeLabel(type: ParsedArtifact["type"]): string {
  return type === "table" ? "Tableau" : "Markdown";
}

function renderWithPlaceholders(
  displayContent: string,
  artifacts: ParsedArtifact[],
  onOpenArtifact?: (artifact: ParsedArtifact) => void,
): React.ReactNode[] {
  const byId = new Map(artifacts.map((artifact) => [artifact.id, artifact]));
  const nodes: React.ReactNode[] = [];
  let lastIndex = 0;
  let match: RegExpExecArray | null;

  PLACEHOLDER_RE.lastIndex = 0;
  while ((match = PLACEHOLDER_RE.exec(displayContent)) !== null) {
    const before = displayContent.slice(lastIndex, match.index);
    if (before) {
      nodes.push(
        <span
          key={`text-${lastIndex}`}
          dangerouslySetInnerHTML={{ __html: renderMarkdownToHtml(before) }}
        />,
      );
    }

    const artifact = byId.get(match[1]);
    if (artifact) {
      nodes.push(
        <button
          key={artifact.id}
          type="button"
          className="artifact-card"
          onClick={() => onOpenArtifact?.(artifact)}
        >
          <span className="artifact-card__label">Artefact</span>
          <span className="artifact-card__title">{artifact.title}</span>
          <span className="artifact-card__meta">{artifactTypeLabel(artifact.type)} · Ouvrir</span>
        </button>,
      );
    }

    lastIndex = match.index + match[0].length;
  }

  const tail = displayContent.slice(lastIndex);
  if (tail) {
    nodes.push(
      <span
        key={`text-${lastIndex}`}
        dangerouslySetInnerHTML={{ __html: renderMarkdownToHtml(tail) }}
      />,
    );
  }

  return nodes;
}

export function MarkdownMessage({
  content,
  messageKey,
  onOpenArtifact,
  relay,
  contextIds = [],
  connected = false,
}: MarkdownMessageProps) {
  const { displayContent, artifacts } = extractArtifacts(content, messageKey);
  const streamingArtifact = hasOpenArtifactFence(content);
  const patches = extractUnifiedPatches(content);
  const showPatches = patches.length > 0 && relay && connected;

  return (
    <div className="prose-chat text-sm">
      {artifacts.length > 0 || streamingArtifact ? (
        <>
          {renderWithPlaceholders(displayContent, artifacts, onOpenArtifact)}
          {streamingArtifact && (
            <p className="mt-2 text-xs text-[var(--muted)]">Génération de l&apos;artefact…</p>
          )}
        </>
      ) : (
        <div dangerouslySetInnerHTML={{ __html: renderMarkdownToHtml(content) }} />
      )}
      {showPatches &&
        patches.map((item, index) => (
          <DiffPatchPanel
            key={`patch-${index}-${item.path ?? "auto"}`}
            relay={relay}
            path={item.path}
            patch={item.patch}
            contextIds={contextIds}
          />
        ))}
      {patches.length > 0 && (!relay || !connected) && (
        <p className="mt-2 text-xs text-amber-400">
          Patch détecté — connectez le Host pour prévisualiser et appliquer.
        </p>
      )}
    </div>
  );
}
