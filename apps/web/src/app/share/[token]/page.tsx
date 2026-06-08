"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { useParams } from "next/navigation";
import type { ShareMessage } from "@ownmyownai/protocol";
import { AppHeader } from "@/components/layout/app-header";
import { MarkdownMessage } from "@/components/chat/markdown-message";
import { Card } from "@/components/ui/card";
import { getConversationShare } from "@/lib/share";

export default function SharePage() {
  const params = useParams();
  const token = typeof params.token === "string" ? params.token : "";
  const [title, setTitle] = useState<string | null>(null);
  const [messages, setMessages] = useState<ShareMessage[]>([]);
  const [expiresAt, setExpiresAt] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [expired, setExpired] = useState(false);

  useEffect(() => {
    if (!token) {
      setError("Lien invalide");
      setLoading(false);
      return;
    }

    let cancelled = false;

    async function load() {
      try {
        const data = await getConversationShare(token);
        if (cancelled) return;
        setTitle(data.title);
        setMessages(data.messages);
        setExpiresAt(data.expires_at);
      } catch (e) {
        if (cancelled) return;
        const err = e as Error & { expired?: boolean };
        setExpired(Boolean(err.expired));
        setError(err.message);
      } finally {
        if (!cancelled) setLoading(false);
      }
    }

    void load();
    return () => {
      cancelled = true;
    };
  }, [token]);

  return (
    <AppHeader>
      <main className="mx-auto min-h-screen max-w-3xl px-4 py-8">
        <Link href="/" className="mb-6 inline-block text-sm text-brand-500 hover:underline">
          ← OwnMyOwnAI
        </Link>

        {loading && <p className="text-[var(--muted)]">Chargement…</p>}

        {!loading && error && (
          <Card>
            <h1 className="mb-2 text-xl font-semibold">
              {expired ? "Lien expiré" : "Lien indisponible"}
            </h1>
            <p className="text-sm text-[var(--muted)]">{error}</p>
          </Card>
        )}

        {!loading && !error && (
          <>
            <header className="mb-6 border-b border-[var(--border)] pb-4">
              <h1 className="text-xl font-semibold">{title}</h1>
              <p className="mt-1 text-xs text-[var(--muted)]">
                Lecture seule — contenu conversation uniquement
                {expiresAt && (
                  <>
                    {" "}
                    · expire le {new Date(expiresAt).toLocaleString("fr-FR")}
                  </>
                )}
              </p>
            </header>

            <div className="space-y-4">
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
                    <MarkdownMessage content={msg.content} messageKey={`share-${i}`} />
                  ) : (
                    <p className="whitespace-pre-wrap text-sm">{msg.content}</p>
                  )}
                </div>
              ))}
            </div>
          </>
        )}
      </main>
    </AppHeader>
  );
}
