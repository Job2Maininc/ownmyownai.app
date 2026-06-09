"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import type {
  ChatMessage,
  ChatThreadSummary,
  HostStatus,
  KnowledgeBaseSummary,
  PlaybookSummary,
  RagCitation,
} from "@ownmyownai/protocol";
import type { Host } from "@ownmyownai/supabase-types";
import { useRegisterPaletteCommands } from "@/components/command-palette/command-palette-provider";
import { mintRelayToken } from "@/lib/api";
import { collectArtifactsFromMessages, type ParsedArtifact } from "@/lib/artifacts";
import {
  formatMentionHint,
  parseChatMentions,
  resolveRagContextIds,
  stripChatMentions,
  toMentionScope,
} from "@/lib/chat-mentions";
import {
  forkFromMessage,
  getActiveMessages,
  listBranchMeta,
  loadConversationTree,
  migrateLegacySession,
  saveConversationTree,
  startNewRootConversation,
  switchBranch,
  updateActiveBranchMessages,
  type ConversationBranchMeta,
  type ConversationTree,
} from "@/lib/conversation-store";
import { downloadConversation } from "@/lib/export-conversation";
import { hostStatusClassName, hostStatusLabel, resolveChatHostStatus } from "@/lib/host-status";
import { formatShortcutLabel } from "@/lib/keyboard-shortcuts";
import { RelayClient } from "@/lib/relay-client";
import { TabSessionManager, type TabSessionRole } from "@/lib/tab-session";
import { createClient } from "@/lib/supabase/client";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { ArtifactsPanel } from "./artifacts-panel";
import { ContextPanel, loadActiveContextIds } from "./context-panel";
import { ChatConnectingSkeleton } from "./chat-skeleton";
import { MarkdownMessage } from "./markdown-message";
import { PlaybookPicker } from "./playbook-picker";
import { RagCitationBadges } from "./rag-citation-badges";
import { ShareDialog } from "./share-dialog";
import { toShareMessages } from "@/lib/share";

type SidebarTab = "context" | "artifacts";

interface UiMessage {
  role: "user" | "assistant";
  content: string;
  thinking?: string;
  citations?: RagCitation[];
}

interface ChatViewProps {
  hostId: string;
  defaultModel: string;
  installedModels?: string[];
}

const SEND_SHORTCUT_LABEL = formatShortcutLabel({ key: "Enter", mod: true });

function contextKey(hostId: string) {
  return `context-active:${hostId}`;
}

function projectKey(hostId: string) {
  return `project-active:${hostId}`;
}

function thinkingModeKey(hostId: string) {
  return `thinking-mode:${hostId}`;
}

function loadThinkingMode(hostId: string): boolean {
  if (typeof window === "undefined") return false;
  try {
    return localStorage.getItem(thinkingModeKey(hostId)) === "1";
  } catch {
    return false;
  }
}

function legacySessionKey(hostId: string) {
  return `chat:${hostId}`;
}

function activeThreadKey(hostId: string) {
  return `chat-active-thread:${hostId}`;
}

function loadLegacySessionMessages(hostId: string): UiMessage[] {
  if (typeof window === "undefined") return [];
  try {
    const raw = sessionStorage.getItem(legacySessionKey(hostId));
    if (!raw) return [];
    const parsed = JSON.parse(raw) as UiMessage[];
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}

function toUiMessages(messages: ChatMessage[]): UiMessage[] {
  return messages
    .filter(
      (m): m is ChatMessage & { role: "user" | "assistant" } =>
        m.role === "user" || m.role === "assistant",
    )
    .map((m) => ({ role: m.role, content: m.content }));
}

function branchLabelFromSummary(thread: ChatThreadSummary): string {
  if (!thread.parentThreadId) return thread.title || "Fil principal";
  return `${thread.title} (fork msg ${(thread.forkAtIndex ?? 0) + 1})`;
}

export function ChatView({ hostId, defaultModel, installedModels = [] }: ChatViewProps) {
  const router = useRouter();
  const [messages, setMessages] = useState<UiMessage[]>([]);
  const [input, setInput] = useState("");
  const [model, setModel] = useState(defaultModel);
  const [modelSearch, setModelSearch] = useState("");
  const [thinkingMode, setThinkingMode] = useState(false);
  const [streaming, setStreaming] = useState(false);
  const [hostStatus, setHostStatus] = useState<HostStatus>("offline");
  const [error, setError] = useState<string | null>(null);
  const [relayStatus, setRelayStatus] = useState<"connecting" | "connected" | "offline" | "error">(
    "connecting",
  );
  const [activeContextIds, setActiveContextIds] = useState<string[]>([]);
  const [activeProjectId, setActiveProjectId] = useState<string | null>(null);
  const [contextBases, setContextBases] = useState<KnowledgeBaseSummary[]>([]);
  const [showSidebar, setShowSidebar] = useState(true);
  const [sidebarTab, setSidebarTab] = useState<SidebarTab>("context");
  const [activeArtifactId, setActiveArtifactId] = useState<string | null>(null);
  const [conversationTree, setConversationTree] = useState<ConversationTree | null>(null);
  const [branchMeta, setBranchMeta] = useState<ConversationBranchMeta[]>([]);
  const [activeThreadId, setActiveThreadId] = useState<string | null>(null);
  const [rootThreadId, setRootThreadId] = useState<string | null>(null);
  const [hostBranches, setHostBranches] = useState<ChatThreadSummary[]>([]);
  const [conversationNotice, setConversationNotice] = useState<string | null>(null);
  const [cloudHost, setCloudHost] = useState<Pick<Host, "status" | "last_seen_at"> | null>(null);
  const [statusClock, setStatusClock] = useState(0);
  const [tabRole, setTabRole] = useState<TabSessionRole>("active");
  const [showShareDialog, setShowShareDialog] = useState(false);
  const relayRef = useRef<RelayClient | null>(null);
  const tabSessionRef = useRef<TabSessionManager | null>(null);
  const hasConnectedRef = useRef(false);
  const assistantBuffer = useRef("");
  const thinkingBuffer = useRef("");
  const assistantMessageIndex = useRef<number | null>(null);
  const pendingUserMessage = useRef<UiMessage | null>(null);
  const pendingCitations = useRef<RagCitation[] | undefined>(undefined);
  const activeRequestId = useRef<string | null>(null);
  const hydrated = useRef(false);
  const saveTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const messagesEndRef = useRef<HTMLDivElement>(null);

  const models = installedModels.length > 0 ? installedModels : [defaultModel];
  const filteredModels = models.filter((m) =>
    m.toLowerCase().includes(modelSearch.toLowerCase()),
  );

  const inputMentionHint = useMemo(
    () => formatMentionHint(parseChatMentions(input)),
    [input],
  );

  const artifacts = useMemo(() => {
    const map = collectArtifactsFromMessages(messages);
    return Array.from(map.values());
  }, [messages]);

  const openArtifact = useCallback((artifact: ParsedArtifact) => {
    setActiveArtifactId(artifact.id);
    setSidebarTab("artifacts");
    setShowSidebar(true);
  }, []);

  const commitAssistantTurn = useCallback(
    (prev: UiMessage[], content: string, thinking?: string): UiMessage[] => {
      if (!content.trim() && !thinking?.trim()) return prev;

      const next = [...prev];
      const pending = pendingUserMessage.current;

      if (pending) {
        const last = next[next.length - 1];
        if (last?.role !== "user" || last.content !== pending.content) {
          next.push(pending);
        }
        pendingUserMessage.current = null;
      }

      const idx = assistantMessageIndex.current;
      if (idx === null) return next;

      const existing = next[idx];
      const assistantMsg: UiMessage = {
        role: "assistant",
        content,
        thinking: thinking ?? existing?.thinking,
        citations: pendingCitations.current ?? existing?.citations,
      };

      if (next.length <= idx) {
        next.push(assistantMsg);
      } else {
        next[idx] = assistantMsg;
      }

      return next;
    },
    [],
  );

  const clearAssistantTurn = useCallback(() => {
    assistantMessageIndex.current = null;
    pendingUserMessage.current = null;
    pendingCitations.current = undefined;
    assistantBuffer.current = "";
    thinkingBuffer.current = "";
  }, []);

  const attachCitations = useCallback((citations: RagCitation[]) => {
    pendingCitations.current = citations;
    const idx = assistantMessageIndex.current;
    if (idx === null) return;
    setMessages((prev) => {
      if (idx >= prev.length) return prev;
      const next = [...prev];
      const current = next[idx];
      if (current?.role !== "assistant") return prev;
      next[idx] = { ...current, citations };
      return next;
    });
  }, []);

  useEffect(() => {
    setModel(defaultModel);
  }, [defaultModel]);

  const applyTree = useCallback(
    (tree: ConversationTree) => {
      setConversationTree(tree);
      setMessages(getActiveMessages(tree));
      setBranchMeta(listBranchMeta(tree));
      saveConversationTree(hostId, tree);
    },
    [hostId],
  );

  useEffect(() => {
    if (hydrated.current) return;
    hydrated.current = true;
    const legacyMessages = loadLegacySessionMessages(hostId);
    const tree = migrateLegacySession(hostId, legacyMessages);
    applyTree(tree);
    setActiveContextIds(loadActiveContextIds(hostId));
    setThinkingMode(loadThinkingMode(hostId));
    try {
      const raw = sessionStorage.getItem(projectKey(hostId));
      setActiveProjectId(raw ? (JSON.parse(raw) as string) : null);
    } catch {
      setActiveProjectId(null);
    }
    if (legacyMessages.length > 0) {
      sessionStorage.removeItem(legacySessionKey(hostId));
    }
  }, [hostId, applyTree]);

  useEffect(() => {
    if (!hydrated.current || !conversationTree) return;
    const nextTree = updateActiveBranchMessages(conversationTree, messages);
    if (nextTree === conversationTree) return;
    setConversationTree(nextTree);
    setBranchMeta(listBranchMeta(nextTree));
    saveConversationTree(hostId, nextTree);
  }, [hostId, messages, conversationTree]);

  useEffect(() => {
    sessionStorage.setItem(contextKey(hostId), JSON.stringify(activeContextIds));
  }, [hostId, activeContextIds]);

  useEffect(() => {
    localStorage.setItem(thinkingModeKey(hostId), thinkingMode ? "1" : "0");
  }, [hostId, thinkingMode]);

  useEffect(() => {
    if (activeProjectId) {
      sessionStorage.setItem(projectKey(hostId), JSON.stringify(activeProjectId));
    } else {
      sessionStorage.removeItem(projectKey(hostId));
    }
  }, [hostId, activeProjectId]);

  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages, streaming]);

  useEffect(() => {
    const supabase = createClient();

    async function loadCloudHost() {
      const { data } = await supabase
        .from("hosts")
        .select("status, last_seen_at")
        .eq("id", hostId)
        .single();
      if (data) {
        setCloudHost(data as Pick<Host, "status" | "last_seen_at">);
      }
    }

    void loadCloudHost();
    const poll = window.setInterval(() => {
      void loadCloudHost();
    }, 30_000);

    const channel = supabase
      .channel(`chat-host-${hostId}`)
      .on(
        "postgres_changes",
        { event: "UPDATE", schema: "public", table: "hosts", filter: `id=eq.${hostId}` },
        (payload) => {
          setCloudHost(payload.new as Pick<Host, "status" | "last_seen_at">);
        },
      )
      .subscribe();

    return () => {
      window.clearInterval(poll);
      void supabase.removeChannel(channel);
    };
  }, [hostId]);

  useEffect(() => {
    const id = window.setInterval(() => setStatusClock((tick) => tick + 1), 10_000);
    return () => window.clearInterval(id);
  }, []);

  const isActiveTab = tabRole === "active";

  useEffect(() => {
    const manager = new TabSessionManager(hostId, {
      onRoleChange: (role) => {
        setTabRole(role);
        if (role === "passive") {
          setRelayStatus("offline");
          hasConnectedRef.current = false;
        }
      },
      onSnapshot: (snapshot) => {
        setMessages(snapshot.messages);
        setStreaming(snapshot.streaming);
        setModel(snapshot.model);
        setActiveContextIds(snapshot.activeContextIds);
      },
    });
    tabSessionRef.current = manager;
    manager.start();
    return () => {
      manager.dispose();
      tabSessionRef.current = null;
    };
  }, [hostId]);

  useEffect(() => {
    if (!isActiveTab) return;
    tabSessionRef.current?.broadcast({
      messages,
      streaming,
      model,
      activeContextIds,
    });
  }, [isActiveTab, messages, streaming, model, activeContextIds]);

  useEffect(() => {
    if (!isActiveTab) {
      relayRef.current?.disconnect();
      relayRef.current = null;
      return;
    }

    hasConnectedRef.current = false;
    const client = new RelayClient({
      mintToken: () => mintRelayToken(hostId),
      onStatus: (status) => {
        if (status === "connected") hasConnectedRef.current = true;
        setRelayStatus(status);
        if (status === "error") {
          setError(
            "Connexion au relay impossible. Vérifiez que l'app Host est ouverte sur ce PC.",
          );
        }
      },
      onHostStatus: (status) => setHostStatus(status),
      onCitations: attachCitations,
      onThinkingDelta: (thinking) => {
        thinkingBuffer.current += thinking;
        setMessages((prev) =>
          commitAssistantTurn(prev, assistantBuffer.current, thinkingBuffer.current),
        );
      },
      onDelta: (content) => {
        assistantBuffer.current += content;
        setMessages((prev) =>
          commitAssistantTurn(prev, assistantBuffer.current, thinkingBuffer.current),
        );
      },
      onDone: () => {
        const content = assistantBuffer.current;
        const thinking = thinkingBuffer.current;
        if ((content.trim() || thinking.trim()) && assistantMessageIndex.current !== null) {
          setMessages((prev) => commitAssistantTurn(prev, content, thinking));
        }
        setStreaming(false);
        activeRequestId.current = null;
        clearAssistantTurn();
      },
      onError: (msg) => {
        setError(msg);
        setStreaming(false);
        activeRequestId.current = null;
        const content = assistantBuffer.current;
        if (content.trim() || thinkingBuffer.current.trim()) {
          setMessages((prev) =>
            commitAssistantTurn(prev, content, thinkingBuffer.current),
          );
        }
        clearAssistantTurn();
      },
    });
    relayRef.current = client;
    void client.connect();

    return () => {
      client.disconnect();
      relayRef.current = null;
    };
  }, [hostId, attachCitations, clearAssistantTurn, commitAssistantTurn, isActiveTab]);

  const connected = relayStatus === "connected";

  const refreshHostBranches = useCallback(
    async (rootId: string) => {
      if (!relayRef.current || !connected) return;
      try {
        const branches = await relayRef.current.listChatThreadBranches(rootId);
        setHostBranches(branches);
      } catch {
        /* ignore */
      }
    },
    [connected],
  );

  useEffect(() => {
    if (!connected || !isActiveTab || !relayRef.current) return;

    let cancelled = false;

    async function initHostThread() {
      const client = relayRef.current;
      if (!client) return;

      const stored = localStorage.getItem(activeThreadKey(hostId));
      if (stored) {
        try {
          const { thread, messages: hostMessages } = await client.getChatThread(stored);
          if (cancelled) return;
          setActiveThreadId(thread.id);
          setRootThreadId(thread.rootThreadId);
          setMessages(toUiMessages(hostMessages));
          await refreshHostBranches(thread.rootThreadId);
          return;
        } catch {
          /* fallback local */
        }
      }
    }

    void initHostThread();
    return () => {
      cancelled = true;
    };
  }, [connected, isActiveTab, hostId, refreshHostBranches]);

  useEffect(() => {
    if (!connected || !isActiveTab || !relayRef.current || messages.length === 0 || activeThreadId) {
      return;
    }
    void relayRef.current
      .saveChatThread(
        messages.map((m) => ({ role: m.role, content: m.content })),
        { model, contextIds: activeContextIds },
      )
      .then(async (id) => {
        const { thread } = await relayRef.current!.getChatThread(id);
        setActiveThreadId(id);
        setRootThreadId(thread.rootThreadId);
        localStorage.setItem(activeThreadKey(hostId), id);
        await refreshHostBranches(thread.rootThreadId);
      })
      .catch(() => undefined);
  }, [
    messages,
    activeThreadId,
    model,
    activeContextIds,
    connected,
    isActiveTab,
    hostId,
    refreshHostBranches,
  ]);

  useEffect(() => {
    if (!connected || !isActiveTab || !activeThreadId || !relayRef.current || messages.length === 0) {
      return;
    }
    if (saveTimerRef.current) clearTimeout(saveTimerRef.current);
    saveTimerRef.current = setTimeout(() => {
      void relayRef.current
        ?.saveChatThread(
          messages.map((m) => ({ role: m.role, content: m.content })),
          {
            threadId: activeThreadId,
            model,
            contextIds: activeContextIds,
          },
        )
        .then(() => {
          if (rootThreadId) void refreshHostBranches(rootThreadId);
        })
        .catch(() => undefined);
    }, 800);
    return () => {
      if (saveTimerRef.current) clearTimeout(saveTimerRef.current);
    };
  }, [
    messages,
    activeThreadId,
    model,
    activeContextIds,
    connected,
    isActiveTab,
    rootThreadId,
    refreshHostBranches,
  ]);

  useEffect(() => {
    if (!isActiveTab || relayStatus !== "connected" || !relayRef.current) return;
    void relayRef.current
      .listContextBases()
      .then(setContextBases)
      .catch(() => undefined);
  }, [relayStatus, isActiveTab]);

  const reconnecting = relayStatus === "connecting" && hasConnectedRef.current;

  const effectiveHostStatus = useMemo(
    () =>
      resolveChatHostStatus({
        relayConnected: connected,
        relayHostStatus: hostStatus,
        cloudHost,
      }),
    [connected, hostStatus, cloudHost, statusClock],
  );

  const relayHostReachable = effectiveHostStatus === "online" || effectiveHostStatus === "busy";
  const hostBusy = effectiveHostStatus === "busy";
  const hostOffline = effectiveHostStatus === "offline";
  const hostReachable = effectiveHostStatus === "online" || effectiveHostStatus === "busy";
  const canSend =
    isActiveTab &&
    connected &&
    relayHostReachable &&
    hostReachable &&
    !hostOffline &&
    (!hostBusy || streaming);

  const handleNewConversation = useCallback(() => {
    if (conversationTree) {
      applyTree(startNewRootConversation(conversationTree));
    } else {
      setMessages([]);
    }
    setActiveThreadId(null);
    setRootThreadId(null);
    setHostBranches([]);
    localStorage.removeItem(activeThreadKey(hostId));
    setError(null);
    setInput("");
    clearAssistantTurn();
    activeRequestId.current = null;
    setStreaming(false);
    setConversationNotice("Nouvelle conversation prête — posez votre première question.");
    window.setTimeout(() => setConversationNotice(null), 4000);
  }, [applyTree, clearAssistantTurn, conversationTree, hostId]);

  async function handleForkAt(messageIndex: number) {
    if (streaming || !isActiveTab) return;

    if (connected && relayRef.current && activeThreadId) {
      try {
        await relayRef.current.saveChatThread(
          messages.map((m) => ({ role: m.role, content: m.content })),
          { threadId: activeThreadId, model, contextIds: activeContextIds },
        );
        const newId = await relayRef.current.forkChatThread(activeThreadId, messageIndex, {
          model,
          contextIds: activeContextIds,
        });
        const { thread, messages: forked } = await relayRef.current.getChatThread(newId);
        setActiveThreadId(newId);
        setRootThreadId(thread.rootThreadId);
        localStorage.setItem(activeThreadKey(hostId), newId);
        setMessages(toUiMessages(forked));
        await refreshHostBranches(thread.rootThreadId);
        setError(null);
        setInput("");
        clearAssistantTurn();
        activeRequestId.current = null;
        setConversationNotice(
          `Branche créée à partir du message ${messageIndex + 1} — le fil principal est conservé.`,
        );
        window.setTimeout(() => setConversationNotice(null), 5000);
      } catch (err) {
        setError(err instanceof Error ? err.message : "Impossible de créer la branche");
      }
      return;
    }

    if (!conversationTree) return;
    applyTree(forkFromMessage(conversationTree, messageIndex));
    setError(null);
    setInput("");
    clearAssistantTurn();
    activeRequestId.current = null;
    setConversationNotice(
      `Branche locale créée à partir du message ${messageIndex + 1} — le fil principal est conservé.`,
    );
    window.setTimeout(() => setConversationNotice(null), 5000);
  }

  async function handleSwitchBranch(branchId: string) {
    if (streaming || !isActiveTab) return;

    if (connected && relayRef.current && hostBranches.some((b) => b.id === branchId)) {
      try {
        const { thread, messages: branchMessages } = await relayRef.current.getChatThread(branchId);
        setActiveThreadId(thread.id);
        setRootThreadId(thread.rootThreadId);
        localStorage.setItem(activeThreadKey(hostId), thread.id);
        setMessages(toUiMessages(branchMessages));
        setError(null);
        clearAssistantTurn();
        activeRequestId.current = null;
      } catch (err) {
        setError(err instanceof Error ? err.message : "Impossible de charger la branche");
      }
      return;
    }

    if (!conversationTree || branchId === conversationTree.activeBranchId) return;
    applyTree(switchBranch(conversationTree, branchId));
    setError(null);
    clearAssistantTurn();
    activeRequestId.current = null;
  }

  const branchOptions =
    connected && hostBranches.length > 1
      ? hostBranches.map((b) => ({
          id: b.id,
          label: branchLabelFromSummary(b),
          count: b.messageCount,
        }))
      : branchMeta.length > 1
        ? branchMeta.map((b) => ({
            id: b.id,
            label: b.label,
            count: b.messageCount,
          }))
        : [];

  const activeBranchId =
    connected && activeThreadId ? activeThreadId : conversationTree?.activeBranchId ?? "";

  const handleStop = useCallback(() => {
    relayRef.current?.sendCancel(activeRequestId.current ?? undefined);
    setStreaming(false);
    activeRequestId.current = null;
  }, []);

  const handleExportConversation = useCallback(() => {
    if (messages.length === 0 || streaming) return;
    const exportMessages = messages
      .filter((m) => m.content.trim())
      .map((m) => ({ role: m.role, content: m.content }));
    downloadConversation(exportMessages, {
      model: model.trim() || defaultModel,
    });
  }, [defaultModel, messages, model, streaming]);

  function handlePlaybookRun(playbook: PlaybookSummary) {
    if (streaming || !relayRef.current || !canSend) return;

    const label = `Playbook : ${playbook.name}`;
    const userMsg: UiMessage = { role: "user", content: label };
    const newMessages = [...messages, userMsg];
    pendingUserMessage.current = userMsg;
    assistantMessageIndex.current = newMessages.length;
    setMessages(newMessages);
    setStreaming(true);
    setError(null);
    assistantBuffer.current = "";
    pendingCitations.current = undefined;

    const requestId = relayRef.current.sendPlaybookRun(playbook.id, {
      model: model.trim() || defaultModel,
      contextIds: activeContextIds,
    });
    activeRequestId.current = requestId ?? null;
  }

  const sendMessage = useCallback(() => {
    if (!input.trim() || streaming || !relayRef.current || !canSend) return;

    const rawInput = input.trim();
    const mentions = parseChatMentions(rawInput);
    const cleanedContent = stripChatMentions(rawInput);
    const ragContextIds = resolveRagContextIds(mentions, activeContextIds, contextBases);
    const mentionScope = toMentionScope(mentions);

    const userMsg: UiMessage = { role: "user", content: cleanedContent || rawInput };
    const newMessages = [...messages, userMsg];
    pendingUserMessage.current = userMsg;
    assistantMessageIndex.current = newMessages.length;
    setMessages(newMessages);
    setInput("");
    setStreaming(true);
    setError(null);
    assistantBuffer.current = "";
    thinkingBuffer.current = "";
    pendingCitations.current = undefined;

    const chatMessages: ChatMessage[] = newMessages.map((m) => ({
      role: m.role,
      content: m.content,
    }));

    const requestId = relayRef.current.sendChat(
      chatMessages,
      model.trim() || defaultModel,
      ragContextIds,
      undefined,
      undefined,
      activeProjectId ?? undefined,
      mentionScope,
      thinkingMode,
    );
    activeRequestId.current = requestId ?? null;
  }, [
    activeContextIds,
    activeProjectId,
    canSend,
    contextBases,
    defaultModel,
    input,
    messages,
    model,
    streaming,
    thinkingMode,
  ]);

  const paletteCommands = useMemo(
    () => [
      {
        id: "chat-new-conversation",
        label: "Nouvelle conversation",
        keywords: "reset effacer historique",
        group: "Chat",
        disabled: !isActiveTab || streaming,
        onSelect: handleNewConversation,
      },
      {
        id: "chat-toggle-context",
        label: showSidebar ? "Masquer le panneau latéral" : "Afficher le panneau latéral",
        keywords: "bases documents rag projet artefacts",
        group: "Chat",
        onSelect: () => setShowSidebar((value) => !value),
      },
      {
        id: "chat-export",
        label: "Exporter la conversation (.md)",
        keywords: "markdown telecharger download",
        group: "Chat",
        disabled: !isActiveTab || messages.length === 0 || streaming,
        onSelect: handleExportConversation,
      },
      {
        id: "chat-share",
        label: "Partager en lecture seule",
        keywords: "lien temporaire share",
        group: "Chat",
        disabled: !isActiveTab || messages.length === 0 || streaming,
        onSelect: () => setShowShareDialog(true),
      },
      {
        id: "chat-stop",
        label: "Arrêter la génération",
        keywords: "stop cancel annuler",
        group: "Chat",
        disabled: !streaming,
        onSelect: handleStop,
      },
      {
        id: "chat-dashboard",
        label: "Retour au tableau de bord",
        keywords: "mes pcs hosts",
        group: "Chat",
        onSelect: () => router.push("/dashboard"),
      },
    ],
    [
      handleExportConversation,
      handleNewConversation,
      handleStop,
      isActiveTab,
      messages.length,
      router,
      showSidebar,
      streaming,
    ],
  );

  useRegisterPaletteCommands(paletteCommands);

  function handleSend(e: React.FormEvent) {
    e.preventDefault();
    sendMessage();
  }

  const headerStatus = !isActiveTab
    ? { label: "Lecture seule — autre onglet actif", className: "text-amber-400" }
    : reconnecting
      ? { label: "Reconnexion…", className: "text-[var(--muted)]" }
      : !connected
        ? { label: "Connexion…", className: "text-[var(--muted)]" }
        : hostBusy && !streaming
          ? {
              label: "PC occupé — autre onglet actif",
              className: "text-amber-400",
            }
          : {
              label: `Host ${hostStatusLabel(effectiveHostStatus).toLowerCase()}`,
              className: hostStatusClassName(effectiveHostStatus),
            };

  return (
    <main className="mx-auto flex h-screen max-w-5xl flex-col px-4 py-4">
      <header className="mb-4 flex items-center justify-between border-b border-[var(--border)] pb-4">
        <Link href="/dashboard" className="text-sm text-brand-500 hover:underline">
          ← Mes PCs
        </Link>
        <div className="flex items-center gap-3">
          <PlaybookPicker
            relay={relayRef.current}
            connected={connected && isActiveTab}
            model={model}
            contextIds={activeContextIds}
            disabled={!canSend || streaming}
            onRun={handlePlaybookRun}
          />
          <Button type="button" variant="ghost" onClick={() => setShowSidebar((v) => !v)}>
            {showSidebar ? "Masquer panneau" : "Panneau latéral"}
          </Button>
          <Button
            type="button"
            variant="ghost"
            onClick={handleNewConversation}
            disabled={!isActiveTab || streaming}
          >
            Nouvelle conversation
          </Button>
          {branchOptions.length > 1 && (
            <label className="flex items-center gap-2 text-sm text-[var(--muted)]">
              Branche
              <select
                value={activeBranchId}
                onChange={(e) => void handleSwitchBranch(e.target.value)}
                disabled={streaming || !isActiveTab}
                className="max-w-[220px] rounded-lg border border-[var(--border)] bg-black/30 px-2 py-1 text-sm outline-none focus:border-brand-500 disabled:opacity-50"
                aria-label="Choisir une branche de conversation"
              >
                {branchOptions.map((branch) => (
                  <option key={branch.id} value={branch.id}>
                    {branch.label} ({branch.count} msg)
                  </option>
                ))}
              </select>
            </label>
          )}
          <Button
            type="button"
            variant="ghost"
            disabled={!isActiveTab || messages.length === 0 || streaming}
            onClick={handleExportConversation}
            title="Télécharger le fil actuel en Markdown (.md) — export local uniquement"
          >
            Exporter .md
          </Button>
          <Button
            type="button"
            variant="ghost"
            disabled={!isActiveTab || messages.length === 0 || streaming}
            onClick={() => setShowShareDialog(true)}
            title="Créer un lien temporaire en lecture seule (sans documents RAG)"
          >
            Partager
          </Button>
          <span className={`text-sm ${headerStatus.className}`}>{headerStatus.label}</span>
        </div>
      </header>

      <div className="flex min-h-0 flex-1 gap-4">
        <div className="flex min-w-0 flex-1 flex-col">
          <div className="mb-3 flex items-center gap-2">
            <label htmlFor="model-select" className="text-sm text-[var(--muted)]">
              Modèle
            </label>
            <input
              id="model-search"
              type="search"
              placeholder="Filtrer…"
              value={modelSearch}
              onChange={(e) => setModelSearch(e.target.value)}
              className="w-24 rounded-lg border border-[var(--border)] bg-black/30 px-2 py-1.5 text-sm"
              disabled={streaming || !isActiveTab}
            />
            <select
              id="model-select"
              value={model}
              onChange={(e) => setModel(e.target.value)}
              disabled={streaming || !isActiveTab}
              className="flex-1 rounded-lg border border-[var(--border)] bg-black/30 px-3 py-1.5 text-sm outline-none focus:border-brand-500 disabled:opacity-50"
            >
              {filteredModels.map((m) => (
                <option key={m} value={m}>
                  {m}
                  {m === defaultModel ? " (défaut)" : ""}
                </option>
              ))}
            </select>
            <label htmlFor="thinking-mode" className="text-sm text-[var(--muted)]">
              Mode
            </label>
            <select
              id="thinking-mode"
              value={thinkingMode ? "reflection" : "normal"}
              onChange={(e) => setThinkingMode(e.target.value === "reflection")}
              disabled={streaming || !isActiveTab}
              className="rounded-lg border border-[var(--border)] bg-black/30 px-2 py-1.5 text-sm outline-none focus:border-brand-500 disabled:opacity-50"
              title="Réflexion : modèles thinking Ollama (qwen3, deepseek-r1…)"
            >
              <option value="normal">Normal</option>
              <option value="reflection">Réflexion</option>
            </select>
          </div>

          {activeContextIds.length > 0 && (
            <p className="mb-2 text-xs text-brand-400">
              Contexte actif : {activeContextIds.length} base(s)
            </p>
          )}

          <div className="flex-1 space-y-4 overflow-y-auto pb-4">
            {isActiveTab && relayStatus === "connecting" && <ChatConnectingSkeleton />}
            {branchOptions.length > 1 && messages.length === 0 && (
              <Card>
                <p className="mb-2 text-sm font-medium">Branches enregistrées</p>
                <ul className="space-y-1 text-xs text-[var(--muted)]">
                  {branchOptions.slice(0, 8).map((branch) => (
                    <li key={branch.id}>
                      <button
                        type="button"
                        className="text-left hover:text-brand-400"
                        onClick={() => void handleSwitchBranch(branch.id)}
                        disabled={streaming || !isActiveTab}
                      >
                        {branch.label} — {branch.count} msg(s)
                      </button>
                    </li>
                  ))}
                </ul>
              </Card>
            )}
            {messages.length === 0 && isActiveTab && relayStatus === "connected" && (
              <Card>
                <p className="text-center text-[var(--muted)]">
                  Posez une question — la réponse est générée sur votre PC.
                </p>
              </Card>
            )}
            {messages.map((msg, i) => {
              if (msg.role === "assistant" && !msg.content.trim() && !msg.thinking?.trim()) {
                return null;
              }
              return (
                <div
                  key={`${msg.role}-${i}`}
                  className={`group relative rounded-lg px-4 py-3 ${
                    msg.role === "user"
                      ? "ml-8 bg-brand-600/20"
                      : "mr-8 border border-[var(--border)] bg-[var(--card)]"
                  }`}
                >
                  {msg.role === "assistant" ? (
                    <>
                      {msg.thinking?.trim() && (
                        <details
                          className="mb-3 rounded border border-[var(--border)] bg-black/20 px-3 py-2 text-xs text-[var(--muted)]"
                          open={streaming && i === messages.length - 1}
                        >
                          <summary className="cursor-pointer select-none font-medium text-brand-400">
                            Chaîne de pensée
                          </summary>
                          <pre className="mt-2 max-h-48 overflow-y-auto whitespace-pre-wrap">
                            {msg.thinking}
                          </pre>
                        </details>
                      )}
                      {msg.content.trim() && (
                        <MarkdownMessage
                          content={msg.content}
                          messageKey={`msg-${i}`}
                          onOpenArtifact={openArtifact}
                          relay={relayRef.current}
                          contextIds={activeContextIds}
                          connected={connected}
                        />
                      )}
                      {msg.citations && msg.citations.length > 0 && (
                        <RagCitationBadges citations={msg.citations} />
                      )}
                    </>
                  ) : (
                    <p className="whitespace-pre-wrap text-sm">{msg.content}</p>
                  )}
                  {isActiveTab && !streaming && messages.length > 1 && i < messages.length - 1 && (
                    <button
                      type="button"
                      onClick={() => void handleForkAt(i)}
                      className="absolute -bottom-2 right-2 hidden rounded border border-[var(--border)] bg-[var(--card)] px-2 py-0.5 text-[10px] text-[var(--muted)] hover:border-brand-500 hover:text-brand-400 group-hover:block"
                      title="Créer une branche à partir de ce message"
                    >
                      Brancher ici
                    </button>
                  )}
                </div>
              );
            })}
            {streaming && messages[messages.length - 1]?.role !== "assistant" && (
              <p className="text-sm text-[var(--muted)]">
                {thinkingMode ? "Pensée en cours…" : "Réflexion…"}
              </p>
            )}
            <div ref={messagesEndRef} />
          </div>

          {conversationNotice && (
            <p className="mb-2 text-sm text-brand-400">{conversationNotice}</p>
          )}
          {!isActiveTab && (
            <p className="mb-2 text-sm text-amber-400">
              Ce chat est actif dans un autre onglet. Vous pouvez suivre la conversation en
              lecture seule — fermez l&apos;autre onglet pour reprendre la main.
            </p>
          )}
          {error && <p className="mb-2 text-sm text-red-400">{error}</p>}
          {hostOffline && connected && (
            <p className="mb-2 text-sm text-red-400">
              Ce PC est hors ligne — ouvrez l&apos;app Host sur la machine ou attendez qu&apos;il
              se reconnecte.
            </p>
          )}
          {hostBusy && !streaming && (
            <p className="mb-2 text-sm text-amber-400">
              Ce PC est utilisé par une autre session. Attendez ou fermez l&apos;autre onglet.
            </p>
          )}
          {inputMentionHint && (
            <p className="mb-2 text-xs text-brand-400">{inputMentionHint}</p>
          )}

          <form onSubmit={handleSend} className="flex gap-2 border-t border-[var(--border)] pt-4">
            <input
              value={input}
              onChange={(e) => setInput(e.target.value)}
              onKeyDown={(e) => {
                if ((e.ctrlKey || e.metaKey) && e.key === "Enter") {
                  e.preventDefault();
                  sendMessage();
                }
              }}
              placeholder={
                isActiveTab
                  ? `Votre message… (${SEND_SHORTCUT_LABEL} pour envoyer · @base:Nom, @fichier:…)`
                  : "Lecture seule — autre onglet actif"
              }
              disabled={streaming || !canSend}
              aria-keyshortcuts={isActiveTab ? SEND_SHORTCUT_LABEL : undefined}
              className="flex-1 rounded-lg border border-[var(--border)] bg-black/30 px-4 py-2 text-sm outline-none focus:border-brand-500 disabled:opacity-50"
            />
            {streaming ? (
              <Button type="button" variant="secondary" onClick={handleStop}>
                Arrêter
              </Button>
            ) : (
              <Button type="submit" disabled={!canSend || !input.trim()}>
                Envoyer
              </Button>
            )}
          </form>
        </div>

        {showSidebar && (
          <div className="flex min-h-0 w-[320px] shrink-0 flex-col border-l border-[var(--border)] pl-4">
            <div className="chat-sidebar-tabs" role="tablist" aria-label="Panneau latéral">
              <button
                type="button"
                role="tab"
                aria-selected={sidebarTab === "context"}
                onClick={() => setSidebarTab("context")}
              >
                Contexte
              </button>
              <button
                type="button"
                role="tab"
                aria-selected={sidebarTab === "artifacts"}
                onClick={() => setSidebarTab("artifacts")}
              >
                Artefacts{artifacts.length > 0 ? ` (${artifacts.length})` : ""}
              </button>
            </div>
            {sidebarTab === "context" ? (
              <ContextPanel
                relay={relayRef.current}
                connected={connected && isActiveTab}
                activeIds={activeContextIds}
                onActiveChange={setActiveContextIds}
                activeProjectId={activeProjectId}
                onProjectChange={(projectId, kbaseIds) => {
                  setActiveProjectId(projectId);
                  setActiveContextIds(kbaseIds);
                }}
              />
            ) : (
              <ArtifactsPanel
                artifacts={artifacts}
                activeId={activeArtifactId}
                onSelect={setActiveArtifactId}
              />
            )}
          </div>
        )}
      </div>

      {showShareDialog && (
        <ShareDialog
          hostId={hostId}
          messages={toShareMessages(
            messages.map((m) => ({ role: m.role, content: m.content })),
          )}
          onClose={() => setShowShareDialog(false)}
        />
      )}
    </main>
  );
}
