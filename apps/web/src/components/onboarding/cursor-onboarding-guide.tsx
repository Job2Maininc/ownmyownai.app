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

const HOST_CONFIGURE_DEEP_LINK = "ownmyownai://configure-cursor";

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

  function openHostConfigure() {
    window.location.href = HOST_CONFIGURE_DEEP_LINK;
    toast(
      "Si le Host est installé, il devrait s'ouvrir sur l'onglet Cursor. Sinon, ouvrez-le manuellement.",
    );
  }

  return (
    <Card className="animate-fade-up shadow-glow" style={{ animationDelay: "80ms" }}>
      <div className="mb-6 rounded-xl border border-[color-mix(in_srgb,var(--link)_35%,var(--border))] bg-[color-mix(in_srgb,var(--link)_8%,var(--surface))] p-4 text-sm">
        <p className="font-medium text-[var(--foreground)]">Configuration en un clic — via le Host</p>
        <p className="mt-1 text-[var(--muted)]">
          Le navigateur ne peut pas écrire dans les fichiers Cursor sur votre PC. Utilisez
          l&apos;application <strong className="text-[var(--foreground)]">Host Windows</strong> :
          un bouton applique URL, token et modèle dans{" "}
          <code className="text-[var(--foreground)]">settings.json</code>.
        </p>
        <Button type="button" className="mt-4 w-full" onClick={openHostConfigure}>
          Configurer via le Host
        </Button>
        <p className="mt-2 text-xs text-[var(--muted)]">
          Ouvre <code>{HOST_CONFIGURE_DEEP_LINK}</code> si le protocole est enregistré, sinon ouvrez
          le Host → onglet <strong className="text-[var(--foreground)]">Cursor</strong> →{" "}
          <strong className="text-[var(--foreground)]">Configurer Cursor automatiquement</strong>.
        </p>
      </div>

      <div className="mb-4 rounded-xl border border-[color-mix(in_srgb,var(--warn)_35%,var(--border))] bg-[color-mix(in_srgb,var(--warn)_8%,var(--surface))] p-4 text-sm">
        <p className="font-medium text-[var(--foreground)]">Token API — uniquement sur le Host</p>
        <p className="mt-1 text-[var(--muted)]">
          Pour des raisons de sécurité, le token Bearer n&apos;est jamais exposé sur le web. La
          configuration automatique le lit depuis le keyring du Host.
        </p>
      </div>

      <p className="mb-4 text-sm text-[var(--muted)]">
        <strong className="text-[var(--foreground)]">Fallback manuel</strong> si le Host n&apos;est
        pas disponible : copiez l&apos;URL ci-dessous et le token depuis l&apos;onglet Cursor du
        Host.
      </p>

      <ol className="mb-6 list-decimal space-y-2 pl-5 text-sm text-[var(--muted)]">
        <li>
          Dans l&apos;app Host, onglet <strong className="text-[var(--foreground)]">Cursor</strong>{" "}
          — ou cliquez <strong className="text-[var(--foreground)]">Configurer via le Host</strong>{" "}
          ci-dessus
        </li>
        <li>
          Dans Cursor : <strong className="text-[var(--foreground)]">Paramètres</strong> (
          <kbd className="rounded border border-[var(--border)] px-1 text-xs">Ctrl+,</kbd>) →{" "}
          <strong className="text-[var(--foreground)]">Models</strong>
        </li>
        <li>
          Activez <strong className="text-[var(--foreground)]">Override OpenAI Base URL</strong>, puis
          collez l&apos;URL et le token du Host
        </li>
        <li>
          Sélectionnez le modèle{" "}
          <code className="text-[var(--foreground)]">{DEFAULT_CURSOR_MODEL}</code> (ou celui installé
          sur votre Host)
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

      <details className="mt-4">
        <summary className="cursor-pointer text-xs font-medium uppercase tracking-wide text-[var(--muted)]">
          Snippet JSON de référence (sans token réel)
        </summary>
        <pre className="mt-2 overflow-x-auto rounded-xl border border-[var(--border)] bg-[var(--surface-subtle)] p-4 font-mono text-xs leading-relaxed text-[var(--foreground)]">
          {snippet}
        </pre>
        <Button
          type="button"
          variant="secondary"
          className="mt-3 w-full"
          onClick={() => void copy(snippet, "snippet", "Snippet")}
        >
          {copied === "snippet" ? "Snippet copié !" : "Copier le snippet JSON (sans token)"}
        </Button>
      </details>

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
