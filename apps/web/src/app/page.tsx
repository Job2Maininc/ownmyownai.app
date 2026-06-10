import Image from "next/image";
import Link from "next/link";
import { MarketingShell } from "@/components/layout/marketing-shell";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { createClient } from "@/lib/supabase/server";

export const dynamic = "force-dynamic";

const steps = [
  {
    emoji: "⬇️",
    title: "Installez",
    description: "Téléchargez le Host Windows — c'est gratuit et guidé.",
  },
  {
    emoji: "🔗",
    title: "Liez",
    description: "Connectez-vous et associez votre PC en un clic.",
  },
  {
    emoji: "💬",
    title: "Discutez",
    description: "Chattez depuis le navigateur. L'IA tourne chez vous.",
  },
];

const benefits = [
  {
    emoji: "🏠",
    title: "Chez vous",
    description: "Vos données et votre IA restent sur votre ordinateur.",
  },
  {
    emoji: "🔒",
    title: "Privé",
    description: "Rien n'est envoyé aux grands clouds sans votre accord.",
  },
  {
    emoji: "✨",
    title: "Clé en main",
    description: "Installateur, modèles, compte — tout est prêt pour démarrer.",
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
      <section className="brand-hero-gradient px-6 pb-16 pt-12 md:pb-24 md:pt-16">
        <div className="mx-auto flex max-w-5xl flex-col items-center gap-10 md:flex-row md:items-center md:justify-between md:gap-14">
          <div className="max-w-xl text-center md:text-left">
            <div className="mb-5 flex flex-wrap justify-center gap-2 md:justify-start">
              <span className="brand-badge">Gratuit</span>
              <span className="brand-badge">Windows</span>
              <span className="brand-badge">Prêt en 5 min</span>
            </div>
            <h1 className="mb-5 text-4xl font-bold leading-[1.15] tracking-tight text-[var(--foreground)] md:text-5xl lg:text-[3.25rem]">
              Votre IA,
              <br />
              <span className="text-brand-500">chez vous.</span>
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
          <Image
            src="/brand/hero-illustration.svg"
            alt="Illustration : une maison connectée sur votre PC"
            width={400}
            height={320}
            className="w-full max-w-xs drop-shadow-card md:max-w-sm"
            priority
          />
        </div>
      </section>

      {/* Étapes */}
      <section className="brand-section-alt px-6 py-16 md:py-20">
        <div className="mx-auto max-w-5xl">
          <h2 className="mb-3 text-center text-2xl font-bold md:text-3xl">
            Trois étapes, c&apos;est tout
          </h2>
          <p className="mb-10 text-center text-[var(--muted)]">
            Pas de ligne de commande. Pas de configuration compliquée.
          </p>
          <div className="grid gap-5 md:grid-cols-3">
            {steps.map((step) => (
              <Card key={step.title} className="text-center">
                <span className="mb-3 block text-3xl" aria-hidden>
                  {step.emoji}
                </span>
                <h3 className="mb-2 text-lg font-semibold">{step.title}</h3>
                <p className="text-sm leading-relaxed text-[var(--muted)]">{step.description}</p>
              </Card>
            ))}
          </div>
        </div>
      </section>

      {/* Avantages */}
      <section className="px-6 py-16 md:py-20">
        <div className="mx-auto max-w-5xl">
          <h2 className="mb-10 text-center text-2xl font-bold md:text-3xl">
            Pourquoi OwnMyOwnAI ?
          </h2>
          <div className="grid gap-5 md:grid-cols-3">
            {benefits.map((benefit) => (
              <Card key={benefit.title}>
                <span className="mb-2 block text-2xl" aria-hidden>
                  {benefit.emoji}
                </span>
                <h3 className="mb-2 text-lg font-semibold text-brand-600">{benefit.title}</h3>
                <p className="text-sm leading-relaxed text-[var(--muted)]">{benefit.description}</p>
              </Card>
            ))}
          </div>
        </div>
      </section>

      {/* CTA final */}
      <section className="brand-section-alt px-6 py-16 md:py-20">
        <div className="mx-auto max-w-2xl rounded-lg border border-[var(--border)] bg-[var(--surface)] p-10 text-center shadow-card">
          <h2 className="mb-3 text-2xl font-bold md:text-3xl">Prêt à essayer ?</h2>
          <p className="mb-8 text-[var(--muted)]">
            Rejoignez ceux qui gardent leur IA chez eux — en toute simplicité.
          </p>
          <Link href="/download">
            <Button size="lg">Télécharger le Host</Button>
          </Link>
        </div>
      </section>
    </MarketingShell>
  );
}
