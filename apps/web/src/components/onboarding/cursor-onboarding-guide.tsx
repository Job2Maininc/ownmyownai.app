"use client";

import Link from "next/link";
import { useCallback, useState } from "react";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { useToast } from "@/components/ui/toast";
import {
  buildCursorGatewayBaseUrl,
  buildCursorSettingsSnippet,
  CURSOR_TOKEN_PLACEHOLDER,
  DEFAULT_CURSOR_MODEL,
} from "@/lib/cursor-settings-snippet";

interface CursorOnboardingGuideProps {
  hostId?: string | null;
}

export function CursorOnboardingGuide({ hostId }: CursorOnboardingGuideProps) {
  const { toast } = useToast();
  const [copied, setCopied] = useState<"snippet" | "url" | null>(null);
  const baseUrl = buildCursorGatewayBaseUrl();
  const snippet = buildCursorSettingsSnippet();

  const copy = useCallback(
    async (text: string, kind: typeof copied, label: string) => {
      await navigator.clipboard.writeText(text);
      setCopied(kind);
      toast(`${label} copié dans le presse-papiers`);
      window.setTimeout(() => setCopied(null), 2000);
    },
    [toast],
  );

  const chatHref = hostId ? `/chat/${hostId}` : "/dashboard";

  return (
    <Card className="animate-fade-up shadow-glow" style={{ animationDelay: "80ms" }}>
      <div className="mb-4 rounded-xl border border-[color-mix(in_srgb,var(--warn)_35%,var(--border))] bg-[color-mix(in_srgb,var(--warn)_8%,var(--surface))] p-4 text-sm">
        <p className="font-medium text-[var(--foreground)]">Token API — récupération sur le Host</p>
        <p className="mt-1 text-[var(--muted)]">
          Pour des raisons de sécurité, le token Bearer n&apos;est pas exposé sur le web. Ouvrez
          l&apos;application <strong className="text-[var(--foreground)]">Host Windows</strong> →
          onglet <strong className="text-[var(--foreground)]">Cursor</strong>, activez la passerelle,
          puis copiez le token affiché.
        </p>
      </div>

      <p className="mb-4 text-sm text-[var(--muted)]">
        Optionnel mais recommandé si vous codez dans Cursor : la passerelle Host expose une API
        OpenAI-compatible avec le même pipeline que le chat web (RAG, mémoire, règles projet).
      </p>

      <ol className="mb-6 list-decimal space-y-2 pl-5 text-sm text-[var(--muted)]">
        <li>
          Dans l&apos;app Host, ouvrez l&apos;onglet <strong className="text-[var(--foreground)]">Cursor</strong>{" "}
          et activez la passerelle OpenAI locale
        </li>
        <li>
          Copiez le <strong className="text-[var(--foreground)]">token Bearer</strong> généré à
          l&apos;appairage (bouton Copier dans le Host)
        </li>
        <li>
          Dans Cursor : <strong className="text-[var(--foreground)]">Paramètres</strong> (
          <kbd className="rounded border border-[var(--border)] px-1 text-xs">Ctrl+,</kbd>) →{" "}
          <strong className="text-[var(--foreground)]">Models</strong>
        </li>
        <li>
          Activez <strong className="text-[var(--foreground)]">Override OpenAI Base URL</strong>, puis
          collez l&apos;URL ci-dessous et le token du Host
        </li>
        <li>
          Sélectionnez le modèle <code className="text-[var(--foreground)]">{DEFAULT_CURSOR_MODEL}</code>{" "}
          (ou celui installé sur votre Host)
        </li>
      </ol>

      <dl className="space-y-3 rounded-xl border border-[var(--border)] bg-[var(--surface-subtle)] p-4 text-sm">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <dt className="text-xs font-medium uppercase tracking-wide text-[var(--muted)]">
            Base URL
          </dt>
          <dd className="flex flex-wrap items-center gap-2">
            <code className="font-mono text-xs text-[var(--foreground)]">{baseUrl}</code>
            <Button
              type="button"
              variant="secondary"
              className="text-xs"
              onClick={() => void copy(baseUrl, "url", "URL")}
            >
              {copied === "url" ? "Copié" : "Copier"}
            </Button>
          </dd>
        </div>
        <div className="flex flex-wrap items-center justify-between gap-2">
          <dt className="text-xs font-medium uppercase tracking-wide text-[var(--muted)]">
            Clé API (token Host)
          </dt>
          <dd className="flex flex-wrap items-center gap-2">
            <code className="max-w-[14rem] truncate font-mono text-xs text-[var(--muted)]">
              {CURSOR_TOKEN_PLACEHOLDER}
            </code>
          </dd>
        </div>
      </dl>

      <div className="mt-4">
        <p className="mb-2 text-xs font-medium uppercase tracking-wide text-[var(--muted)]">
          Snippet JSON de référence
        </p>
        <pre className="overflow-x-auto rounded-xl border border-[var(--border)] bg-[var(--surface-subtle)] p-4 font-mono text-xs leading-relaxed text-[var(--foreground)]">
          {snippet}
        </pre>
        <Button
          type="button"
          className="mt-3 w-full"
          onClick={() => void copy(snippet, "snippet", "Snippet")}
        >
          {copied === "snippet" ? "Snippet copié !" : "Copier le snippet JSON (sans token)"}
        </Button>
      </div>

      <p className="mt-6 text-xs text-[var(--muted)]">
        <Link href="/cursor" className="link">
          Voir les 3 chemins d&apos;intégration Cursor
        </Link>
        .
      </p>

      <div className="mt-8 flex flex-col gap-2 sm:flex-row">
        <Link href={chatHref} className="flex-1">
          <Button className="w-full">Continuer vers le chat</Button>
        </Link>
        <Link href="/dashboard" className="flex-1">
          <Button variant="secondary" className="w-full">
            Dashboard
          </Button>
        </Link>
      </div>
    </Card>
  );
}
