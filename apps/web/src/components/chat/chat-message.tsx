"use client";

import type { ChatAgentStepPayload, RagCitation } from "@ownmyownai/protocol";
import type { ParsedArtifact } from "@/lib/artifacts";
import type { RelayClient } from "@/lib/relay-client";
import { MarkdownMessage } from "./markdown-message";
import { RagCitationBadges } from "./rag-citation-badges";

export interface ChatMessageData {
  role: "user" | "assistant";
  content: string;
  thinking?: string;
  agentSteps?: ChatAgentStepPayload[];
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

function agentStepStatusLabel(status: ChatAgentStepPayload["status"]): string {
  switch (status) {
    case "done":
      return "Terminé";
    case "error":
      return "Erreur";
    default:
      return "En cours";
  }
}

function AgentStepList({
  steps,
  streaming,
}: {
  steps: ChatAgentStepPayload[];
  streaming: boolean;
}) {
  if (steps.length === 0) return null;

  const maxSteps = steps.reduce((max, s) => Math.max(max, s.maxSteps), 1);
  const latestStep = steps.reduce((max, s) => (s.step > max ? s.step : max), 0);

  return (
    <div className="chat-message__agent-steps" aria-live={streaming ? "polite" : undefined}>
      <p className="chat-message__agent-steps-title">
        Étapes agent ({latestStep}/{maxSteps})
      </p>
      <ol className="chat-message__agent-steps-list">
        {steps.map((step, i) => {
          const isLast = i === steps.length - 1;
          const isActive = streaming && isLast && step.status === "running";
          return (
            <li
              key={`${step.step}-${step.tool}-${i}`}
              className={`chat-message__agent-step chat-message__agent-step--${step.status}${
                isActive ? " chat-message__agent-step--active" : ""
              }`}
            >
              <span className="chat-message__agent-step-index" aria-hidden>
                {step.step}
              </span>
              <span className="chat-message__agent-step-tool">{step.tool}</span>
              <span className="chat-message__agent-step-status">
                {agentStepStatusLabel(step.status)}
              </span>
            </li>
          );
        })}
      </ol>
    </div>
  );
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
  const hasAgentSteps = (message.agentSteps?.length ?? 0) > 0;

  if (
    message.role === "assistant" &&
    !message.content.trim() &&
    !message.thinking?.trim() &&
    !hasAgentSteps
  ) {
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

  const isStreamingMessage = streaming && index === messagesLength - 1;

  return (
    <div className="chat-message chat-message--assistant group">
      <div className="chat-message__avatar" aria-hidden>
        <span className="chat-message__avatar-mark">O</span>
      </div>
      <div className="chat-message__body">
        {message.thinking?.trim() && (
          <details
            className="chat-message__thinking"
            open={isStreamingMessage}
          >
            <summary>Chaîne de pensée</summary>
            <pre>{message.thinking}</pre>
          </details>
        )}
        {hasAgentSteps && message.agentSteps && (
          <AgentStepList steps={message.agentSteps} streaming={isStreamingMessage} />
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
        <span className="chat-message__avatar-mark">O</span>
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
