import type { Metadata } from "next";
import Link from "next/link";
import { MarketingShell } from "@/components/layout/marketing-shell";
import { FaqAccordion } from "@/components/marketing/faq-accordion";
import { FeatureIcon, type IconName } from "@/components/ui/icon";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";

export const dynamic = "force-dynamic";

export const metadata: Metadata = {
  title: "Cursor + OwnMyOwnAI — 3 chemins d'intégration",
  description:
    "Connectez Cursor à votre IA locale : Ollama direct, passerelle OpenAI du Host, ou MCP pour le contexte OMOA.",
};

type IntegrationPath = {
  id: string;
  step: string;
  icon: IconName;
  badge: string;
  badgeTone: "ready" | "recommended" | "complement";
  title: string;
  summary: string;
  whenToUse: string;
  ragRules: "non" | "oui" | "complement";
  status: string;
  steps: string[];
  snippet: { label: string; code: string };
};

const paths: IntegrationPath[] = [
  {
    id: "ollama",
    step: "01",
    icon: "brain",
    badge: "Immédiat",
    badgeTone: "ready",
    title: "Ollama direct",
    summary:
      "Cursor parle directement à Ollama sur votre PC — le plus rapide pour remplacer les modèles cloud.",
    whenToUse:
      "Vous voulez 0 crédit Cursor tout de suite, sans configurer le Host. Ollama doit déjà tourner (installé seul ou via le Host).",
    ragRules: "non",
    status: "Disponible dès qu'Ollama écoute sur le port 11434.",
    steps: [
      "Ouvrez Cursor → Settings → Models.",
      "Activez « Override OpenAI Base URL » et saisissez l'URL ci-dessous.",
      "Clé API : une valeur arbitraire (ex. ollama).",
      "Choisissez un modèle déjà installé (ollama list ou panneau Host).",
    ],
    snippet: {
      label: "Configuration Cursor",
      code: `Base URL : http://127.0.0.1:11434/v1
API Key  : ollama
Modèle   : llama3.2:3b`,
    },
  },
  {
    id: "gateway",
    step: "02",
    icon: "monitor",
    badge: "Recommandé",
    badgeTone: "recommended",
    title: "Passerelle OMOA (gateway Host)",
    summary:
      "Cursor utilise une API OpenAI-compatible exposée par le Host — même pipeline que le chat web (RAG, règles, file d'attente).",
    whenToUse:
      "Vous voulez le contexte OwnMyOwnAI (.cursorrules, bases liées, mémoire) directement dans Cursor, sans envoyer vos fichiers au cloud.",
    ragRules: "oui",
    status:
      "Disponible — GET /v1/models, POST /v1/chat/completions (SSE), auth Bearer et rate limiting actifs. Activez la passerelle dans l'onglet Cursor du Host.",
    steps: [
      "Installez et liez le Host Windows (pairing).",
      "Activez « Gateway Cursor » dans les paramètres Host (port par défaut 8765).",
      "Dans Cursor → Settings → Models, pointez vers l'URL locale du gateway.",
      "Utilisez le token Bearer généré par le Host comme clé API.",
    ],
    snippet: {
      label: "Configuration Cursor",
      code: `Base URL : http://127.0.0.1:8765/v1
API Key  : <token Host cursorApiToken>
Modèle   : <modèle configuré dans le Host>`,
    },
  },
  {
    id: "mcp",
    step: "03",
    icon: "folder",
    badge: "Complément",
    badgeTone: "complement",
    title: "Serveur MCP OMOA",
    summary:
      "Exposez le contexte local (recherche RAG, lecture de fichiers, arborescence) à Cursor via le protocole MCP — en complément du chemin 1 ou 2.",
    whenToUse:
      "Vous codez dans Cursor et voulez que l'agent interroge vos bases indexées, lise des fichiers liés ou liste un dossier sandboxé — sans quitter l'IDE.",
    ragRules: "complement",
    status:
      "Serveurs MCP côté Host actifs pour le chat web ; package stdio dédié Cursor (omoa-mcp-server) prévu en phase P1.",
    steps: [
      "Liez vos dossiers ou dépôts Git dans le Host (contexte RAG).",
      "Configurez les serveurs MCP dans settings.json ou l'UI Host.",
      "Ajoutez le serveur OMOA dans .cursor/mcp.json (assistant « Ajouter à Cursor » à venir).",
      "Combinez avec Ollama direct ou la passerelle pour l'inférence + outils contexte.",
    ],
    snippet: {
      label: "Exemple .cursor/mcp.json (à venir)",
      code: `{
  "mcpServers": {
    "ownmyownai": {
      "command": "npx",
      "args": ["-y", "@ownmyownai/mcp-server"]
    }
  }
}`,
    },
  },
];

const badgeClass: Record<IntegrationPath["badgeTone"], string> = {
  ready: "border-[color-mix(in_srgb,var(--link)_30%,var(--border))] text-[var(--link)]",
  recommended:
    "border-[color-mix(in_srgb,#16a34a_35%,var(--border))] text-[color-mix(in_srgb,#16a34a_90%,var(--foreground))]",
  complement: "border-[var(--border)] text-[var(--muted)]",
};

const cursorFaq = [
  {
    question: "Où trouver le token API pour la passerelle ?",
    answer:
      "Dans l'application Host Windows, onglet Cursor — généré à l'appairage. Le token n'est jamais exposé sur le web pour des raisons de sécurité.",
  },
  {
    question: "La passerelle est-elle sécurisée ?",
    answer:
      "Oui : écoute localhost par défaut, authentification Bearer obligatoire sur /v1/*, et rate limiting par token. Activez le mode LAN uniquement si vous comprenez les risques réseau.",
  },
  {
    question: "Quel chemin choisir pour débuter ?",
    answer:
      "Ollama direct si vous voulez tester en 2 minutes. La passerelle Host dès que vous voulez le RAG, la mémoire et les règles projet OwnMyOwnAI dans Cursor.",
  },
];

const ragLabel: Record<IntegrationPath["ragRules"], string> = {
  non: "Non — contourne le Host",
  oui: "Oui — pipeline complet Host",
  complement: "Oui — outils contexte en plus",
};

function CodeBlock({ label, code }: { label: string; code: string }) {
  return (
    <div className="mt-6">
      <p className="mb-2 text-xs font-medium uppercase tracking-wide text-[var(--muted)]">
        {label}
      </p>
      <pre className="overflow-x-auto rounded-xl border border-[var(--border)] bg-[var(--surface-subtle)] p-4 font-mono text-xs leading-relaxed text-[var(--foreground)]">
        {code}
      </pre>
    </div>
  );
}

export default function CursorPage() {
  return (
    <MarketingShell>
      <section className="brand-hero-gradient px-6 pb-12 pt-14 md:pt-20">
        <div className="mx-auto max-w-3xl animate-fade-up text-center">
          <span className="brand-badge mb-6">Cursor + Host</span>
          <h1
            className="mb-5 font-bold leading-[var(--leading-tight)] tracking-[var(--tracking-display)] text-[var(--foreground)]"
            style={{ fontSize: "var(--text-display)" }}
          >
            Trois chemins pour
            <br />
            <span className="text-gradient-brand">brancher Cursor</span>
          </h1>
          <p className="mx-auto max-w-2xl text-lg leading-relaxed text-[var(--muted)]">
            Gardez votre IDE habituel et faites tourner l&apos;inférence sur votre PC. Choisissez
            la voie qui correspond à votre niveau de configuration — du plus simple au plus
            intégré.
          </p>
        </div>
      </section>

      <section className="mx-auto max-w-4xl px-6 pb-8">
        <Card className="animate-fade-up text-center" style={{ animationDelay: "60ms" }}>
          <p className="text-sm leading-relaxed text-[var(--muted)]">
            <strong className="font-medium text-[var(--foreground)]">Ollama direct</strong> pour
            démarrer en 2 minutes ·{" "}
            <strong className="font-medium text-[var(--foreground)]">Passerelle Host</strong> pour
            RAG et règles projet ·{" "}
            <strong className="font-medium text-[var(--foreground)]">MCP</strong> pour exposer le
            contexte OMOA à l&apos;agent Cursor.
          </p>
        </Card>
      </section>

      <section className="brand-section-alt px-6 py-16 md:py-20">
        <div className="mx-auto max-w-4xl space-y-8">
          {paths.map((path, index) => (
            <Card
              key={path.id}
              id={path.id}
              className="animate-fade-up scroll-mt-24"
              style={{ animationDelay: `${80 + index * 60}ms` }}
            >
              <div className="flex flex-wrap items-start justify-between gap-4">
                <div className="flex items-start gap-4">
                  <FeatureIcon name={path.icon} />
                  <div>
                    <div className="mb-2 flex flex-wrap items-center gap-2">
                      <span className="font-mono text-xs text-[var(--muted)]">{path.step}</span>
                      <span
                        className={`rounded-full border px-2.5 py-0.5 text-xs font-medium ${badgeClass[path.badgeTone]}`}
                      >
                        {path.badge}
                      </span>
                    </div>
                    <h2 className="text-xl font-semibold tracking-tight">{path.title}</h2>
                    <p className="mt-2 max-w-2xl text-sm leading-relaxed text-[var(--muted)]">
                      {path.summary}
                    </p>
                  </div>
                </div>
              </div>

              <dl className="mt-6 grid gap-3 border-t border-[var(--border)] pt-6 text-sm sm:grid-cols-2">
                <div>
                  <dt className="text-xs font-medium uppercase tracking-wide text-[var(--muted)]">
                    Quand l&apos;utiliser
                  </dt>
                  <dd className="mt-1 leading-relaxed text-[var(--foreground)]">
                    {path.whenToUse}
                  </dd>
                </div>
                <div>
                  <dt className="text-xs font-medium uppercase tracking-wide text-[var(--muted)]">
                    RAG &amp; règles OMOA
                  </dt>
                  <dd className="mt-1 leading-relaxed text-[var(--foreground)]">
                    {ragLabel[path.ragRules]}
                  </dd>
                </div>
              </dl>

              <p className="mt-4 text-sm text-[var(--muted)]">
                <span className="font-medium text-[var(--foreground)]">Statut : </span>
                {path.status}
              </p>

              <ol className="mt-6 list-decimal space-y-2 pl-5 text-sm leading-relaxed text-[var(--muted)]">
                {path.steps.map((step) => (
                  <li key={step}>{step}</li>
                ))}
              </ol>

              <CodeBlock label={path.snippet.label} code={path.snippet.code} />
            </Card>
          ))}
        </div>
      </section>

      <section className="px-6 py-16 md:py-20">
        <div className="mx-auto max-w-3xl">
          <div className="section-header mb-8 text-center">
            <h2 className="section-title">Quel chemin choisir ?</h2>
          </div>
          <div className="overflow-x-auto rounded-2xl border border-[var(--border)]">
            <table className="w-full min-w-[32rem] text-left text-sm">
              <thead>
                <tr className="border-b border-[var(--border)] bg-[var(--surface-subtle)]">
                  <th className="px-4 py-3 font-semibold">Critère</th>
                  <th className="px-4 py-3 font-semibold">Ollama direct</th>
                  <th className="px-4 py-3 font-semibold">Gateway Host</th>
                  <th className="px-4 py-3 font-semibold">MCP</th>
                </tr>
              </thead>
              <tbody className="text-[var(--muted)]">
                <tr className="border-b border-[var(--border)]">
                  <td className="px-4 py-3 font-medium text-[var(--foreground)]">Setup</td>
                  <td className="px-4 py-3">~2 min</td>
                  <td className="px-4 py-3">Host + pairing</td>
                  <td className="px-4 py-3">Config MCP</td>
                </tr>
                <tr className="border-b border-[var(--border)]">
                  <td className="px-4 py-3 font-medium text-[var(--foreground)]">0 crédit Cursor</td>
                  <td className="px-4 py-3">Oui</td>
                  <td className="px-4 py-3">Oui</td>
                  <td className="px-4 py-3">— (complément)</td>
                </tr>
                <tr className="border-b border-[var(--border)]">
                  <td className="px-4 py-3 font-medium text-[var(--foreground)]">RAG local</td>
                  <td className="px-4 py-3">Non</td>
                  <td className="px-4 py-3">Oui</td>
                  <td className="px-4 py-3">Oui (outils)</td>
                </tr>
                <tr>
                  <td className="px-4 py-3 font-medium text-[var(--foreground)]">.cursorrules</td>
                  <td className="px-4 py-3">Natif Cursor</td>
                  <td className="px-4 py-3">+ règles Host liées</td>
                  <td className="px-4 py-3">Via contexte indexé</td>
                </tr>
              </tbody>
            </table>
          </div>
        </div>
      </section>

      <FaqAccordion items={cursorFaq} subtitle="Intégration Cursor et passerelle Host" />

      <section className="brand-section-alt px-6 py-16 md:py-20">
        <div className="mx-auto max-w-2xl animate-fade-up">
          <div className="cta-panel rounded-2xl border border-[var(--border)] bg-[var(--surface)] p-10 text-center shadow-soft">
            <h2 className="mb-3 text-2xl font-bold tracking-tight">Pas encore de Host ?</h2>
            <p className="mb-8 text-[var(--muted)]">
              Installez le Host Windows pour activer la passerelle et le MCP. En attendant, Ollama
              direct suffit pour coder sans crédits cloud.
            </p>
            <div className="flex flex-col items-center justify-center gap-3 sm:flex-row">
              <Link href="/download">
                <Button size="lg">Télécharger le Host</Button>
              </Link>
              <Link href="#ollama">
                <Button size="lg" variant="secondary">
                  Voir Ollama direct
                </Button>
              </Link>
            </div>
          </div>
        </div>
      </section>
    </MarketingShell>
  );
}
