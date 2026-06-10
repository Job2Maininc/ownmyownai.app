import Image from "next/image";
import Link from "next/link";
import { MarketingShell } from "@/components/layout/marketing-shell";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { createClient } from "@/lib/supabase/server";

export const dynamic = "force-dynamic";

const steps = [
  {
    title: "Téléchargez le Host",
    description: "Installez l'application Windows sur votre PC en quelques clics.",
  },
  {
    title: "Liez votre compte",
    description: "Connectez-vous sur le web et associez votre PC avec un code simple.",
  },
  {
    title: "Discutez",
    description: "Utilisez votre IA depuis le navigateur — l'inférence reste chez vous.",
  },
];

const benefits = [
  {
    title: "Privé",
    description: "Vos conversations et fichiers ne partent pas vers les grands clouds.",
  },
  {
    title: "Simple",
    description: "Un installateur, un compte, et vous discutez depuis votre navigateur.",
  },
  {
    title: "Sous votre contrôle",
    description: "Vous choisissez les modèles, le stockage et ce qui est partagé.",
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
      <section className="brand-hero-gradient px-6 py-20 md:py-28">
        <div className="mx-auto flex max-w-5xl flex-col items-center gap-12 md:flex-row md:items-center md:justify-between">
          <div className="max-w-xl text-center md:text-left">
            <p className="mb-4 text-sm font-medium text-brand-400">OwnMyOwnAI</p>
            <h1 className="mb-6 text-4xl font-bold leading-tight tracking-tight md:text-5xl">
              Votre IA vit chez vous.
              <br />
              <span className="text-brand-500">Simple. Privé. Local.</span>
            </h1>
            <p className="mb-10 text-lg text-[var(--muted)]">
              Téléchargez le Host Windows, liez votre compte, et discutez depuis le navigateur —
              sans envoyer vos données aux grands clouds.
            </p>
            <div className="flex flex-wrap justify-center gap-4 md:justify-start">
              <Link href="/download">
                <Button>Télécharger le Host</Button>
              </Link>
              {user ? (
                <Link href="/dashboard">
                  <Button variant="secondary">Mon tableau de bord</Button>
                </Link>
              ) : (
                <Link href="/login">
                  <Button variant="secondary">Se connecter</Button>
                </Link>
              )}
            </div>
          </div>
          <Image
            src="/brand/hero-illustration.svg"
            alt=""
            width={400}
            height={320}
            className="w-full max-w-sm"
            priority
          />
        </div>
      </section>

      {/* Comment ça marche */}
      <section className="px-6 py-16 md:py-24">
        <div className="mx-auto max-w-5xl">
          <h2 className="mb-10 text-center text-2xl font-bold md:text-3xl">Comment ça marche</h2>
          <div className="grid gap-6 md:grid-cols-3">
            {steps.map((step, i) => (
              <Card key={step.title} className="text-center">
                <span className="mb-4 inline-flex h-10 w-10 items-center justify-center rounded-full bg-brand-800 text-lg font-bold text-brand-400">
                  {i + 1}
                </span>
                <h3 className="mb-2 font-semibold">{step.title}</h3>
                <p className="text-sm text-[var(--muted)]">{step.description}</p>
              </Card>
            ))}
          </div>
        </div>
      </section>

      {/* Pourquoi local */}
      <section className="px-6 py-16 md:py-24">
        <div className="mx-auto max-w-5xl">
          <h2 className="mb-10 text-center text-2xl font-bold md:text-3xl">
            Pourquoi une IA locale ?
          </h2>
          <div className="grid gap-6 md:grid-cols-3">
            {benefits.map((benefit) => (
              <Card key={benefit.title}>
                <h3 className="mb-2 font-semibold text-brand-400">{benefit.title}</h3>
                <p className="text-sm text-[var(--muted)]">{benefit.description}</p>
              </Card>
            ))}
          </div>
        </div>
      </section>

      {/* CTA final */}
      <section className="px-6 py-16 md:py-24">
        <div className="mx-auto max-w-2xl text-center">
          <h2 className="mb-4 text-2xl font-bold">Prêt à commencer ?</h2>
          <p className="mb-8 text-[var(--muted)]">
            Installez le Host gratuitement et gardez votre IA chez vous.
          </p>
          <Link href="/download">
            <Button className="px-8 py-3 text-base">Installer le Host</Button>
          </Link>
        </div>
      </section>
    </MarketingShell>
  );
}
