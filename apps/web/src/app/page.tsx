import Image from "next/image";
import Link from "next/link";
import { MarketingShell } from "@/components/layout/marketing-shell";
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
    icon: "sparkles",
    title: "Clé en main",
    description: "Installateur, modèles, compte — tout est prêt pour démarrer.",
  },
];

const socialProofPlaceholders = [
  "Équipes produit",
  "Indépendants",
  "Startups locales",
  "Cabinets conseil",
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
              <span className="brand-badge">Gratuit</span>
              <span className="brand-badge">Windows</span>
              <span className="brand-badge">Prêt en 5 min</span>
            </div>
            <h1
              className="mb-5 font-bold leading-[var(--leading-tight)] tracking-[var(--tracking-display)] text-[var(--foreground)]"
              style={{ fontSize: "var(--text-display)" }}
            >
              Votre IA,
              <br />
              <span className="text-gradient-brand">chez vous.</span>
            </h1>
            <p className="mb-8 text-lg leading-relaxed text-[var(--muted)] md:text-xl">
              Une intelligence artificielle simple et privée sur votre PC. Installez, liez,
              discutez — sans complexité.
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

      {/* Étapes */}
      <section className="brand-section-alt px-6 py-20 md:py-24">
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
      <section className="px-6 py-20 md:py-24">
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

      {/* Social proof placeholder */}
      <section className="brand-section-alt px-6 py-16 md:py-20">
        <div className="mx-auto max-w-5xl text-center">
          <p className="section-eyebrow mb-8">Adopté par des équipes exigeantes</p>
          <div className="social-proof-grid">
            {socialProofPlaceholders.map((label) => (
              <div key={label} className="social-proof-placeholder" aria-hidden>
                {label}
              </div>
            ))}
          </div>
          <p className="mt-6 text-sm text-[var(--muted)]">
            Votre IA locale, sans compromis sur la confidentialité.
          </p>
        </div>
      </section>

      {/* CTA final */}
      <section className="px-6 py-20 md:py-24">
        <div className="mx-auto max-w-2xl animate-fade-up">
          <div className="cta-panel rounded-2xl border border-[var(--border)] bg-[var(--surface)] p-10 text-center shadow-glow md:p-12">
            <h2 className="mb-3 text-2xl font-bold tracking-tight md:text-3xl">Prêt à essayer ?</h2>
            <p className="mb-8 text-[var(--muted)]">
              Rejoignez ceux qui gardent leur IA chez eux — en toute simplicité.
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
