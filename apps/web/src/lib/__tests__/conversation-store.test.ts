import { describe, expect, it } from "vitest";
import {
  createEmptyTree,
  forkFromMessage,
  getActiveMessages,
  startNewRootConversation,
  switchBranch,
  updateActiveBranchMessages,
} from "../conversation-store";

const sampleMessages = [
  { role: "user" as const, content: "Bonjour" },
  { role: "assistant" as const, content: "Salut !" },
  { role: "user" as const, content: "Question B" },
  { role: "assistant" as const, content: "Réponse B" },
];

describe("conversation-store", () => {
  it("fork preserves the main thread messages", () => {
    let tree = updateActiveBranchMessages(createEmptyTree(), sampleMessages);
    const mainId = tree.activeBranchId;
    const mainBefore = [...getActiveMessages(tree)];

    tree = forkFromMessage(tree, 1);
    const forkedMessages = getActiveMessages(tree);

    expect(tree.activeBranchId).not.toBe(mainId);
    expect(forkedMessages).toEqual(sampleMessages.slice(0, 2));
    expect(tree.branches[mainId].messages).toEqual(mainBefore);
  });

  it("switching branches does not mutate other branches", () => {
    let tree = updateActiveBranchMessages(createEmptyTree(), sampleMessages);
    const mainId = tree.activeBranchId;

    tree = forkFromMessage(tree, 1);
    const forkId = tree.activeBranchId;

    tree = updateActiveBranchMessages(tree, [
      ...getActiveMessages(tree),
      { role: "user", content: "Autre chemin" },
    ]);

    tree = switchBranch(tree, mainId);
    expect(getActiveMessages(tree)).toEqual(sampleMessages);
    expect(tree.branches[forkId].messages).toHaveLength(3);
  });

  it("startNewRootConversation keeps archived branches", () => {
    let tree = updateActiveBranchMessages(createEmptyTree(), sampleMessages);
    const archivedId = tree.activeBranchId;
    const branchCountBefore = Object.keys(tree.branches).length;

    tree = startNewRootConversation(tree);
    expect(getActiveMessages(tree)).toEqual([]);
    expect(tree.branches[archivedId].messages).toEqual(sampleMessages);
    expect(Object.keys(tree.branches).length).toBe(branchCountBefore + 1);
  });
});
