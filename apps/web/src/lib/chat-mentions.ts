import type { ChatMentionScope, KnowledgeBaseSummary } from "@ownmyownai/protocol";

const MENTION_RE = /@(base|fichier|dossier):([^\s@]+)/gi;

export interface ParsedChatMentions {
  baseNames: string[];
  fileHints: string[];
  folderHints: string[];
}

export function parseChatMentions(text: string): ParsedChatMentions {
  const baseNames: string[] = [];
  const fileHints: string[] = [];
  const folderHints: string[] = [];

  for (const match of text.matchAll(MENTION_RE)) {
    const kind = match[1]?.toLowerCase();
    const value = match[2]?.trim();
    if (!value) continue;
    switch (kind) {
      case "base":
        baseNames.push(value);
        break;
      case "fichier":
        fileHints.push(value);
        break;
      case "dossier":
        folderHints.push(value);
        break;
      default:
        break;
    }
  }

  return { baseNames, fileHints, folderHints };
}

export function stripChatMentions(text: string): string {
  return text.replace(MENTION_RE, "").replace(/\s+/g, " ").trim();
}

export function hasChatMentions(mentions: ParsedChatMentions): boolean {
  return (
    mentions.baseNames.length > 0 ||
    mentions.fileHints.length > 0 ||
    mentions.folderHints.length > 0
  );
}

export function toMentionScope(mentions: ParsedChatMentions): ChatMentionScope | undefined {
  if (!hasChatMentions(mentions)) return undefined;
  return {
    baseNames: mentions.baseNames.length > 0 ? mentions.baseNames : undefined,
    fileHints: mentions.fileHints.length > 0 ? mentions.fileHints : undefined,
    folderHints: mentions.folderHints.length > 0 ? mentions.folderHints : undefined,
  };
}

export function resolveRagContextIds(
  mentions: ParsedChatMentions,
  activeContextIds: string[],
  bases: KnowledgeBaseSummary[],
): string[] {
  if (mentions.baseNames.length === 0) {
    return activeContextIds;
  }

  const ids: string[] = [];
  for (const name of mentions.baseNames) {
    const kb = bases.find((b) => b.name.localeCompare(name, undefined, { sensitivity: "accent" }) === 0);
    if (kb && !ids.includes(kb.id)) {
      ids.push(kb.id);
    }
  }
  return ids;
}

export function formatMentionHint(mentions: ParsedChatMentions): string | null {
  const parts: string[] = [];
  if (mentions.baseNames.length > 0) {
    parts.push(`base : ${mentions.baseNames.join(", ")}`);
  }
  if (mentions.fileHints.length > 0) {
    parts.push(`fichier : ${mentions.fileHints.join(", ")}`);
  }
  if (mentions.folderHints.length > 0) {
    parts.push(`dossier : ${mentions.folderHints.join(", ")}`);
  }
  return parts.length > 0 ? `RAG limité — ${parts.join(" · ")}` : null;
}
