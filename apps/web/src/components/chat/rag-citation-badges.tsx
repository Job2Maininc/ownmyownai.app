"use client";

import { useState } from "react";
import type { RagCitation } from "@ownmyownai/protocol";

interface RagCitationBadgesProps {
  citations: RagCitation[];
}

export function RagCitationBadges({ citations }: RagCitationBadgesProps) {
  const [expandedIndex, setExpandedIndex] = useState<number | null>(null);

  if (citations.length === 0) return null;

  return (
    <div className="mt-3 border-t border-[var(--border)] pt-2">
      <p className="mb-1.5 text-xs text-[var(--muted)]">Sources ({citations.length})</p>
      <div className="flex flex-wrap gap-1.5">
        {citations.map((citation) => {
          const isOpen = expandedIndex === citation.index;
          return (
            <div key={citation.chunkId} className="relative">
              <button
                type="button"
                title={citation.sourceFull}
                aria-expanded={isOpen}
                onClick={() =>
                  setExpandedIndex(isOpen ? null : citation.index)
                }
                className={`inline-flex items-center gap-1 rounded-full border px-2 py-0.5 text-xs transition-colors ${
                  isOpen
                    ? "border-neutral-400 bg-neutral-100 text-[var(--foreground)]"
                    : "border-[var(--border)] bg-neutral-50 text-[var(--muted)] hover:border-neutral-300 hover:text-[var(--success)]"
                }`}
              >
                <span className="font-medium text-[var(--link)]">[{citation.index}]</span>
                <span>{citation.source}</span>
                <span className="text-[10px] opacity-70">
                  {(citation.score * 100).toFixed(0)}%
                </span>
              </button>
              {isOpen && (
                <div className="absolute left-0 top-full z-10 mt-1 w-72 max-w-[calc(100vw-4rem)] rounded-lg border border-[var(--border)] bg-[var(--card)] p-2 shadow-lg">
                  <p className="mb-1 text-[10px] text-[var(--muted)]" title={citation.sourceFull}>
                    {citation.sourceFull}
                  </p>
                  <p className="whitespace-pre-wrap text-xs leading-relaxed">{citation.excerpt}</p>
                </div>
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
}
