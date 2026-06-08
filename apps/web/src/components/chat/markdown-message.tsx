"use client";

interface MarkdownMessageProps {
  content: string;
}

function escapeHtml(text: string): string {
  return text
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;");
}

function simpleMarkdownToHtml(md: string): string {
  let html = escapeHtml(md);
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

export function MarkdownMessage({ content }: MarkdownMessageProps) {
  return (
    <div
      className="prose-chat text-sm"
      dangerouslySetInnerHTML={{ __html: simpleMarkdownToHtml(content) }}
    />
  );
}
