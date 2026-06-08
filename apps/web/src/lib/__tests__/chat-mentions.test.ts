import { describe, expect, it } from "vitest";
import {
  formatMentionHint,
  parseChatMentions,
  resolveRagContextIds,
  stripChatMentions,
  toMentionScope,
} from "../chat-mentions";

describe("chat-mentions", () => {
  it("parse @base:Notes", () => {
    const mentions = parseChatMentions("@base:Notes Résume les dernières entrées");
    expect(mentions.baseNames).toEqual(["Notes"]);
    expect(stripChatMentions("@base:Notes Résume les dernières entrées")).toBe(
      "Résume les dernières entrées",
    );
  });

  it("limite le RAG à la base mentionnée", () => {
    const mentions = parseChatMentions("@base:Notes question");
    const ids = resolveRagContextIds(mentions, ["kb-other", "kb-notes"], [
      { id: "kb-notes", name: "Notes", docCount: 1, status: "ready" },
      { id: "kb-other", name: "Autre", docCount: 0, status: "ready" },
    ]);
    expect(ids).toEqual(["kb-notes"]);
  });

  it("conserve les bases actives sans @base", () => {
    const mentions = parseChatMentions("question simple");
    const ids = resolveRagContextIds(mentions, ["kb-a"], [
      { id: "kb-a", name: "A", docCount: 1, status: "ready" },
    ]);
    expect(ids).toEqual(["kb-a"]);
  });

  it("exporte mentionScope pour le protocole", () => {
    const scope = toMentionScope(parseChatMentions("@fichier:README.md dans @dossier:docs"));
    expect(scope).toEqual({
      fileHints: ["README.md"],
      folderHints: ["docs"],
    });
  });

  it("affiche un hint utilisateur", () => {
    const hint = formatMentionHint(parseChatMentions("@base:Notes test"));
    expect(hint).toContain("Notes");
  });
});
