"use client";

import { useEffect, useRef, useState } from "react";
import Link from "next/link";
import { useParams } from "next/navigation";
import type { ChatMessage } from "@ownmyownai/protocol";
import { mintRelayToken } from "@/lib/api";
import { RelayClient } from "@/lib/relay-client";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";

interface UiMessage {
  role: "user" | "assistant";
  content: string;
}

export default function ChatPage() {
  const params = useParams();
  const hostId = params.hostId as string;
  const [messages, setMessages] = useState<UiMessage[]>([]);
  const [input, setInput] = useState("");
  const [streaming, setStreaming] = useState(false);
  const [hostOnline, setHostOnline] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [relayStatus, setRelayStatus] = useState<"connecting" | "connected" | "offline" | "error">(
    "connecting",
  );
  const relayRef = useRef<RelayClient | null>(null);
  const hasConnectedRef = useRef(false);
  const assistantBuffer = useRef("");

  useEffect(() => {
    hasConnectedRef.current = false;
    const client = new RelayClient({
      mintToken: () => mintRelayToken(hostId),
      onStatus: (status) => {
        if (status === "connected") hasConnectedRef.current = true;
        setRelayStatus(status);
      },
      onHostStatus: (online) => setHostOnline(online),
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
        assistantBuffer.current = "";
      },
      onError: (msg) => {
        setError(msg);
        setStreaming(false);
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

  async function handleSend(e: React.FormEvent) {
    e.preventDefault();
    if (!input.trim() || streaming || !relayRef.current) return;

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

    relayRef.current.sendChat(chatMessages, undefined, crypto.randomUUID());
  }

  return (
    <main className="mx-auto flex h-screen max-w-3xl flex-col px-4 py-4">
      <header className="mb-4 flex items-center justify-between border-b border-[var(--border)] pb-4">
        <Link href="/dashboard" className="text-sm text-brand-500 hover:underline">
          ← Mes PCs
        </Link>
        <span
          className={`text-sm ${hostOnline && connected ? "text-brand-500" : "text-red-400"}`}
        >
          {reconnecting
            ? "Reconnexion…"
            : connected
              ? hostOnline
                ? "Host en ligne"
                : "Host hors ligne"
              : "Connexion…"}
        </span>
      </header>

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
          disabled={streaming || !hostOnline}
          className="flex-1 rounded-lg border border-[var(--border)] bg-black/30 px-4 py-2 text-sm outline-none focus:border-brand-500 disabled:opacity-50"
        />
        <Button type="submit" disabled={streaming || !hostOnline || !input.trim()}>
          Envoyer
        </Button>
      </form>
    </main>
  );
}
