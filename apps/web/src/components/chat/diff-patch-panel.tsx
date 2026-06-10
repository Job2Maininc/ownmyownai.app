"use client";

import { useState } from "react";
import type { PatchPreviewResponse } from "@ownmyownai/protocol";
import type { RelayClient } from "@/lib/relay-client";
import { patchLineClass } from "@/lib/unified-patch";
import { Button } from "@/components/ui/button";

interface DiffPatchPanelProps {
  relay: RelayClient;
  path?: string;
  patch: string;
  contextIds: string[];
  onApplied?: () => void;
  onReject?: () => void;
}

export function DiffPatchPanel({
  relay,
  path: initialPath,
  patch,
  contextIds,
  onApplied,
  onReject,
}: DiffPatchPanelProps) {
  const [path, setPath] = useState(initialPath ?? "");
  const [preview, setPreview] = useState<PatchPreviewResponse | null>(null);
  const [loading, setLoading] = useState(false);
  const [applying, setApplying] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [rejected, setRejected] = useState(false);

  async function handlePreview() {
    setLoading(true);
    setError(null);
    setPreview(null);
    try {
      const result = await relay.previewPatch({
        path: path.trim() || undefined,
        patch,
        contextIds,
      });
      setPreview(result);
      if (!path.trim()) setPath(result.path);
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setLoading(false);
    }
  }

  async function handleApply() {
    if (!preview) return;
    const target = preview.path || path;
    if (
      !window.confirm(
        `Appliquer ce patch sur « ${target} » sur ce PC ?\n\n+${preview.linesAdded} / -${preview.linesRemoved} ligne(s)`,
      )
    ) {
      return;
    }
    setApplying(true);
    setError(null);
    try {
      await relay.applyPatch({
        path: target,
        patch: preview.patch,
        contextIds,
      });
      onApplied?.();
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setApplying(false);
    }
  }

  function handleReject() {
    setRejected(true);
    setPreview(null);
    onReject?.();
  }

  if (rejected) {
    return (
      <p className="mt-2 text-xs text-[var(--muted)]">Patch rejeté — aucune modification sur le disque.</p>
    );
  }

  return (
    <div className="diff-patch-panel" role="region" aria-label="Patch unified">
      <div className="diff-patch-panel__header">
        <p className="text-xs font-medium">Patch proposé</p>
        <span className="text-xs text-[var(--muted)]">Prévisualisation obligatoire avant écriture</span>
      </div>

      {!initialPath && (
        <label className="mt-2 block text-xs">
          Chemin du fichier (sous dossier lié)
          <input
            value={path}
            onChange={(e) => setPath(e.target.value)}
            placeholder="C:\projets\mon-repo\src\lib.rs"
            className="mt-1 w-full rounded border border-[var(--border)] bg-white px-2 py-1 text-xs"
            disabled={loading || applying || !!preview}
          />
        </label>
      )}

      <div className="diff-patch-panel__code mt-2">
        {patch.split("\n").map((line, i) => (
          <div key={`${i}-${line}`} className={patchLineClass(line)}>
            {line || " "}
          </div>
        ))}
      </div>

      <div className="mt-2 flex flex-wrap gap-2">
        {!preview && (
          <Button
            type="button"
            variant="secondary"
            disabled={loading || applying}
            onClick={() => void handlePreview()}
          >
            {loading ? "Vérification…" : "Prévisualiser"}
          </Button>
        )}
        {preview && (
          <>
            <Button type="button" disabled={applying} onClick={() => void handleApply()}>
              {applying ? "Application…" : "Appliquer"}
            </Button>
            <Button type="button" variant="secondary" disabled={applying} onClick={handleReject}>
              Rejeter
            </Button>
          </>
        )}
      </div>

      {preview && (
        <p className="mt-2 text-xs text-[var(--link)]">
          {preview.hunks} hunk(s) — +{preview.linesAdded} / -{preview.linesRemoved} ligne(s) sur{" "}
          <span className="font-mono">{preview.path}</span>
        </p>
      )}
      {error && <p className="mt-2 text-xs text-red-400">{error}</p>}
    </div>
  );
}
