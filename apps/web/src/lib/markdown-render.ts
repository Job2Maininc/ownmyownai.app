function escapeHtml(text: string): string {
  return text
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;");
}

function splitTableRow(line: string): string[] {
  return line
    .trim()
    .replace(/^\|/, "")
    .replace(/\|$/, "")
    .split("|")
    .map((cell) => cell.trim());
}

function isTableSeparator(line: string): boolean {
  return /^\|[\s\-:|]+\|$/.test(line.trim());
}

function renderMarkdownTables(md: string): string {
  const lines = md.split("\n");
  const out: string[] = [];
  let i = 0;

  while (i < lines.length) {
    const line = lines[i];
    const next = lines[i + 1];

    if (
      line.trim().startsWith("|") &&
      line.trim().endsWith("|") &&
      next &&
      isTableSeparator(next)
    ) {
      const headerCells = splitTableRow(line);
      i += 2;
      const bodyRows: string[][] = [];
      while (i < lines.length) {
        const row = lines[i];
        if (!row.trim().startsWith("|") || !row.trim().endsWith("|")) break;
        bodyRows.push(splitTableRow(row));
        i += 1;
      }

      const thead = headerCells.map((c) => `<th>${escapeHtml(c)}</th>`).join("");
      const tbody = bodyRows
        .map(
          (row) =>
            `<tr>${row.map((c) => `<td>${escapeHtml(c)}</td>`).join("")}</tr>`,
        )
        .join("");

      out.push(
        `<table class="prose-table"><thead><tr>${thead}</tr></thead><tbody>${tbody}</tbody></table>`,
      );
      continue;
    }

    out.push(line);
    i += 1;
  }

  return out.join("\n");
}

export function renderMarkdownToHtml(md: string): string {
  let html = escapeHtml(renderMarkdownTables(md));
  html = html.replace(
    /```(?:diff|patch)[\s\S]*?```/gi,
    '<p class="diff-placeholder">[Patch — voir ci-dessous]</p>',
  );
  html = html.replace(/```([\s\S]*?)```/g, "<pre><code>$1</code></pre>");
  html = html.replace(/`([^`]+)`/g, "<code>$1</code>");
  html = html.replace(/\*\*([^*]+)\*\*/g, "<strong>$1</strong>");
  html = html.replace(/\*([^*]+)\*/g, "<em>$1</em>");
  html = html.replace(/^### (.+)$/gm, "<h4>$1</h4>");
  html = html.replace(/^## (.+)$/gm, "<h3>$1</h3>");
  html = html.replace(/^# (.+)$/gm, "<h2>$1</h2>");
  html = html.replace(/\n/g, "<br />");
  return html;
}
