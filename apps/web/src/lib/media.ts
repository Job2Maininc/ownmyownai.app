import type { CreativeKind, CreativeReadResult, CreativeSummary } from "@ownmyownai/protocol";

export type GalleryFilter = "all" | "documents" | "images" | "audio" | "video";

const MEDIA_KINDS: ReadonlySet<CreativeKind> = new Set(["image", "audio", "video"]);

export function isMediaCreative(item: CreativeSummary): boolean {
  return MEDIA_KINDS.has(item.kind);
}

export function filterMediaCreatives(items: CreativeSummary[]): CreativeSummary[] {
  return items.filter(isMediaCreative);
}

export function mediaKindLabel(kind: CreativeKind): string {
  switch (kind) {
    case "markdown":
      return "Document";
    case "image":
      return "Image";
    case "audio":
      return "Audio";
    case "video":
      return "Vidéo";
    default:
      return "Fichier";
  }
}

export function matchesGalleryFilter(kind: CreativeKind, filter: GalleryFilter): boolean {
  if (filter === "all") return true;
  if (filter === "documents") return kind === "markdown";
  if (filter === "images") return kind === "image";
  if (filter === "audio") return kind === "audio";
  if (filter === "video") return kind === "video";
  return true;
}

export function formatMediaBytes(bytes?: number): string {
  if (bytes == null) return "—";
  if (bytes < 1024) return `${bytes} o`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} Ko`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} Mo`;
}

export function formatMediaDate(iso: string): string {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return iso;
  return d.toLocaleString("fr-FR", {
    day: "2-digit",
    month: "short",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });
}

export function creativeToObjectUrl(result: CreativeReadResult): string {
  const binary = atob(result.dataBase64);
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i += 1) {
    bytes[i] = binary.charCodeAt(i);
  }
  const blob = new Blob([bytes], { type: result.mimeType });
  return URL.createObjectURL(blob);
}

export function downloadCreativeFile(result: CreativeReadResult): void {
  const url = creativeToObjectUrl(result);
  const anchor = document.createElement("a");
  anchor.href = url;
  anchor.download = result.filename;
  anchor.click();
  window.setTimeout(() => URL.revokeObjectURL(url), 0);
}

export function sortCreatives(creatives: CreativeSummary[]): CreativeSummary[] {
  return [...creatives].sort((a, b) => b.savedAt.localeCompare(a.savedAt));
}
