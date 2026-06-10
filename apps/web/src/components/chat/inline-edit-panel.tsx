"use client";

import { useState } from "react";
import type { InlineEditPreviewResponse } from "@ownmyownai/protocol";
import type { RelayClient } from "@/lib/relay-client";
import { Button } from "@/components/ui/button";

interface InlineEditPanelProps {
  relay: RelayClient;
  documentId: string;
  filename: string;
  initialSelection: string;
  onApplied: () => void;
  onClose: () => void;
}

export function InlineEditPanel({
  relay,
  documentId,
  filename,
  initialSelection,
  onApplied,
  onClose,
}: InlineEditPanelProps) {
  const [selectedText, setSelectedText] = useState(initialSelection);
  const [instruction, setInstruction] = useState("Reformule ce paragraphe en gardant le sens.");
  const [preview, setPreview] = useState<InlineEditPreviewResponse | null>(null);
  const [loading, setLoading] = useState(false);
  const [applying, setApplying] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function handlePreview() {
    if (!selectedText.trim() || !instruction.trim()) return;
    setLoading(true);
    setError(null);
    setPreview(null);
    try {
      const result = await relay.previewInlineEdit({
        documentId,
        selectedText: selectedText.trim(),
        instruction: instruction.trim(),
      });
      setPreview(result);
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setLoading(false);
    }
  }

  async function handleApply() {
    if (!preview) return;
    if (!window.confirm(`Appliquer la modification dans « ${filename} » sur ce PC ?`)) return;
    setApplying(true);
    setError(null);
    try {
      await relay.applyInlineEdit({
        documentId: preview.documentId,
        selectedText: preview.selectedText,
        proposedText: preview.proposedText,
      });
      onApplied();
      onClose();
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setApplying(false);
    }
  }

  return (
    <div className="inline-edit-panel" role="dialog" aria-label="Édition inline">
      <div className="inline-edit-panel__header">
        <p className="text-xs font-medium">Édition inline — {filename}</p>
        <button type="button" className="text-xs text-[var(--muted)] hover:text-white" onClick={onClose}>
          Fermer
        </button>
      </div>
      <p className="mt-1 text-xs text-[var(--muted)]">
        Reformulez via Ollama sur votre PC, puis confirmez avant écriture du fichier source.
      </p>
      <label className="mt-2 block text-xs">
        Texte sélectionné
        <textarea
          value={selectedText}
          onChange={(e) => setSelectedText(e.target.value)}
          rows={4}
          className="mt-1 w-full rounded border border-[var(--border)] bg-white px-2 py-1 text-xs"
          disabled={loading || applying}
        />
      </label>
      <label className="mt-2 block text-xs">
        Instruction
        <input
          value={instruction}
          onChange={(e) => setInstruction(e.target.value)}
          className="mt-1 w-full rounded border border-[var(--border)] bg-white px-2 py-1 text-xs"
          disabled={loading || applying}
        />
      </label>
      <div className="mt-2 flex gap-2">
        <Button
          type="button"
          variant="secondary"
          disabled={loading || applying || !selectedText.trim()}
          onClick={() => void handlePreview()}
        >
          {loading ? "Génération…" : "Prévisualiser"}
        </Button>
        {preview && (
          <Button type="button" disabled={applying} onClick={() => void handleApply()}>
            {applying ? "Application…" : "Appliquer"}
          </Button>
        )}
      </div>
      {preview && (
        <div className="inline-edit-preview mt-3">
          <p className="text-xs font-medium">Aperçu des modifications</p>
          <div className="inline-edit-preview__diff mt-2">
            <div className="inline-edit-preview__before">
              <span className="inline-edit-preview__label">Avant</span>
              <pre>{preview.selectedText}</pre>
            </div>
            <div className="inline-edit-preview__after">
              <span className="inline-edit-preview__label">Après</span>
              <pre>{preview.proposedText}</pre>
            </div>
          </div>
        </div>
      )}
      {error && <p className="mt-2 text-xs text-red-400">{error}</p>}
    </div>
  );
}
