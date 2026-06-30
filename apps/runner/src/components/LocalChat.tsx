import { useCallback, useEffect, useRef, useState } from "react";
import { invoke } from "@tauri-apps/api/core";
import { listen } from "@tauri-apps/api/event";
import { formatShortcutLabel } from "../lib/keyboard-shortcuts";
import { formatInvokeError } from "../lib/tauri-errors";
import EmptyState from "./EmptyState";

const SEND_SHORTCUT_LABEL = formatShortcutLabel({ key: "Enter", mod: true });

const CHAT_SUGGESTIONS = [
  "Résume ce document en 3 points",
  "Explique-moi ce concept simplement",
  "Quelles sont les bonnes pratiques ici ?",
] as const;

interface ChatMessage {
  role: "user" | "assistant";
  content: string;
}

interface LocalChatProps {
  defaultModel: string;
  ollamaRunning: boolean;
}

export default function LocalChat({ defaultModel, ollamaRunning }: LocalChatProps) {
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [input, setInput] = useState("");
  const [streaming, setStreaming] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const bottomRef = useRef<HTMLDivElement>(null);

  const scrollToBottom = useCallback(() => {
    bottomRef.current?.scrollIntoView({ behavior: "smooth" });
  }, []);

  useEffect(() => {
    scrollToBottom();
  }, [messages, scrollToBottom]);

  useEffect(() => {
    const unsubs: Array<() => void> = [];

    listen<{ content: string }>("local-chat-delta", (event) => {
      const delta = event.payload.content;
      setMessages((prev) => {
        const last = prev[prev.length - 1];
        if (last?.role === "assistant") {
          return [
            ...prev.slice(0, -1),
            { role: "assistant", content: last.content + delta },
          ];
        }
        return [...prev, { role: "assistant", content: delta }];
      });
    }).then((fn) => unsubs.push(fn));

    listen("local-chat-done", () => {
      setStreaming(false);
    }).then((fn) => unsubs.push(fn));

    listen<{ message: string }>("local-chat-error", (event) => {
      setError(event.payload.message);
      setStreaming(false);
    }).then((fn) => unsubs.push(fn));

    return () => {
      unsubs.forEach((fn) => fn());
    };
  }, []);

  async function handleSend() {
    const text = input.trim();
    if (!text || streaming) return;

    setError(null);
    setInput("");
    const nextMessages: ChatMessage[] = [
      ...messages,
      { role: "user", content: text },
    ];
    setMessages(nextMessages);
    setStreaming(true);

    try {
      await invoke("local_chat", {
        model: defaultModel,
        messages: nextMessages.map((m) => ({
          role: m.role,
          content: m.content,
        })),
        contextIds: [],
      });
    } catch (e) {
      setError(formatInvokeError(e));
      setStreaming(false);
    }
  }

  async function handleCancel() {
    await invoke("cancel_local_chat");
    setStreaming(false);
  }

  return (
    <div className="local-chat">
      <p className="muted local-chat__hint">
        Chat 100 % local — aucune donnée n&apos;est envoyée au cloud ni au relay.
      </p>

      <div className="local-chat__messages" role="log" aria-live="polite">
        {messages.length === 0 ? (
          <div className="local-chat__empty">
            <EmptyState
              icon="message"
              title="Votre premier message"
              description={`Posez une question à votre modèle local (${defaultModel}). Tout reste sur ce PC.`}
            >
              <div className="local-chat__suggestions">
                {CHAT_SUGGESTIONS.map((suggestion) => (
                  <button
                    key={suggestion}
                    type="button"
                    className="local-chat__suggestion"
                    disabled={!ollamaRunning || streaming}
                    onClick={() => setInput(suggestion)}
                  >
                    {suggestion}
                  </button>
                ))}
              </div>
            </EmptyState>
          </div>
        ) : (
          messages.map((msg, i) => (
            <div
              key={`${msg.role}-${i}`}
              className={`local-chat__bubble local-chat__bubble--${msg.role}`}
            >
              {msg.content}
            </div>
          ))
        )}
        <div ref={bottomRef} />
      </div>

      {error ? (
        <p className="error-banner" role="alert">
          {error}
        </p>
      ) : null}

      <div className="local-chat__composer">
        <textarea
          value={input}
          onChange={(e) => setInput(e.target.value)}
          onKeyDown={(e) => {
            if ((e.ctrlKey || e.metaKey) && e.key === "Enter") {
              e.preventDefault();
              void handleSend();
            }
          }}
          placeholder={
            ollamaRunning
              ? `Votre message… (${SEND_SHORTCUT_LABEL} pour envoyer)`
              : "Démarrez Ollama pour chatter"
          }
          aria-keyshortcuts={SEND_SHORTCUT_LABEL}
          disabled={!ollamaRunning || streaming}
          rows={3}
        />
        <div className="local-chat__actions">
          {streaming ? (
            <button type="button" className="btn-secondary" onClick={handleCancel}>
              Arrêter
            </button>
          ) : (
            <button
              type="button"
              className="btn-primary"
              onClick={handleSend}
              disabled={!ollamaRunning || !input.trim()}
            >
              Envoyer
            </button>
          )}
        </div>
      </div>
    </div>
  );
}
