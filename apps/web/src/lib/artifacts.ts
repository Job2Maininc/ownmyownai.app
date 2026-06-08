export type ArtifactType = "markdown" | "table";

export interface ParsedArtifact {
  id: string;
  title: string;
  type: ArtifactType;
  content: string;
}

const ARTIFACT_FENCE_RE = /```artifact(?::([^\n]+))?\n([\s\S]*?)```/g;

function sanitizeFilename(name: string): string {
  return name
    .trim()
    .replace(/[<>:"/\\|?*\x00-\x1f]/g, "-")
    .replace(/\s+/g, "-")
    .slice(0, 80) || "artefact";
}

function inferArtifactType(content: string): ArtifactType {
  if (/^\|.+\|\s*\n\|[-:\s|]+\|/m.test(content.trim())) {
    return "table";
  }
  return "markdown";
}

function parseArtifactBody(raw: string): {
  title?: string;
  type?: ArtifactType;
  content: string;
} {
  const separator = raw.indexOf("\n---\n");
  if (separator === -1) {
    return { content: raw.trim() };
  }

  const header = raw.slice(0, separator);
  const content = raw.slice(separator + 5).trim();
  let title: string | undefined;
  let type: ArtifactType | undefined;

  for (const line of header.split("\n")) {
    const titleMatch = line.match(/^title:\s*(.+)$/i);
    if (titleMatch) title = titleMatch[1].trim();

    const typeMatch = line.match(/^type:\s*(markdown|table)$/i);
    if (typeMatch) type = typeMatch[1].toLowerCase() as ArtifactType;
  }

  return { title, type, content };
}

export function extractArtifacts(
  content: string,
  messageKey: string,
): { displayContent: string; artifacts: ParsedArtifact[] } {
  const artifacts: ParsedArtifact[] = [];
  let index = 0;

  const displayContent = content.replace(ARTIFACT_FENCE_RE, (_match, titleFromColon, body) => {
    const parsed = parseArtifactBody(String(body).trim());
    const title =
      (typeof titleFromColon === "string" && titleFromColon.trim()) ||
      parsed.title ||
      `Artefact ${index + 1}`;
    const artifactContent = parsed.content;
    const type = parsed.type ?? inferArtifactType(artifactContent);
    const id = `${messageKey}-${index}`;

    artifacts.push({ id, title, type, content: artifactContent });
    index += 1;
    return `[[ARTIFACT:${id}]]`;
  });

  return { displayContent, artifacts };
}

export function hasOpenArtifactFence(content: string): boolean {
  const openIndex = content.lastIndexOf("```artifact");
  if (openIndex === -1) return false;
  const afterOpen = content.slice(openIndex + 3);
  const closeIndex = afterOpen.indexOf("```");
  return closeIndex === -1;
}

export function downloadArtifact(artifact: ParsedArtifact): void {
  const blob = new Blob([artifact.content], { type: "text/markdown;charset=utf-8" });
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement("a");
  anchor.href = url;
  anchor.download = `${sanitizeFilename(artifact.title)}.md`;
  anchor.click();
  URL.revokeObjectURL(url);
}

export async function copyArtifactToClipboard(artifact: ParsedArtifact): Promise<void> {
  await navigator.clipboard.writeText(artifact.content);
}

export function collectArtifactsFromMessages(
  messages: Array<{ role: string; content: string }>,
): Map<string, ParsedArtifact> {
  const map = new Map<string, ParsedArtifact>();

  messages.forEach((message, messageIndex) => {
    if (message.role !== "assistant") return;
    const { artifacts } = extractArtifacts(message.content, `msg-${messageIndex}`);
    for (const artifact of artifacts) {
      map.set(artifact.id, artifact);
    }
  });

  return map;
}
