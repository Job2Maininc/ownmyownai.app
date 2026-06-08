"use client";

import { useEffect, useRef, useState } from "react";
import Link from "next/link";
import type { ChatMessage, HostStatus } from "@ownmyownai/protocol";
import { mintRelayToken } from "@/lib/api";
import { hostStatusClassName, hostStatusLabel } from "@/lib/host-status";
import { RelayClient } from "@/lib/relay-client";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";

interface UiMessage {
  role: "user" | "assistant";
  content: string;
}

interface ChatViewProps {
  hostId: string;
  defaultModel: string;
}

function storageKey(hostId: string) {
  return `chat:${hostId}`;
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

export function ChatView({ hostId, defaultModel }: ChatViewProps) {
  const [messages, setMessages] = useState<UiMessage[]>([]);
  const [input, setInput] = useState("");
  const [model, setModel] = useState(defaultModel);
  const [streaming, setStreaming] = useState(false);
  const [hostStatus, setHostStatus] = useState<HostStatus>("offline");
  const [error, setError] = useState<string | null>(null);
  const [relayStatus, setRelayStatus] = useState<"connecting" | "connected" | "offline" | "error">(
    "connecting",
  );
  const relayRef = useRef<RelayClient | null>(null);
  const hasConnectedRef = useRef(false);
  const assistantBuffer = useRef("");
  const activeRequestId = useRef<string | null>(null);
  const hydrated = useRef(false);

  useEffect(() => {
    setModel(defaultModel);
  }, [defaultModel]);

  useEffect(() => {
    if (hydrated.current) return;
    hydrated.current = true;
    setMessages(loadMessages(hostId));
  }, [hostId]);

  useEffect(() => {
    if (!hydrated.current) return;
    sessionStorage.setItem(storageKey(hostId), JSON.stringify(messages));
  }, [hostId, messages]);

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
  const hostReachable = hostStatus === "online" || hostStatus === "busy";

  function handleNewConversation() {
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
    if (!input.trim() || streaming || !relayRef.current || !hostReachable) return;

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

    const requestId = relayRef.current.sendChat(chatMessages, model.trim() || defaultModel);
    activeRequestId.current = requestId ?? null;
  }

  const headerStatus =
    reconnecting
      ? { label: "Reconnexion…", className: "text-[var(--muted)]" }
      : !connected
        ? { label: "Connexion…", className: "text-[var(--muted)]" }
        : {
            label: `Host ${hostStatusLabel(hostStatus).toLowerCase()}`,
            className: hostStatusClassName(hostStatus),
          };

  return (
    <main className="mx-auto flex h-screen max-w-3xl flex-col px-4 py-4">
      <header className="mb-4 flex items-center justify-between border-b border-[var(--border)] pb-4">
        <Link href="/dashboard" className="text-sm text-brand-500 hover:underline">
          ← Mes PCs
        </Link>
        <div className="flex items-center gap-3">
          <Button type="button" variant="ghost" onClick={handleNewConversation}>
            Nouvelle conversation
          </Button>
          <span className={`text-sm ${headerStatus.className}`}>{headerStatus.label}</span>
        </div>
      </header>

      <div className="mb-3 flex items-center gap-2">
        <label htmlFor="model-select" className="text-sm text-[var(--muted)]">
          Modèle
        </label>
        <input
          id="model-select"
          list="model-options"
          value={model}
          onChange={(e) => setModel(e.target.value)}
          disabled={streaming}
          className="flex-1 rounded-lg border border-[var(--border)] bg-black/30 px-3 py-1.5 text-sm outline-none focus:border-brand-500 disabled:opacity-50"
        />
        <datalist id="model-options">
          <option value={defaultModel} />
        </datalist>
      </div>

      <div className="flex-1 space-y-4 overflow-y-auto pb-4">
        {messages.length === 0 && (
          <Card>
            <p className="text-center text-[var(--muted)]">
              Posez une question — la réponse est générée sur votre PC.
            </p>
          </Card>
        )}
        {messages.map((msg, i) => (
          <div
            key={i}
            className={`rounded-lg px-4 py-3 ${
              msg.role === "user"
                ? "ml-8 bg-brand-600/20"
                : "mr-8 border border-[var(--border)] bg-[var(--card)]"
            }`}
          >
            <p className="whitespace-pre-wrap text-sm">{msg.content}</p>
          </div>
        ))}
        {streaming && messages[messages.length - 1]?.role !== "assistant" && (
          <p className="text-sm text-[var(--muted)]">Réflexion…</p>
        )}
      </div>

      {error && <p className="mb-2 text-sm text-red-400">{error}</p>}

      <form onSubmit={handleSend} className="flex gap-2 border-t border-[var(--border)] pt-4">
        <input
          value={input}
          onChange={(e) => setInput(e.target.value)}
          placeholder="Votre message…"
          disabled={streaming || !hostReachable}
          className="flex-1 rounded-lg border border-[var(--border)] bg-black/30 px-4 py-2 text-sm outline-none focus:border-brand-500 disabled:opacity-50"
        />
        {streaming ? (
          <Button type="button" variant="secondary" onClick={handleStop}>
            Arrêter
          </Button>
        ) : (
          <Button type="submit" disabled={!hostReachable || !input.trim()}>
            Envoyer
          </Button>
        )}
      </form>
    </main>
  );
}
