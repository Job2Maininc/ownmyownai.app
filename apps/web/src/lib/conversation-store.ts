import type { RagCitation } from "@ownmyownai/protocol";

export interface UiMessage {
  role: "user" | "assistant";
  content: string;
  citations?: RagCitation[];
}

export interface ConversationBranch {
  id: string;
  parentId: string | null;
  /** Index in the parent branch where this fork starts (inclusive). */
  forkAtIndex: number | null;
  title: string;
  messages: UiMessage[];
  createdAt: string;
  updatedAt: string;
}

export interface ConversationTree {
  version: 1;
  activeBranchId: string;
  rootBranchId: string;
  branches: Record<string, ConversationBranch>;
}

export interface ConversationBranchMeta {
  id: string;
  parentId: string | null;
  forkAtIndex: number | null;
  title: string;
  messageCount: number;
  createdAt: string;
  updatedAt: string;
  depth: number;
  label: string;
}

const TREE_VERSION = 1 as const;
const STORAGE_PREFIX = "chat-tree:";

function storageKey(hostId: string) {
  return `${STORAGE_PREFIX}${hostId}`;
}

function nowIso() {
  return new Date().toISOString();
}

function branchTitle(messages: UiMessage[], fallback = "Conversation") {
  const firstUser = messages.find((m) => m.role === "user");
  return (firstUser?.content ?? fallback).slice(0, 60);
}

function newBranch(
  parentId: string | null,
  forkAtIndex: number | null,
  messages: UiMessage[],
  title?: string,
): ConversationBranch {
  const timestamp = nowIso();
  return {
    id: crypto.randomUUID(),
    parentId,
    forkAtIndex,
    title: title ?? branchTitle(messages),
    messages,
    createdAt: timestamp,
    updatedAt: timestamp,
  };
}

export function createEmptyTree(): ConversationTree {
  const root = newBranch(null, null, [], "Fil principal");
  return {
    version: TREE_VERSION,
    activeBranchId: root.id,
    rootBranchId: root.id,
    branches: { [root.id]: root },
  };
}

export function loadConversationTree(hostId: string): ConversationTree {
  if (typeof window === "undefined") return createEmptyTree();
  try {
    const raw = localStorage.getItem(storageKey(hostId));
    if (!raw) return createEmptyTree();
    const parsed = JSON.parse(raw) as ConversationTree;
    if (parsed.version !== TREE_VERSION || !parsed.branches[parsed.activeBranchId]) {
      return createEmptyTree();
    }
    return parsed;
  } catch {
    return createEmptyTree();
  }
}

export function saveConversationTree(hostId: string, tree: ConversationTree) {
  localStorage.setItem(storageKey(hostId), JSON.stringify(tree));
}

export function getActiveBranch(tree: ConversationTree): ConversationBranch {
  return tree.branches[tree.activeBranchId];
}

export function getActiveMessages(tree: ConversationTree): UiMessage[] {
  return getActiveBranch(tree).messages;
}

function messagesEqual(a: UiMessage[], b: UiMessage[]) {
  return a.length === b.length && a.every((msg, i) => msg.role === b[i]?.role && msg.content === b[i]?.content);
}

export function updateActiveBranchMessages(
  tree: ConversationTree,
  messages: UiMessage[],
): ConversationTree {
  const active = getActiveBranch(tree);
  if (messagesEqual(active.messages, messages)) return tree;

  const updated: ConversationBranch = {
    ...active,
    messages,
    title: active.messages.length === 0 && messages.length > 0 ? branchTitle(messages) : active.title,
    updatedAt: nowIso(),
  };
  return {
    ...tree,
    branches: { ...tree.branches, [active.id]: updated },
  };
}

export function forkFromMessage(tree: ConversationTree, messageIndex: number): ConversationTree {
  const active = getActiveBranch(tree);
  if (messageIndex < 0 || messageIndex >= active.messages.length) return tree;

  const forkMessages = active.messages.slice(0, messageIndex + 1);
  const child = newBranch(active.id, messageIndex, forkMessages);
  const branchCount = Object.values(tree.branches).filter((b) => b.parentId === active.id).length;

  return {
    ...tree,
    activeBranchId: child.id,
    branches: {
      ...tree.branches,
      [child.id]: {
        ...child,
        title: `${active.title || "Branche"} — variante ${branchCount + 1}`,
      },
    },
  };
}

export function switchBranch(tree: ConversationTree, branchId: string): ConversationTree {
  if (!tree.branches[branchId]) return tree;
  return { ...tree, activeBranchId: branchId };
}

export function startNewRootConversation(tree: ConversationTree): ConversationTree {
  const active = getActiveBranch(tree);
  const hasContent = active.messages.length > 0;

  if (!hasContent) {
    return updateActiveBranchMessages(tree, []);
  }

  const freshRoot = newBranch(null, null, [], "Fil principal");
  return {
    version: TREE_VERSION,
    activeBranchId: freshRoot.id,
    rootBranchId: freshRoot.id,
    branches: {
      ...tree.branches,
      [freshRoot.id]: freshRoot,
    },
  };
}

function branchDepth(tree: ConversationTree, branchId: string): number {
  let depth = 0;
  let current = tree.branches[branchId];
  while (current?.parentId) {
    depth += 1;
    current = tree.branches[current.parentId];
  }
  return depth;
}

function branchLabel(tree: ConversationTree, branch: ConversationBranch): string {
  if (branch.id === tree.rootBranchId && branch.parentId === null) {
    return branch.title || "Fil principal";
  }
  const parent = branch.parentId ? tree.branches[branch.parentId] : null;
  const parentLabel = parent ? branchLabel(tree, parent) : "Fil principal";
  return `${parentLabel} › ${branch.title}`;
}

export function listBranchMeta(tree: ConversationTree): ConversationBranchMeta[] {
  return Object.values(tree.branches)
    .map((branch) => ({
      id: branch.id,
      parentId: branch.parentId,
      forkAtIndex: branch.forkAtIndex,
      title: branch.title,
      messageCount: branch.messages.length,
      createdAt: branch.createdAt,
      updatedAt: branch.updatedAt,
      depth: branchDepth(tree, branch.id),
      label: branchLabel(tree, branch),
    }))
    .sort((a, b) => b.updatedAt.localeCompare(a.updatedAt));
}

/** Migrate legacy sessionStorage messages into a tree on first load. */
export function migrateLegacySession(
  hostId: string,
  sessionMessages: UiMessage[],
): ConversationTree {
  const existing = loadConversationTree(hostId);
  const active = getActiveBranch(existing);
  if (active.messages.length > 0 || Object.keys(existing.branches).length > 1) {
    return existing;
  }
  if (sessionMessages.length === 0) return existing;

  const migrated = updateActiveBranchMessages(existing, sessionMessages);
  saveConversationTree(hostId, migrated);
  return migrated;
}
