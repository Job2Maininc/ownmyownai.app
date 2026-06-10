"use client";

import { useRef, useEffect } from "react";
import { Button } from "@/components/ui/button";

interface ChatComposerProps {
  value: string;
  onChange: (value: string) => void;
  onSubmit: () => void;
  onStop: () => void;
  streaming: boolean;
  canSend: boolean;
  sendShortcutLabel: string;
  mentionHint?: string | null;
}

export function ChatComposer({
  value,
  onChange,
  onSubmit,
  onStop,
  streaming,
  canSend,
  sendShortcutLabel,
  mentionHint,
}: ChatComposerProps) {
  const textareaRef = useRef<HTMLTextAreaElement>(null);

  useEffect(() => {
    const el = textareaRef.current;
    if (!el) return;
    el.style.height = "auto";
    el.style.height = `${Math.min(el.scrollHeight, 200)}px`;
  }, [value]);

  function handleKeyDown(e: React.KeyboardEvent<HTMLTextAreaElement>) {
    if ((e.ctrlKey || e.metaKey) && e.key === "Enter") {
      e.preventDefault();
      if (!streaming && canSend && value.trim()) onSubmit();
    }
  }

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (streaming) {
      onStop();
      return;
    }
    if (canSend && value.trim()) onSubmit();
  }

  return (
    <div className="chat-composer-wrap">
      {mentionHint && <p className="chat-composer__hint">{mentionHint}</p>}
      <form onSubmit={handleSubmit} className="chat-composer">
        <textarea
          ref={textareaRef}
          value={value}
          onChange={(e) => onChange(e.target.value)}
          onKeyDown={handleKeyDown}
          placeholder={`Posez une question… (${sendShortcutLabel})`}
          disabled={streaming ? false : !canSend}
          rows={1}
          aria-keyshortcuts={sendShortcutLabel}
          className="chat-composer__input"
        />
        <div className="chat-composer__actions">
          {streaming ? (
            <Button type="submit" variant="secondary" className="chat-composer__btn !px-3 !py-2">
              Arrêter
            </Button>
          ) : (
            <Button
              type="submit"
              disabled={!canSend || !value.trim()}
              className="chat-composer__btn !px-3 !py-2"
              aria-label="Envoyer"
            >
              <svg
                width="16"
                height="16"
                viewBox="0 0 24 24"
                fill="none"
                stroke="currentColor"
                strokeWidth="2"
                strokeLinecap="round"
                strokeLinejoin="round"
                aria-hidden
              >
                <path d="M12 19V5M5 12l7-7 7 7" />
              </svg>
            </Button>
          )}
        </div>
      </form>
      <p className="chat-composer__disclaimer">
        Les réponses sont générées localement sur votre PC. Vérifiez les informations importantes.
      </p>
    </div>
  );
}
