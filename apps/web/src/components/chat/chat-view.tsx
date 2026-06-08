"use client";

import { useEffect, useRef, useState } from "react";
import Link from "next/link";
import type { ChatMessage, HostStatus } from "@ownmyownai/protocol";
import { mintRelayToken } from "@/lib/api";
import { hostStatusClassName, hostStatusLabel } from "@/lib/host-status";
import { RelayClient } from "@/lib/relay-client";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { ContextPanel, loadActiveContextIds } from "./context-panel";
import { ChatConnectingSkeleton } from "./chat-skeleton";
import { MarkdownMessage } from "./markdown-message";

interface UiMessage {
  role: "user" | "assistant";
  content: string;
}

interface ConversationMeta {
  id: string;
  title: string;
  updatedAt: string;
  messageCount: number;
}

interface ChatViewProps {
  hostId: string;
  defaultModel: string;
  installedModels?: string[];
}

function storageKey(hostId: string) {
  return `chat:${hostId}`;
}

function contextKey(hostId: string) {
  return `context-active:${hostId}`;
}

function historyMetaKey(hostId: string) {
  return `chat-history-meta:${hostId}`;
}

function loadHistoryMeta(hostId: string): ConversationMeta[] {
  if (typeof window === "undefined") return [];
  try {
    const raw = localStorage.getItem(historyMetaKey(hostId));
    return raw ? (JSON.parse(raw) as ConversationMeta[]) : [];
  } catch {
    return [];
  }
}

function saveHistoryMeta(hostId: string, items: ConversationMeta[]) {
  localStorage.setItem(historyMetaKey(hostId), JSON.stringify(items.slice(0, 20)));
}

function loadMessages(hostId: string): UiMessage[] {
  if (typeof window === "undefined") return [];
  try {
    const raw = sessionStorage.getItem(storageKey(hostId));
    if (!raw) return [];
    const parsed = JSON.parse(raw) as UiMessage[];
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}

export function ChatView({ hostId, defaultModel, installedModels = [] }: ChatViewProps) {
  const [messages, setMessages] = useState<UiMessage[]>([]);
  const [input, setInput] = useState("");
  const [model, setModel] = useState(defaultModel);
  const [modelSearch, setModelSearch] = useState("");
  const [streaming, setStreaming] = useState(false);
  const [hostStatus, setHostStatus] = useState<HostStatus>("offline");
  const [error, setError] = useState<string | null>(null);
  const [relayStatus, setRelayStatus] = useState<"connecting" | "connected" | "offline" | "error">(
    "connecting",
  );
  const [activeContextIds, setActiveContextIds] = useState<string[]>([]);
  const [showContext, setShowContext] = useState(true);
  const [historyMeta, setHistoryMeta] = useState<ConversationMeta[]>([]);
  const relayRef = useRef<RelayClient | null>(null);
  const hasConnectedRef = useRef(false);
  const assistantBuffer = useRef("");
  const activeRequestId = useRef<string | null>(null);
  const hydrated = useRef(false);
  const messagesEndRef = useRef<HTMLDivElement>(null);

  const models = installedModels.length > 0 ? installedModels : [defaultModel];
  const filteredModels = models.filter((m) =>
    m.toLowerCase().includes(modelSearch.toLowerCase()),
  );

  useEffect(() => {
    setModel(defaultModel);
  }, [defaultModel]);

  useEffect(() => {
    if (hydrated.current) return;
    hydrated.current = true;
    setMessages(loadMessages(hostId));
    setActiveContextIds(loadActiveContextIds(hostId));
    setHistoryMeta(loadHistoryMeta(hostId));
  }, [hostId]);

  useEffect(() => {
    if (!hydrated.current) return;
    sessionStorage.setItem(storageKey(hostId), JSON.stringify(messages));
  }, [hostId, messages]);

  useEffect(() => {
    sessionStorage.setItem(contextKey(hostId), JSON.stringify(activeContextIds));
  }, [hostId, activeContextIds]);

  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages, streaming]);

  useEffect(() => {
    hasConnectedRef.current = false;
    const client = new RelayClient({
      mintToken: () => mintRelayToken(hostId),
      onStatus: (status) => {
        if (status === "connected") hasConnectedRef.current = true;
        setRelayStatus(status);
      },
      onHostStatus: (status) => setHostStatus(status),
      onDelta: (content) => {
        assistantBuffer.current += content;
        setMessages((prev) => {
          const next = [...prev];
          const last = next[next.length - 1];
          if (last?.role === "assistant") {
            next[next.length - 1] = { role: "assistant", content: assistantBuffer.current };
          } else {
            next.push({ role: "assistant", content: assistantBuffer.current });
          }
          return next;
        });
      },
      onDone: () => {
        setStreaming(false);
        activeRequestId.current = null;
        assistantBuffer.current = "";
      },
      onError: (msg) => {
        setError(msg);
        setStreaming(false);
        activeRequestId.current = null;
      },
    });
    relayRef.current = client;
    void client.connect();

    return () => {
      client.disconnect();
      relayRef.current = null;
    };
  }, [hostId]);

  const connected = relayStatus === "connected";
  const reconnecting = relayStatus === "connecting" && hasConnectedRef.current;
  const hostBusy = hostStatus === "busy";
  const hostOffline = hostStatus === "offline";
  const hostReachable = hostStatus === "online" || hostStatus === "busy";
  const canSend = hostReachable && !hostOffline && (!hostBusy || streaming);

  function handleNewConversation() {
    if (messages.length > 0) {
      const firstUser = messages.find((m) => m.role === "user");
      const entry: ConversationMeta = {
        id: crypto.randomUUID(),
        title: (firstUser?.content ?? "Conversation").slice(0, 60),
        updatedAt: new Date().toISOString(),
        messageCount: messages.length,
      };
      const next = [entry, ...historyMeta];
      setHistoryMeta(next);
      saveHistoryMeta(hostId, next);
    }
    setMessages([]);
    setError(null);
    sessionStorage.removeItem(storageKey(hostId));
  }

  function handleStop() {
    relayRef.current?.sendCancel(activeRequestId.current ?? undefined);
    setStreaming(false);
    activeRequestId.current = null;
  }

  async function handleSend(e: React.FormEvent) {
    e.preventDefault();
    if (!input.trim() || streaming || !relayRef.current || !canSend) return;

    const userMsg: UiMessage = { role: "user", content: input.trim() };
    const newMessages = [...messages, userMsg];
    setMessages(newMessages);
    setInput("");
    setStreaming(true);
    setError(null);
    assistantBuffer.current = "";

    const chatMessages: ChatMessage[] = newMessages.map((m) => ({
      role: m.role,
      content: m.content,
    }));

    const requestId = relayRef.current.sendChat(
      chatMessages,
      model.trim() || defaultModel,
      activeContextIds,
    );
    activeRequestId.current = requestId ?? null;
  }

  const headerStatus = reconnecting
    ? { label: "Reconnexion…", className: "text-[var(--muted)]" }
    : !connected
      ? { label: "Connexion…", className: "text-[var(--muted)]" }
      : hostBusy && !streaming
        ? {
            label: "PC occupé — autre onglet actif",
            className: "text-amber-400",
          }
        : {
            label: `Host ${hostStatusLabel(hostStatus).toLowerCase()}`,
            className: hostStatusClassName(hostStatus),
          };

  return (
    <main className="mx-auto flex h-screen max-w-5xl flex-col px-4 py-4">
      <header className="mb-4 flex items-center justify-between border-b border-[var(--border)] pb-4">
        <Link href="/dashboard" className="text-sm text-brand-500 hover:underline">
          ← Mes PCs
        </Link>
        <div className="flex items-center gap-3">
          <Button type="button" variant="ghost" onClick={() => setShowContext((v) => !v)}>
            {showContext ? "Masquer contexte" : "Bases de contexte"}
          </Button>
          <Button type="button" variant="ghost" onClick={handleNewConversation}>
            Nouvelle conversation
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
              disabled={streaming}
            />
            <select
              id="model-select"
              value={model}
              onChange={(e) => setModel(e.target.value)}
              disabled={streaming}
              className="flex-1 rounded-lg border border-[var(--border)] bg-black/30 px-3 py-1.5 text-sm outline-none focus:border-brand-500 disabled:opacity-50"
            >
              {filteredModels.map((m) => (
                <option key={m} value={m}>
                  {m}
                  {m === defaultModel ? " (défaut)" : ""}
                </option>
              ))}
            </select>
          </div>

          {activeContextIds.length > 0 && (
            <p className="mb-2 text-xs text-brand-400">
              Contexte actif : {activeContextIds.length} base(s)
            </p>
          )}

          <div className="flex-1 space-y-4 overflow-y-auto pb-4">
            {relayStatus === "connecting" && <ChatConnectingSkeleton />}
            {historyMeta.length > 0 && messages.length === 0 && (
              <Card>
                <p className="mb-2 text-sm font-medium">Conversations récentes (métadonnées locales)</p>
                <ul className="space-y-1 text-xs text-[var(--muted)]">
                  {historyMeta.slice(0, 5).map((h) => (
                    <li key={h.id}>
                      {h.title} — {h.messageCount} msg(s) —{" "}
                      {new Date(h.updatedAt).toLocaleString("fr-FR")}
                    </li>
                  ))}
                </ul>
              </Card>
            )}
            {messages.length === 0 && relayStatus === "connected" && (
              <Card>
                <p className="text-center text-[var(--muted)]">
                  Posez une question — la réponse est générée sur votre PC.
                </p>
              </Card>
            )}
            {messages.map((msg, i) => (
              <div
                key={`${msg.role}-${i}`}
                className={`rounded-lg px-4 py-3 ${
                  msg.role === "user"
                    ? "ml-8 bg-brand-600/20"
                    : "mr-8 border border-[var(--border)] bg-[var(--card)]"
                }`}
              >
                {msg.role === "assistant" ? (
                  <MarkdownMessage content={msg.content} />
                ) : (
                  <p className="whitespace-pre-wrap text-sm">{msg.content}</p>
                )}
              </div>
            ))}
            {streaming && messages[messages.length - 1]?.role !== "assistant" && (
              <p className="text-sm text-[var(--muted)]">Réflexion…</p>
            )}
            <div ref={messagesEndRef} />
          </div>

          {error && <p className="mb-2 text-sm text-red-400">{error}</p>}
          {hostBusy && !streaming && (
            <p className="mb-2 text-sm text-amber-400">
              Ce PC est utilisé par une autre session. Attendez ou fermez l&apos;autre onglet.
            </p>
          )}

          <form onSubmit={handleSend} className="flex gap-2 border-t border-[var(--border)] pt-4">
            <input
              value={input}
              onChange={(e) => setInput(e.target.value)}
              placeholder="Votre message…"
              disabled={streaming || !canSend}
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

        {showContext && (
          <ContextPanel
            relay={relayRef.current}
            connected={connected}
            activeIds={activeContextIds}
            onActiveChange={setActiveContextIds}
          />
        )}
      </div>
    </main>
  );
}
