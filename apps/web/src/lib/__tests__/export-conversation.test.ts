import { describe, expect, it } from "vitest";
import {
  conversationExportFilename,
  formatConversationMarkdown,
} from "../export-conversation";

const sampleMessages = [
  { role: "user" as const, content: "Explique le RAG" },
  { role: "assistant" as const, content: "Le RAG enrichit le contexte du modèle." },
];

describe("export-conversation", () => {
  it("formate un fil avec métadonnées et rôles en français", () => {
    const exportedAt = new Date("2026-06-08T14:30:00.000Z");
    const md = formatConversationMarkdown(sampleMessages, {
      title: "Test RAG",
      model: "llama3.2:3b",
      branchLabel: "Fil principal",
      exportedAt,
    });

    expect(md).toContain("# Test RAG");
    expect(md).toContain("> Modèle : llama3.2:3b");
    expect(md).toContain("> Fil : Fil principal");
    expect(md).toContain("## Utilisateur");
    expect(md).toContain("Explique le RAG");
    expect(md).toContain("## Assistant");
    expect(md).toContain("Le RAG enrichit le contexte du modèle.");
  });

  it("dérive le titre depuis le premier message utilisateur", () => {
    const md = formatConversationMarkdown(sampleMessages, {
      exportedAt: new Date("2026-06-08T12:00:00.000Z"),
    });

    expect(md.startsWith("# Explique le RAG")).toBe(true);
  });

  it("ignore les messages vides", () => {
    const md = formatConversationMarkdown(
      [
        { role: "user", content: "   " },
        { role: "assistant", content: "Réponse valide" },
      ],
      { exportedAt: new Date("2026-06-08T12:00:00.000Z") },
    );

    expect(md).not.toContain("## Utilisateur");
    expect(md).toContain("## Assistant");
    expect(md).toContain("Réponse valide");
  });

  it("produit un nom de fichier sûr", () => {
    const name = conversationExportFilename(
      [{ role: "user", content: "Question: fichiers/dossiers?" }],
      { exportedAt: new Date("2026-06-08T12:00:00.000Z") },
    );

    expect(name).toBe("Question--fichiers-dossiers--2026-06-08.md");
  });
});
