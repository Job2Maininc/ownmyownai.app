export interface ExportableMessage {
  role: "user" | "assistant";
  content: string;
}

export interface ConversationExportMeta {
  title?: string;
  model?: string;
  branchLabel?: string;
  exportedAt?: Date;
}

const ROLE_HEADINGS: Record<ExportableMessage["role"], string> = {
  user: "Utilisateur",
  assistant: "Assistant",
};

function sanitizeFilename(name: string): string {
  return (
    name
      .trim()
      .replace(/[<>:"/\\|?*\x00-\x1f]/g, "-")
      .replace(/\s+/g, "-")
      .slice(0, 80) || "conversation"
  );
}

function formatExportTimestamp(date: Date): string {
  return date.toLocaleString("fr-FR", {
    dateStyle: "long",
    timeStyle: "short",
  });
}

function deriveTitle(messages: ExportableMessage[], explicit?: string): string {
  if (explicit?.trim()) return explicit.trim().slice(0, 120);
  const firstUser = messages.find((m) => m.role === "user");
  return (firstUser?.content ?? "Conversation").slice(0, 60);
}

/** Formats the active chat thread as a standalone Markdown document (local export only). */
export function formatConversationMarkdown(
  messages: ExportableMessage[],
  meta: ConversationExportMeta = {},
): string {
  const exportedAt = meta.exportedAt ?? new Date();
  const title = deriveTitle(messages, meta.title);
  const lines: string[] = [`# ${title}`, ""];

  const metaLines: string[] = [`> Exporté le ${formatExportTimestamp(exportedAt)}`];
  if (meta.model?.trim()) {
    metaLines.push(`> Modèle : ${meta.model.trim()}`);
  }
  if (meta.branchLabel?.trim()) {
    metaLines.push(`> Fil : ${meta.branchLabel.trim()}`);
  }
  lines.push(...metaLines, "", "---", "");

  for (const message of messages) {
    const content = message.content.trim();
    if (!content) continue;
    lines.push(`## ${ROLE_HEADINGS[message.role]}`, "", content, "");
  }

  return `${lines.join("\n").trimEnd()}\n`;
}

export function conversationExportFilename(
  messages: ExportableMessage[],
  meta: ConversationExportMeta = {},
): string {
  const base = sanitizeFilename(deriveTitle(messages, meta.title));
  const stamp = (meta.exportedAt ?? new Date()).toISOString().slice(0, 10);
  return `${base}-${stamp}.md`;
}

/** Triggers a browser download of the conversation as a .md file (no cloud upload). */
export function downloadConversation(
  messages: ExportableMessage[],
  meta: ConversationExportMeta = {},
): void {
  if (messages.every((m) => !m.content.trim())) return;

  const exportedAt = meta.exportedAt ?? new Date();
  const markdown = formatConversationMarkdown(messages, { ...meta, exportedAt });
  const blob = new Blob([markdown], { type: "text/markdown;charset=utf-8" });
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement("a");
  anchor.href = url;
  anchor.download = conversationExportFilename(messages, { ...meta, exportedAt });
  anchor.click();
  URL.revokeObjectURL(url);
}
