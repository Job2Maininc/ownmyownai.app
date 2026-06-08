import { describe, expect, it } from "vitest";
import {
  collectArtifactsFromMessages,
  extractArtifacts,
  hasOpenArtifactFence,
} from "../artifacts";

describe("artifacts", () => {
  it("extrait un bloc artifact avec en-tête", () => {
    const input = `Voici le rapport :

\`\`\`artifact
title: Rapport Q1
---
# Titre
| A | B |
|---|---|
| 1 | 2 |
\`\`\`

Dites-moi si vous voulez des changements.`;

    const { displayContent, artifacts } = extractArtifacts(input, "msg-0");

    expect(artifacts).toHaveLength(1);
    expect(artifacts[0].title).toBe("Rapport Q1");
    expect(artifacts[0].type).toBe("table");
    expect(artifacts[0].content).toContain("# Titre");
    expect(displayContent).toContain("[[ARTIFACT:msg-0-0]]");
    expect(displayContent).not.toContain("```artifact");
  });

  it("extrait un titre court via artifact:Titre", () => {
    const input = `\`\`\`artifact:Notes
- point A
- point B
\`\`\``;

    const { artifacts } = extractArtifacts(input, "msg-1");
    expect(artifacts[0].title).toBe("Notes");
    expect(artifacts[0].type).toBe("markdown");
  });

  it("agrège les artefacts de plusieurs messages assistant", () => {
    const map = collectArtifactsFromMessages([
      { role: "user", content: "hello" },
      {
        role: "assistant",
        content: "```artifact\ntitle: A\n---\ncontenu A\n```",
      },
      {
        role: "assistant",
        content: "```artifact\ntitle: B\n---\ncontenu B\n```",
      },
    ]);

    expect(map.size).toBe(2);
    expect(map.get("msg-1-0")?.title).toBe("A");
    expect(map.get("msg-2-0")?.title).toBe("B");
  });

  it("détecte une clôture manquante pendant le streaming", () => {
    expect(hasOpenArtifactFence("```artifact\ntitle: X\n---\n# en cours")).toBe(true);
    expect(hasOpenArtifactFence("```artifact\ntitle: X\n---\n# ok\n```")).toBe(false);
  });
});
