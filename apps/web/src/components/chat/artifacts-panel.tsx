"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import type { CreativeKind, CreativeReadResult, CreativeSummary } from "@ownmyownai/protocol";
import type { ParsedArtifact } from "@/lib/artifacts";
import { copyArtifactToClipboard, downloadArtifact } from "@/lib/artifacts";
import {
  creativeToObjectUrl,
  downloadCreativeFile,
  formatMediaBytes,
  formatMediaDate,
  matchesGalleryFilter,
  mediaKindLabel,
  sortCreatives,
  type GalleryFilter,
} from "@/lib/media";
import { renderMarkdownToHtml } from "@/lib/markdown-render";
import type { RelayClient } from "@/lib/relay-client";
import { formatApiError, type UserError } from "@/lib/user-errors";
import { Button } from "@/components/ui/button";
import { ErrorAlert } from "@/components/ui/error-alert";

interface ArtifactsPanelProps {
  artifacts: ParsedArtifact[];
  activeId: string | null;
  onSelect: (id: string | null) => void;
  relay: RelayClient | null;
  connected: boolean;
}

type GalleryEntry =
  | { source: "session"; id: string; title: string; kind: CreativeKind; artifact: ParsedArtifact }
  | { source: "host"; id: string; title: string; kind: CreativeKind; creative: CreativeSummary };

const FILTERS: { id: GalleryFilter; label: string }[] = [
  { id: "all", label: "Tous" },
  { id: "documents", label: "Documents" },
  { id: "images", label: "Images" },
  { id: "audio", label: "Audio" },
  { id: "video", label: "Vidéo" },
];

function entryKey(entry: GalleryEntry): string {
  return `${entry.source}:${entry.id}`;
}

function artifactTypeLabel(type: ParsedArtifact["type"]): string {
  return type === "table" ? "Tableau" : "Markdown";
}

export function ArtifactsPanel({
  artifacts,
  activeId,
  onSelect,
  relay,
  connected,
}: ArtifactsPanelProps) {
  const [copyNotice, setCopyNotice] = useState<string | null>(null);
  const [filter, setFilter] = useState<GalleryFilter>("all");
  const [hostCreatives, setHostCreatives] = useState<CreativeSummary[]>([]);
  const [loadingHost, setLoadingHost] = useState(false);
  const [loadingPreview, setLoadingPreview] = useState(false);
  const [hostPreview, setHostPreview] = useState<CreativeReadResult | null>(null);
  const [previewUrl, setPreviewUrl] = useState<string | null>(null);
  const [error, setError] = useState<UserError | null>(null);
  const [deleting, setDeleting] = useState(false);
  const previewUrlRef = useRef<string | null>(null);

  const revokePreviewUrl = useCallback(() => {
    if (previewUrlRef.current) {
      URL.revokeObjectURL(previewUrlRef.current);
      previewUrlRef.current = null;
    }
    setPreviewUrl(null);
  }, []);

  const refreshHost = useCallback(async () => {
    if (!relay || !connected) {
      setHostCreatives([]);
      return;
    }
    setLoadingHost(true);
    setError(null);
    try {
      const creatives = await relay.listCreatives();
      setHostCreatives(sortCreatives(creatives));
    } catch (e) {
      setError(formatApiError(e));
    } finally {
      setLoadingHost(false);
    }
  }, [relay, connected]);

  useEffect(() => {
    void refreshHost();
  }, [refreshHost]);

  const entries = useMemo<GalleryEntry[]>(() => {
    const sessionEntries: GalleryEntry[] = artifacts.map((artifact) => ({
      source: "session",
      id: artifact.id,
      title: artifact.title,
      kind: "markdown",
      artifact,
    }));
    const hostEntries: GalleryEntry[] = hostCreatives.map((creative) => ({
      source: "host",
      id: creative.id,
      title: creative.title,
      kind: creative.kind,
      creative,
    }));
    return [...sessionEntries, ...hostEntries].filter((entry) =>
      matchesGalleryFilter(entry.kind, filter),
    );
  }, [artifacts, hostCreatives, filter]);

  const activeEntry = useMemo(() => {
    if (activeId) {
      const found = entries.find((entry) => entryKey(entry) === activeId);
      if (found) return found;
    }
    return entries.length === 1 ? entries[0] : null;
  }, [activeId, entries]);

  useEffect(() => {
    if (!activeEntry || activeEntry.source !== "host" || !relay || !connected) {
      revokePreviewUrl();
      setHostPreview(null);
      return;
    }

    let cancelled = false;
    setLoadingPreview(true);
    setError(null);

    void (async () => {
      try {
        const result = await relay.readCreative(activeEntry.id);
        if (cancelled) return;
        revokePreviewUrl();
        const url =
          activeEntry.kind === "markdown" ? null : creativeToObjectUrl(result);
        if (url) previewUrlRef.current = url;
        setPreviewUrl(url);
        setHostPreview(result);
      } catch (e) {
        if (!cancelled) setError(formatApiError(e));
      } finally {
        if (!cancelled) setLoadingPreview(false);
      }
    })();

    return () => {
      cancelled = true;
      revokePreviewUrl();
    };
  }, [activeEntry, relay, connected, revokePreviewUrl]);

  useEffect(
    () => () => {
      revokePreviewUrl();
    },
    [revokePreviewUrl],
  );

  async function handleCopySession(artifact: ParsedArtifact) {
    try {
      await copyArtifactToClipboard(artifact);
      setCopyNotice("Contenu copié dans le presse-papiers.");
      window.setTimeout(() => setCopyNotice(null), 2500);
    } catch {
      setCopyNotice("Impossible de copier — vérifiez les permissions du navigateur.");
    }
  }

  async function handleCopyHost() {
    if (!hostPreview?.textContent) return;
    try {
      await navigator.clipboard.writeText(hostPreview.textContent);
      setCopyNotice("Contenu copié dans le presse-papiers.");
      window.setTimeout(() => setCopyNotice(null), 2500);
    } catch {
      setCopyNotice("Impossible de copier — vérifiez les permissions du navigateur.");
    }
  }

  async function handleDeleteHost(creative: CreativeSummary) {
    if (!relay || !connected) return;
    if (!window.confirm(`Supprimer « ${creative.title} » du dossier créations ?`)) return;
    setDeleting(true);
    setError(null);
    try {
      await relay.deleteCreative(creative.id);
      if (activeId === `host:${creative.id}`) onSelect(null);
      await refreshHost();
    } catch (e) {
      setError(formatApiError(e));
    } finally {
      setDeleting(false);
    }
  }

  const totalCount = artifacts.length + hostCreatives.length;

  if (totalCount === 0 && !loadingHost) {
    return (
      <aside className="artifacts-panel" aria-label="Galerie artefacts et médias">
        <h2 className="artifacts-panel__title">Galerie</h2>
        <p className="text-xs text-[var(--muted)]">
          Documents markdown, images, audio et vidéo générés par l&apos;assistant. Stockage local
          sur votre PC — rien n&apos;est envoyé au cloud.
        </p>
        <p className="mt-3 text-sm text-[var(--muted)]">
          Demandez un rapport, une image ou une piste audio : les livrables apparaissent ici pour
          aperçu, copie ou téléchargement.
        </p>
        {!connected && (
          <p className="mt-3 text-sm text-[var(--muted)]">
            Connectez-vous au Host pour afficher les créations enregistrées sur votre PC.
          </p>
        )}
      </aside>
    );
  }

  return (
    <aside className="artifacts-panel" aria-label="Galerie artefacts et médias">
      <div className="flex items-start justify-between gap-2">
        <div>
          <h2 className="artifacts-panel__title">Galerie</h2>
          <p className="text-xs text-[var(--muted)]">
            Session ({artifacts.length}) · Host ({hostCreatives.length}) — export local uniquement.
          </p>
        </div>
        <Button
          type="button"
          variant="ghost"
          disabled={loadingHost || !connected}
          onClick={() => void refreshHost()}
        >
          {loadingHost ? "…" : "Actualiser"}
        </Button>
      </div>

      <div className="artifacts-panel__filters" role="tablist" aria-label="Filtrer la galerie">
        {FILTERS.map((item) => (
          <button
            key={item.id}
            type="button"
            role="tab"
            aria-selected={filter === item.id}
            className={filter === item.id ? "is-active" : undefined}
            onClick={() => setFilter(item.id)}
          >
            {item.label}
          </button>
        ))}
      </div>

      {entries.length > 1 && (
        <ul className="mt-3 space-y-1">
          {entries.map((entry) => (
            <li key={entryKey(entry)}>
              <button
                type="button"
                className={`w-full rounded border px-2 py-1.5 text-left text-sm ${
                  activeEntry && entryKey(activeEntry) === entryKey(entry)
                    ? "border-neutral-400 bg-neutral-100"
                    : "border-[var(--border)] bg-neutral-50 hover:border-neutral-300"
                }`}
                onClick={() => onSelect(entryKey(entry))}
              >
                <span className="font-medium">{entry.title}</span>
                <span className="ml-2 text-xs text-[var(--muted)]">
                  {entry.source === "session" ? "Session" : "Host"} ·{" "}
                  {entry.source === "session"
                    ? artifactTypeLabel(entry.artifact.type)
                    : mediaKindLabel(entry.kind)}
                </span>
              </button>
            </li>
          ))}
        </ul>
      )}

      {activeEntry?.source === "session" && (
        <div className="mt-3 flex min-h-0 flex-1 flex-col">
          <div className="mb-2 flex items-start justify-between gap-2">
            <div>
              <p className="text-sm font-medium">{activeEntry.artifact.title}</p>
              <p className="text-xs text-[var(--muted)]">
                Session · {artifactTypeLabel(activeEntry.artifact.type)}
              </p>
            </div>
            <div className="flex shrink-0 gap-1">
              <Button
                type="button"
                variant="secondary"
                onClick={() => void handleCopySession(activeEntry.artifact)}
              >
                Copier
              </Button>
              <Button
                type="button"
                variant="secondary"
                onClick={() => downloadArtifact(activeEntry.artifact)}
              >
                Télécharger
              </Button>
            </div>
          </div>

          {copyNotice && <p className="mb-2 text-xs text-[var(--link)]">{copyNotice}</p>}

          <div
            className="artifacts-panel__preview prose-chat text-sm"
            dangerouslySetInnerHTML={{
              __html: renderMarkdownToHtml(activeEntry.artifact.content),
            }}
          />
        </div>
      )}

      {activeEntry?.source === "host" && (
        <div className="mt-3 flex min-h-0 flex-1 flex-col">
          <div className="mb-2 flex items-start justify-between gap-2">
            <div>
              <p className="text-sm font-medium">{activeEntry.creative.title}</p>
              <p className="text-xs text-[var(--muted)]">
                Host · {mediaKindLabel(activeEntry.kind)}
                {activeEntry.creative.bytes != null
                  ? ` · ${formatMediaBytes(activeEntry.creative.bytes)}`
                  : ""}
                {activeEntry.creative.savedAt
                  ? ` · ${formatMediaDate(activeEntry.creative.savedAt)}`
                  : ""}
              </p>
            </div>
            <div className="flex shrink-0 gap-1">
              {activeEntry.kind === "markdown" && hostPreview?.textContent && (
                <Button type="button" variant="secondary" onClick={() => void handleCopyHost()}>
                  Copier
                </Button>
              )}
              {hostPreview && (
                <Button
                  type="button"
                  variant="secondary"
                  disabled={loadingPreview}
                  onClick={() => downloadCreativeFile(hostPreview)}
                >
                  Télécharger
                </Button>
              )}
              <Button
                type="button"
                variant="ghost"
                disabled={deleting || !connected}
                onClick={() => void handleDeleteHost(activeEntry.creative)}
              >
                Supprimer
              </Button>
            </div>
          </div>

          {copyNotice && <p className="mb-2 text-xs text-[var(--link)]">{copyNotice}</p>}
          {loadingPreview && (
            <p className="text-sm text-[var(--muted)]">Chargement de l&apos;aperçu…</p>
          )}

          {!loadingPreview && hostPreview && activeEntry.kind === "markdown" && (
            <div
              className="artifacts-panel__preview prose-chat text-sm"
              dangerouslySetInnerHTML={{
                __html: renderMarkdownToHtml(hostPreview.textContent ?? ""),
              }}
            />
          )}

          {!loadingPreview && hostPreview && activeEntry.kind === "image" && previewUrl && (
            <div className="artifacts-panel__preview artifacts-panel__media">
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img
                src={previewUrl}
                alt={activeEntry.creative.title}
                className="artifacts-panel__image"
              />
            </div>
          )}

          {!loadingPreview && hostPreview && activeEntry.kind === "audio" && previewUrl && (
            <div className="artifacts-panel__preview artifacts-panel__media">
              <audio controls className="w-full" src={previewUrl}>
                Votre navigateur ne prend pas en charge la lecture audio.
              </audio>
            </div>
          )}

          {!loadingPreview && hostPreview && activeEntry.kind === "video" && previewUrl && (
            <div className="artifacts-panel__preview artifacts-panel__media">
              <video controls className="artifacts-panel__video" src={previewUrl}>
                Votre navigateur ne prend pas en charge la lecture vidéo.
              </video>
            </div>
          )}

          {!loadingPreview && hostPreview && activeEntry.kind === "other" && (
            <p className="text-sm text-[var(--muted)]">
              Aperçu indisponible pour ce type de fichier. Utilisez Télécharger.
            </p>
          )}
        </div>
      )}

      {error && (
        <div className="mt-3">
          <ErrorAlert {...error} />
        </div>
      )}
    </aside>
  );
}
