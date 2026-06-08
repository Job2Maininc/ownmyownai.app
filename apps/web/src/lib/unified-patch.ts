export interface ExtractedPatch {
  path?: string;
  patch: string;
}

const DIFF_FENCE_RE = /```(?:diff|patch)\s*\n([\s\S]*?)```/gi;
const PATH_HINT_RE = /^(?:#|\/\/|;;)\s*path:\s*(.+)$/im;

function extractPathFromPatch(patch: string): string | undefined {
  const match = patch.match(/^\+\+\+\s+(?:b\/)?(.+)$/m);
  if (!match?.[1] || match[1] === "/dev/null") return undefined;
  return match[1].trim();
}

export function extractUnifiedPatches(content: string): ExtractedPatch[] {
  const results: ExtractedPatch[] = [];
  let match: RegExpExecArray | null;
  DIFF_FENCE_RE.lastIndex = 0;

  while ((match = DIFF_FENCE_RE.exec(content)) !== null) {
    const raw = match[1]?.trim();
    if (!raw || !raw.includes("@@")) continue;

    const pathHint = raw.match(PATH_HINT_RE)?.[1]?.trim();
    const path = pathHint ?? extractPathFromPatch(raw);
    const patch = raw.replace(PATH_HINT_RE, "").trim();

    results.push({ path, patch });
  }

  return results;
}

export function patchLineClass(line: string): string {
  if (line.startsWith("+++") || line.startsWith("---") || line.startsWith("@@")) {
    return "diff-line diff-line--meta";
  }
  if (line.startsWith("+")) return "diff-line diff-line--add";
  if (line.startsWith("-")) return "diff-line diff-line--remove";
  return "diff-line diff-line--ctx";
}
