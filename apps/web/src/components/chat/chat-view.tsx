"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
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
import { createClient } from "@/lib/supabase/client";
import { Card } from "@/components/ui/card";
import { ArtifactsPanel } from "./artifacts-panel";
import { ChatComposer } from "./chat-composer";
import { ChatMessage as ChatMessageBubble, ChatTypingIndicator } from "./chat-message";
import { ChatToolbar } from "./chat-toolbar";
import { IndexingProgressBar } from "./indexing-progress-bar";
import type { IndexingProgressPayload } from "@/lib/relay-client";
import { ContextPanel, loadActiveContextIds } from "./context-panel";
import { ChatConnectingSkeleton } from "./chat-skeleton";
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
  const [cloudHost, setCloudHost] = useState<
    Pick<Host, "status" | "last_seen_at" | "indexing_progress"> | null
  >(null);
  const [liveIndexing, setLiveIndexing] = useState<IndexingProgressPayload | null>(null);
  const [statusClock, setStatusClock] = useState(0);
  const [queueHint, setQueueHint] = useState<string | null>(null);
  const [showShareDialog, setShowShareDialog] = useState(false);
  const relayRef = useRef<RelayClient | null>(null);
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
        .select("status, last_seen_at, indexing_progress")
        .eq("id", hostId)
        .single();
      if (data) {
        setCloudHost(
          data as Pick<Host, "status" | "last_seen_at" | "indexing_progress">,
        );
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
          setCloudHost(
            payload.new as Pick<Host, "status" | "last_seen_at" | "indexing_progress">,
          );
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

  useEffect(() => {
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
      onHostStatus: (status, meta) => {
        setHostStatus(status);
        if (meta?.indexingProgress !== undefined) {
          setLiveIndexing(meta.indexingProgress);
        }
      },
      onJobProgress: (payload) => {
        if (!payload.kind.startsWith("context.")) return;
        if (payload.status === "done" || payload.status === "cancelled" || payload.status === "error") {
          setLiveIndexing(null);
          return;
        }
        setLiveIndexing({
          active: true,
          progress: payload.progress,
          message: payload.message,
          kind: payload.kind,
        });
      },
      onQueued: (position, waitingAhead) => {
        if (position <= 1) {
          setQueueHint(null);
          return;
        }
        setQueueHint(
          waitingAhead > 0
            ? `En file d'attente — ${waitingAhead} requête(s) devant vous…`
            : "En file d'attente…",
        );
      },
      onCitations: attachCitations,
      onThinkingDelta: (thinking) => {
        thinkingBuffer.current += thinking;
        setMessages((prev) =>
          commitAssistantTurn(prev, assistantBuffer.current, thinkingBuffer.current),
        );
      },
      onDelta: (content) => {
        setQueueHint(null);
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
        setQueueHint(null);
        activeRequestId.current = null;
        clearAssistantTurn();
      },
      onError: (msg) => {
        const outdatedHost =
          msg.includes("déjà utilisé") || msg.includes("autre session de chat");
        setError(
          outdatedHost
            ? "Host obsolète — installez la v0.2.1+ (onglet État → Mises à jour ou page Télécharger), puis redémarrez l'app."
            : msg,
        );
        setStreaming(false);
        setQueueHint(null);
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
  }, [hostId, attachCitations, clearAssistantTurn, commitAssistantTurn]);

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
    if (!connected || !relayRef.current) return;

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
  }, [connected, hostId, refreshHostBranches]);

  useEffect(() => {
    if (!connected || !relayRef.current || messages.length === 0 || activeThreadId) {
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
    hostId,
    refreshHostBranches,
  ]);

  useEffect(() => {
    if (!connected || !activeThreadId || !relayRef.current || messages.length === 0) {
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
    rootThreadId,
    refreshHostBranches,
  ]);

  useEffect(() => {
    if (relayStatus !== "connected" || !relayRef.current) return;
    void relayRef.current
      .listContextBases()
      .then(setContextBases)
      .catch(() => undefined);
  }, [relayStatus]);

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
  const hostOffline = effectiveHostStatus === "offline";
  const hostReachable = effectiveHostStatus === "online" || effectiveHostStatus === "busy";
  const canSend = connected && relayHostReachable && hostReachable && !hostOffline;

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
    if (streaming) return;

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
    if (streaming) return;

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
        disabled: streaming,
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
        disabled: messages.length === 0 || streaming,
        onSelect: handleExportConversation,
      },
      {
        id: "chat-share",
        label: "Partager en lecture seule",
        keywords: "lien temporaire share",
        group: "Chat",
        disabled: messages.length === 0 || streaming,
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
      messages.length,
      router,
      showSidebar,
      streaming,
    ],
  );

  useRegisterPaletteCommands(paletteCommands);

  const headerStatus = reconnecting
    ? { label: "Reconnexion…", className: "text-[var(--muted)]" }
    : !connected
      ? { label: "Connexion…", className: "text-[var(--muted)]" }
      : queueHint
        ? { label: queueHint, className: "text-amber-400" }
        : {
            label: `Host ${hostStatusLabel(effectiveHostStatus).toLowerCase()}`,
            className: hostStatusClassName(effectiveHostStatus),
          };

  const showTypingIndicator =
    streaming && messages[messages.length - 1]?.role !== "assistant";

  const indexingBanner =
    liveIndexing?.active === true
      ? liveIndexing
      : cloudHost?.indexing_progress?.active
        ? cloudHost.indexing_progress
        : null;

  return (
    <main className="chat-shell">
      <ChatToolbar
        headerStatus={headerStatus}
        model={model}
        defaultModel={defaultModel}
        modelSearch={modelSearch}
        onModelSearchChange={setModelSearch}
        onModelChange={setModel}
        filteredModels={filteredModels}
        thinkingMode={thinkingMode}
        onThinkingModeChange={setThinkingMode}
        streaming={streaming}
        showSidebar={showSidebar}
        onToggleSidebar={() => setShowSidebar((v) => !v)}
        onNewConversation={handleNewConversation}
        onExport={handleExportConversation}
        onShare={() => setShowShareDialog(true)}
        messagesCount={messages.length}
        branchOptions={branchOptions}
        activeBranchId={activeBranchId}
        onSwitchBranch={(id) => void handleSwitchBranch(id)}
        relay={relayRef.current}
        connected={connected}
        canSend={canSend}
        contextIds={activeContextIds}
        onPlaybookRun={handlePlaybookRun}
      />

      <div className="chat-layout">
        <div className="chat-main">
          {activeContextIds.length > 0 && (
            <p className="chat-alerts text-xs text-[var(--link)]">
              Contexte actif : {activeContextIds.length} base(s)
            </p>
          )}

          {indexingBanner && (
            <div className="chat-alerts">
              <IndexingProgressBar
                progress={indexingBanner.progress}
                message={indexingBanner.message}
                compact
              />
            </div>
          )}

          <div className="chat-messages">
            <div className="chat-messages__inner">
              {relayStatus === "connecting" && <ChatConnectingSkeleton />}

              {branchOptions.length > 1 && messages.length === 0 && (
                <Card className="mb-4">
                  <p className="mb-2 text-sm font-medium">Branches enregistrées</p>
                  <ul className="space-y-1 text-xs text-[var(--muted)]">
                    {branchOptions.slice(0, 8).map((branch) => (
                      <li key={branch.id}>
                        <button
                          type="button"
                          className="text-left hover:text-[var(--link)]"
                          onClick={() => void handleSwitchBranch(branch.id)}
                          disabled={streaming}
                        >
                          {branch.label} — {branch.count} msg(s)
                        </button>
                      </li>
                    ))}
                  </ul>
                </Card>
              )}

              {messages.length === 0 && relayStatus === "connected" && (
                <div className="chat-empty">
                  <p className="chat-empty__title">Comment puis-je vous aider ?</p>
                  <p className="text-sm">
                    Posez une question — la réponse est générée sur votre PC.
                  </p>
                </div>
              )}

              {messages.map((msg, i) => (
                <ChatMessageBubble
                  key={`${msg.role}-${i}`}
                  message={msg}
                  index={i}
                  streaming={streaming}
                  messagesLength={messages.length}
                  canFork={!streaming && messages.length > 1}
                  onFork={() => void handleForkAt(i)}
                  onOpenArtifact={openArtifact}
                  relay={relayRef.current}
                  contextIds={activeContextIds}
                  connected={connected}
                />
              ))}

              {showTypingIndicator && <ChatTypingIndicator thinkingMode={thinkingMode} />}
              <div ref={messagesEndRef} />
            </div>
          </div>

          {(conversationNotice || error || (hostOffline && connected) || queueHint) && (
            <div className="chat-alerts space-y-1 text-sm">
              {conversationNotice && <p className="text-[var(--link)]">{conversationNotice}</p>}
              {error && <p className="text-red-600">{error}</p>}
              {hostOffline && connected && (
                <p className="text-red-600">
                  Ce PC est hors ligne — ouvrez l&apos;app Host sur la machine ou attendez qu&apos;il
                  se reconnecte.
                </p>
              )}
              {queueHint && !streaming && <p className="text-amber-600">{queueHint}</p>}
            </div>
          )}

          <ChatComposer
            value={input}
            onChange={setInput}
            onSubmit={sendMessage}
            onStop={handleStop}
            streaming={streaming}
            canSend={canSend}
            sendShortcutLabel={SEND_SHORTCUT_LABEL}
            mentionHint={inputMentionHint}
          />
        </div>

        {showSidebar && (
          <aside className="chat-sidebar">
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
                connected={connected}
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
          </aside>
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
