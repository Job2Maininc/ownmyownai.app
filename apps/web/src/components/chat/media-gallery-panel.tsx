"use client";

import { useCallback, useEffect, useMemo, useState, type ReactNode } from "react";
import type { CreativeReadResult, CreativeSummary } from "@ownmyownai/protocol";
import type { RelayClient } from "@/lib/relay-client";
import {
  creativeDataUrl,
  creativeKindLabel,
  downloadCreativeFile,
  filterMediaCreatives,
  formatCreativeBytes,
  formatCreativeTime,
} from "@/lib/creatives";
import { Button } from "@/components/ui/button";
import { ErrorAlert } from "@/components/ui/error-alert";
import { EmptyState } from "@/components/ui/empty-state";
import { formatApiError, type UserError } from "@/lib/user-errors";

interface MediaGalleryPanelProps {
  relay: RelayClient | null;
  connected: boolean;
  activeId?: string | null;
  onActiveChange?: (id: string | null) => void;
}

function previewForKind(
  kind: CreativeSummary["kind"],
  preview: CreativeReadResult | null,
  title: string,
): ReactNode {
  if (!preview) {
    return <p className="text-sm text-[var(--muted)]">Chargement de l&apos;aperçu…</p>;
  }

  const src = creativeDataUrl(preview);

  switch (kind) {
    case "image":
      return (
        // eslint-disable-next-line @next/next/no-img-element
        <img src={src} alt={title} className="media-gallery-panel__preview-image" />
      );
    case "audio":
      return <audio controls className="media-gallery-panel__preview-audio" src={src} />;
    case "video":
      return (
        <video controls className="media-gallery-panel__preview-video" src={src}>
          <track kind="captions" />
        </video>
      );
    default:
      return (
        <p className="text-sm text-[var(--muted)]">
          Aperçu indisponible pour ce type de fichier.
        </p>
      );
  }
}

export function MediaGalleryPanel({
  relay,
  connected,
  activeId = null,
  onActiveChange,
}: MediaGalleryPanelProps) {
  const [items, setItems] = useState<CreativeSummary[]>([]);
  const [loading, setLoading] = useState(false);
  const [previewLoading, setPreviewLoading] = useState(false);
  const [previewResult, setPreviewResult] = useState<CreativeReadResult | null>(null);
  const [error, setError] = useState<UserError | null>(null);
  const [notice, setNotice] = useState<string | null>(null);

  const mediaItems = useMemo(() => filterMediaCreatives(items), [items]);

  const active =
    mediaItems.find((item) => item.id === activeId) ??
    (mediaItems.length === 1 ? mediaItems[0] : null);

  const refresh = useCallback(async () => {
    if (!relay || !connected) {
      setItems([]);
      return;
    }
    setLoading(true);
    setError(null);
    try {
      const creatives = await relay.listCreatives();
      setItems(creatives);
    } catch (e) {
      setError(formatApiError(e));
    } finally {
      setLoading(false);
    }
  }, [relay, connected]);

  useEffect(() => {
    void refresh();
  }, [refresh]);

  useEffect(() => {
    if (!active || !relay || !connected) {
      setPreviewResult(null);
      return;
    }

    let cancelled = false;
    setPreviewLoading(true);
    setError(null);

    void (async () => {
      try {
        const result = await relay.readCreative(active.id);
        if (!cancelled) setPreviewResult(result);
      } catch (e) {
        if (!cancelled) {
          setError(formatApiError(e));
          setPreviewResult(null);
        }
      } finally {
        if (!cancelled) setPreviewLoading(false);
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [active, relay, connected]);

  async function handleDownload() {
    if (!relay || !active) return;
    setError(null);
    try {
      const result = previewResult ?? (await relay.readCreative(active.id));
      downloadCreativeFile(result);
      setNotice("Téléchargement lancé.");
      window.setTimeout(() => setNotice(null), 2500);
    } catch (e) {
      setError(formatApiError(e));
    }
  }

  async function handleDelete() {
    if (!relay || !active) return;
    const confirmed = window.confirm(
      `Supprimer « ${active.title} » du dossier créations sur le Host ? Cette action est irréversible.`,
    );
    if (!confirmed) return;

    setError(null);
    try {
      await relay.deleteCreative(active.id);
      onActiveChange?.(null);
      setPreviewResult(null);
      await refresh();
      setNotice("Média supprimé du Host.");
      window.setTimeout(() => setNotice(null), 2500);
    } catch (e) {
      setError(formatApiError(e));
    }
  }

  if (!connected) {
    return (
      <aside className="media-gallery-panel" aria-label="Galerie média">
        <h2 className="media-gallery-panel__title">Médias</h2>
        <EmptyState
          title="Host hors ligne"
          description="Connectez le Host pour parcourir les images, pistes audio et vidéos générées localement."
        />
      </aside>
    );
  }

  if (loading && mediaItems.length === 0) {
    return (
      <aside className="media-gallery-panel" aria-label="Galerie média">
        <h2 className="media-gallery-panel__title">Médias</h2>
        <p className="text-sm text-[var(--muted)]">Chargement de la galerie…</p>
      </aside>
    );
  }

  if (mediaItems.length === 0) {
    return (
      <aside className="media-gallery-panel" aria-label="Galerie média">
        <h2 className="media-gallery-panel__title">Médias</h2>
        <p className="text-xs text-[var(--muted)]">
          Fichiers image, audio et vidéo dans <code>creatives/</code> sur le Host — export local
          uniquement.
        </p>
        <EmptyState
          className="mt-3"
          title="Aucun média"
          description="Demandez une image ou une piste audio : les fichiers générés apparaîtront ici pour aperçu et téléchargement."
        />
        <Button type="button" variant="secondary" className="mt-3" onClick={() => void refresh()}>
          Actualiser
        </Button>
      </aside>
    );
  }

  return (
    <aside className="media-gallery-panel" aria-label="Galerie média">
      <div className="flex items-start justify-between gap-2">
        <div>
          <h2 className="media-gallery-panel__title">Médias</h2>
          <p className="text-xs text-[var(--muted)]">
            Galerie locale Host — aperçu, téléchargement et suppression.
          </p>
        </div>
        <Button type="button" variant="secondary" onClick={() => void refresh()}>
          Actualiser
        </Button>
      </div>

      {error && <ErrorAlert {...error} className="mt-3" />}
      {notice && <p className="mt-2 text-xs text-[var(--link)]">{notice}</p>}

      {mediaItems.length > 1 && (
        <ul className="mt-3 space-y-1">
          {mediaItems.map((item) => (
            <li key={item.id}>
              <button
                type="button"
                className={`media-gallery-panel__item ${
                  active?.id === item.id ? "media-gallery-panel__item--active" : ""
                }`}
                onClick={() => onActiveChange?.(item.id)}
              >
                <span className="font-medium">{item.title}</span>
                <span className="ml-2 text-xs text-[var(--muted)]">
                  {creativeKindLabel(item.kind)}
                  {formatCreativeBytes(item.bytes) ? ` · ${formatCreativeBytes(item.bytes)}` : ""}
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
              <p className="text-xs text-[var(--muted)]">
                {creativeKindLabel(active.kind)}
                {formatCreativeBytes(active.bytes) ? ` · ${formatCreativeBytes(active.bytes)}` : ""}
                {active.savedAt ? ` · ${formatCreativeTime(active.savedAt)}` : ""}
              </p>
            </div>
            <div className="flex shrink-0 gap-1">
              <Button
                type="button"
                variant="secondary"
                disabled={previewLoading}
                onClick={() => void handleDownload()}
              >
                Télécharger
              </Button>
              <Button type="button" variant="secondary" onClick={() => void handleDelete()}>
                Supprimer
              </Button>
            </div>
          </div>

          <div className="media-gallery-panel__preview">
            {previewLoading
              ? previewForKind(active.kind, null, active.title)
              : previewForKind(active.kind, previewResult, active.title)}
          </div>
        </div>
      )}
    </aside>
  );
}
