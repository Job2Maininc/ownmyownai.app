import Image from "next/image";
import Link from "next/link";
import { MarketingShell } from "@/components/layout/marketing-shell";
import { FaqAccordion } from "@/components/marketing/faq-accordion";
import { FeatureIcon, type IconName } from "@/components/ui/icon";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { createClient } from "@/lib/supabase/server";

export const dynamic = "force-dynamic";

const steps: { step: string; icon: IconName; title: string; description: string }[] = [
  {
    step: "01",
    icon: "download",
    title: "Installez",
    description: "Téléchargez le Host Windows — c'est gratuit et guidé.",
  },
  {
    step: "02",
    icon: "link",
    title: "Liez",
    description: "Connectez-vous et associez votre PC en un clic.",
  },
  {
    step: "03",
    icon: "message",
    title: "Discutez",
    description: "Chattez depuis le navigateur. L'IA tourne chez vous.",
  },
];

const valueProps: { icon: IconName; title: string; description: string }[] = [
  {
    icon: "git-branch",
    title: "Cursor",
    description:
      "Gardez votre IDE habituel. Le Host relie vos projets et outils locaux au chat web.",
  },
  {
    icon: "sparkles",
    title: "0 crédit",
    description:
      "Les modèles tournent sur votre PC via Ollama — aucune consommation de crédits cloud.",
  },
  {
    icon: "folder",
    title: "RAG local",
    description:
      "Indexez fichiers, dossiers et dépôts Git chez vous. Citations et contexte, sans upload.",
  },
];

const benefits: { icon: IconName; title: string; description: string }[] = [
  {
    icon: "home",
    title: "Chez vous",
    description: "Vos données et votre IA restent sur votre ordinateur.",
  },
  {
    icon: "lock",
    title: "Privé",
    description: "Rien n'est envoyé aux grands clouds sans votre accord.",
  },
  {
    icon: "monitor",
    title: "Host Windows",
    description: "Installateur, modèles, liaison compte — prêt en quelques minutes.",
  },
];

const socialProofPlaceholders = [
  "Données 100 % locales",
  "Open source friendly",
  "Sans crédit cloud",
  "RGPD-ready",
];

const homeFaq = [
  {
    question: "Mes données partent-elles sur Internet ?",
    answer:
      "Non pour l'inférence locale : les modèles Ollama tournent sur votre PC. Seuls le compte (magic link) et le heartbeat de statut passent par Supabase — jamais le contenu de vos chats.",
  },
  {
    question: "Combien de temps pour démarrer ?",
    answer:
      "Environ 5 minutes : télécharger le Host, créer un compte, lier le PC avec un code, puis ouvrir le chat web.",
  },
  {
    question: "Puis-je utiliser Cursor sans changer mes habitudes ?",
    answer:
      "Oui. Connectez Cursor à Ollama ou à la passerelle Host pour garder votre IDE tout en bénéficiant du RAG local OwnMyOwnAI.",
  },
];

export default async function HomePage() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  return (
    <MarketingShell>
      {/* Hero */}
      <section className="brand-hero-gradient px-6 pb-20 pt-14 md:pb-28 md:pt-20">
        <div className="mx-auto flex max-w-5xl flex-col items-center gap-12 md:flex-row md:items-center md:justify-between md:gap-16">
          <div className="max-w-xl animate-fade-up text-center md:text-left">
            <div className="mb-6 flex flex-wrap justify-center gap-2 md:justify-start">
              <span className="brand-badge">Cursor + Host</span>
              <span className="brand-badge">0 crédit</span>
              <span className="brand-badge">RAG local</span>
            </div>
            <h1
              className="mb-5 font-bold leading-[var(--leading-tight)] tracking-[var(--tracking-display)] text-[var(--foreground)]"
              style={{ fontSize: "var(--text-display)" }}
            >
              Cursor + Host
              <br />
              <span className="text-gradient-brand">= 0 crédit + RAG local</span>
            </h1>
            <p className="mb-8 text-lg leading-relaxed text-[var(--muted)] md:text-xl">
              Codez avec Cursor, discutez depuis le navigateur. L&apos;IA et vos documents
              tournent sur votre PC — sans consommer vos crédits cloud.
            </p>
            <div className="flex flex-col items-center gap-3 sm:flex-row md:justify-start">
              <Link href="/download">
                <Button size="lg">Installer gratuitement</Button>
              </Link>
              {user ? (
                <Link href="/dashboard">
                  <Button size="lg" variant="secondary">
                    Mon tableau de bord
                  </Button>
                </Link>
              ) : (
                <Link href="/login">
                  <Button size="lg" variant="secondary">
                    J&apos;ai déjà un compte
                  </Button>
                </Link>
              )}
            </div>
          </div>
          <div
            className="hero-image-frame w-full max-w-md animate-fade-up"
            style={{ animationDelay: "120ms" }}
          >
            <Image
              src="/brand/hero.png"
              alt="Personne utilisant son IA depuis chez elle, dans un cadre lumineux et accueillant"
              width={960}
              height={540}
              className="h-auto w-full"
              priority
            />
          </div>
        </div>
      </section>

      {/* Proposition de valeur */}
      <section className="brand-section-alt px-6 py-20 md:py-24">
        <div className="mx-auto max-w-5xl">
          <div className="section-header mb-12 text-center">
            <p className="section-eyebrow">La formule</p>
            <h2 className="section-title">Cursor + Host = 0 crédit + RAG local</h2>
            <p className="section-subtitle">
              Trois briques complémentaires pour une IA de code privée, sans facture cloud.
            </p>
          </div>
          <div
            className="mb-12 flex flex-wrap items-center justify-center gap-2 text-center font-mono text-sm font-semibold tracking-tight sm:gap-3 sm:text-base md:text-lg"
            aria-label="Cursor plus Host égale zéro crédit plus RAG local"
          >
            <span className="rounded-lg border border-[var(--border)] bg-[var(--surface)] px-4 py-2.5 shadow-xs">
              Cursor
            </span>
            <span className="text-[var(--muted)]" aria-hidden>
              +
            </span>
            <span className="rounded-lg border border-[var(--border)] bg-[var(--surface)] px-4 py-2.5 shadow-xs">
              Host
            </span>
            <span className="text-[var(--link)]" aria-hidden>
              =
            </span>
            <span className="rounded-lg border border-[color-mix(in_srgb,var(--link)_25%,var(--border))] bg-[color-mix(in_srgb,var(--link)_8%,var(--surface))] px-4 py-2.5 text-[var(--link)] shadow-xs">
              0 crédit
            </span>
            <span className="text-[var(--muted)]" aria-hidden>
              +
            </span>
            <span className="rounded-lg border border-[color-mix(in_srgb,var(--link)_25%,var(--border))] bg-[color-mix(in_srgb,var(--link)_8%,var(--surface))] px-4 py-2.5 text-[var(--link)] shadow-xs">
              RAG local
            </span>
          </div>
          <div className="stagger-children grid gap-5 md:grid-cols-3">
            {valueProps.map((prop) => (
              <Card key={prop.title} interactive>
                <FeatureIcon name={prop.icon} />
                <h3 className="mb-2 text-lg font-semibold tracking-tight">{prop.title}</h3>
                <p className="text-sm leading-relaxed text-[var(--muted)]">{prop.description}</p>
              </Card>
            ))}
          </div>
        </div>
      </section>

      {/* Étapes */}
      <section className="px-6 py-20 md:py-24">
        <div className="mx-auto max-w-5xl">
          <div className="section-header mb-12 text-center">
            <p className="section-eyebrow">Démarrage rapide</p>
            <h2 className="section-title">Trois étapes, c&apos;est tout</h2>
            <p className="section-subtitle">
              Pas de ligne de commande. Pas de configuration compliquée.
            </p>
          </div>
          <div className="stagger-children grid gap-5 md:grid-cols-3">
            {steps.map((step) => (
              <Card key={step.title} interactive className="relative text-center">
                <span className="absolute right-4 top-4 font-mono text-xs font-medium text-[var(--muted)] opacity-40">
                  {step.step}
                </span>
                <FeatureIcon name={step.icon} className="mx-auto" />
                <h3 className="mb-2 text-lg font-semibold tracking-tight">{step.title}</h3>
                <p className="text-sm leading-relaxed text-[var(--muted)]">{step.description}</p>
              </Card>
            ))}
          </div>
        </div>
      </section>

      {/* Avantages */}
      <section className="brand-section-alt px-6 py-20 md:py-24">
        <div className="mx-auto max-w-5xl">
          <div className="section-header mb-12 text-center">
            <h2 className="section-title">Pourquoi OwnMyOwnAI ?</h2>
          </div>
          <div className="stagger-children grid gap-5 md:grid-cols-3">
            {benefits.map((benefit) => (
              <Card key={benefit.title} interactive>
                <FeatureIcon name={benefit.icon} />
                <h3 className="mb-2 text-lg font-semibold tracking-tight">{benefit.title}</h3>
                <p className="text-sm leading-relaxed text-[var(--muted)]">{benefit.description}</p>
              </Card>
            ))}
          </div>
        </div>
      </section>

      {/* Confiance */}
      <section className="px-6 py-16 md:py-20">
        <div className="mx-auto max-w-5xl text-center">
          <p className="section-eyebrow mb-8">Pourquoi nous faire confiance</p>
          <div className="social-proof-grid">
            {socialProofPlaceholders.map((label) => (
              <div key={label} className="social-proof-placeholder" aria-hidden>
                {label}
              </div>
            ))}
          </div>
          <p className="mt-6 text-sm text-[var(--muted)]">
            Vos conversations restent sur votre machine · Token gateway local · Chiffrement des
            credentials Host
          </p>
        </div>
      </section>

      <FaqAccordion items={homeFaq} />

      {/* CTA final */}
      <section className="px-6 py-20 md:py-24">
        <div className="mx-auto max-w-2xl animate-fade-up">
          <div className="cta-panel rounded-2xl border border-[var(--border)] bg-[var(--surface)] p-10 text-center shadow-glow md:p-12">
            <h2 className="mb-3 text-2xl font-bold tracking-tight md:text-3xl">Prêt à essayer ?</h2>
            <p className="mb-8 text-[var(--muted)]">
              Installez le Host, liez Cursor à vos projets et discutez avec un RAG 100 % local.
            </p>
            <Link href="/download">
              <Button size="lg">Télécharger le Host</Button>
            </Link>
          </div>
        </div>
      </section>
    </MarketingShell>
  );
}
