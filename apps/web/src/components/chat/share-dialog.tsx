"use client";

import { useState } from "react";
import type { ShareMessage } from "@ownmyownai/protocol";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { createConversationShare } from "@/lib/share";

interface ShareDialogProps {
  hostId: string;
  messages: ShareMessage[];
  onClose: () => void;
}

export function ShareDialog({ hostId, messages, onClose }: ShareDialogProps) {
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [shareUrl, setShareUrl] = useState<string | null>(null);
  const [expiresAt, setExpiresAt] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);

  async function handleCreate() {
    setLoading(true);
    setError(null);
    try {
      const result = await createConversationShare({ hostId, messages });
      setShareUrl(result.share_url);
      setExpiresAt(result.expires_at);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Erreur");
    } finally {
      setLoading(false);
    }
  }

  async function handleCopy() {
    if (!shareUrl) return;
    await navigator.clipboard.writeText(shareUrl);
    setCopied(true);
    window.setTimeout(() => setCopied(false), 2000);
  }

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4"
      role="dialog"
      aria-modal="true"
      aria-labelledby="share-dialog-title"
    >
      <Card className="w-full max-w-md">
        <h2 id="share-dialog-title" className="mb-2 text-lg font-semibold">
          Partager en lecture seule
        </h2>
        <p className="mb-4 text-sm text-[var(--muted)]">
          Crée un lien temporaire (24 h) avec le contenu de la conversation uniquement. Les
          documents RAG et le contexte lié ne sont jamais inclus.
        </p>

        {!shareUrl ? (
          <>
            {error && <p className="mb-3 text-sm text-red-400">{error}</p>}
            <div className="flex gap-2">
              <Button type="button" variant="secondary" onClick={onClose} disabled={loading}>
                Annuler
              </Button>
              <Button type="button" onClick={handleCreate} disabled={loading}>
                {loading ? "Création…" : "Créer le lien"}
              </Button>
            </div>
          </>
        ) : (
          <>
            <label htmlFor="share-url" className="mb-1 block text-xs text-[var(--muted)]">
              Lien de partage
            </label>
            <input
              id="share-url"
              readOnly
              value={shareUrl}
              className="mb-2 w-full rounded-lg border border-[var(--border)] bg-black/30 px-3 py-2 font-mono text-xs"
            />
            {expiresAt && (
              <p className="mb-3 text-xs text-[var(--muted)]">
                Expire le {new Date(expiresAt).toLocaleString("fr-FR")}
              </p>
            )}
            <div className="flex gap-2">
              <Button type="button" variant="secondary" onClick={onClose}>
                Fermer
              </Button>
              <Button type="button" onClick={handleCopy}>
                {copied ? "Copié !" : "Copier le lien"}
              </Button>
            </div>
          </>
        )}
      </Card>
    </div>
  );
}
