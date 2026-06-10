"use client";

import type { RagCitation } from "@ownmyownai/protocol";
import type { ParsedArtifact } from "@/lib/artifacts";
import type { RelayClient } from "@/lib/relay-client";
import { MarkdownMessage } from "./markdown-message";
import { RagCitationBadges } from "./rag-citation-badges";

export interface ChatMessageData {
  role: "user" | "assistant";
  content: string;
  thinking?: string;
  citations?: RagCitation[];
}

interface ChatMessageProps {
  message: ChatMessageData;
  index: number;
  streaming: boolean;
  messagesLength: number;
  canFork: boolean;
  onFork: () => void;
  onOpenArtifact: (artifact: ParsedArtifact) => void;
  relay: RelayClient | null;
  contextIds: string[];
  connected: boolean;
}

export function ChatMessage({
  message,
  index,
  streaming,
  messagesLength,
  canFork,
  onFork,
  onOpenArtifact,
  relay,
  contextIds,
  connected,
}: ChatMessageProps) {
  if (message.role === "assistant" && !message.content.trim() && !message.thinking?.trim()) {
    return null;
  }

  if (message.role === "user") {
    return (
      <div className="chat-message chat-message--user group">
        <div className="chat-message__bubble chat-message__bubble--user">
          <p className="whitespace-pre-wrap text-[15px] leading-relaxed">{message.content}</p>
        </div>
        {canFork && index < messagesLength - 1 && (
          <button
            type="button"
            onClick={onFork}
            className="chat-message__fork"
            title="Créer une branche à partir de ce message"
          >
            Brancher ici
          </button>
        )}
      </div>
    );
  }

  return (
    <div className="chat-message chat-message--assistant group">
      <div className="chat-message__avatar" aria-hidden>
        O
      </div>
      <div className="chat-message__body">
        {message.thinking?.trim() && (
          <details
            className="chat-message__thinking"
            open={streaming && index === messagesLength - 1}
          >
            <summary>Chaîne de pensée</summary>
            <pre>{message.thinking}</pre>
          </details>
        )}
        {message.content.trim() ? (
          <div className="chat-message__content prose-chat">
            <MarkdownMessage
              content={message.content}
              messageKey={`msg-${index}`}
              onOpenArtifact={onOpenArtifact}
              relay={relay}
              contextIds={contextIds}
              connected={connected}
            />
          </div>
        ) : null}
        {message.citations && message.citations.length > 0 && (
          <RagCitationBadges citations={message.citations} />
        )}
        {canFork && index < messagesLength - 1 && (
          <button
            type="button"
            onClick={onFork}
            className="chat-message__fork chat-message__fork--assistant"
            title="Créer une branche à partir de ce message"
          >
            Brancher ici
          </button>
        )}
      </div>
    </div>
  );
}

export function ChatTypingIndicator({ thinkingMode }: { thinkingMode: boolean }) {
  return (
    <div className="chat-message chat-message--assistant" aria-live="polite">
      <div className="chat-message__avatar" aria-hidden>
        O
      </div>
      <div className="chat-message__body">
        <div className="chat-typing" role="status">
          <span className="chat-typing__dot" />
          <span className="chat-typing__dot" />
          <span className="chat-typing__dot" />
          <span className="sr-only">
            {thinkingMode ? "Pensée en cours" : "Réponse en cours"}
          </span>
        </div>
      </div>
    </div>
  );
}
