import Link from "next/link";
import { MarketingShell } from "@/components/layout/marketing-shell";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { createClient } from "@/lib/supabase/server";

export const dynamic = "force-dynamic";

const included = [
  {
    emoji: "🖥️",
    title: "Host Windows",
    description: "Installateur, mises à jour automatiques et liaison avec votre compte.",
  },
  {
    emoji: "🧠",
    title: "IA locale",
    description: "Modèles sur votre PC via Ollama — vos conversations restent chez vous.",
  },
  {
    emoji: "💬",
    title: "Chat web",
    description: "Interface navigateur pour discuter avec votre Host, où que vous soyez sur le réseau.",
  },
  {
    emoji: "📁",
    title: "Contexte & projets",
    description: "Indexation locale, bases de connaissances et outils intégrés au Host.",
  },
  {
    emoji: "🔒",
    title: "Confidentialité",
    description: "Pas d'envoi de vos données vers des clouds tiers sans votre accord explicite.",
  },
  {
    emoji: "✨",
    title: "Nouveautés bêta",
    description: "Accès aux évolutions en cours — votre retour façonne le produit.",
  },
];

export default async function PricingPage() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  return (
    <MarketingShell>
      <section className="brand-hero-gradient px-6 pb-12 pt-14 md:pt-20">
        <div className="mx-auto max-w-3xl animate-fade-up text-center">
          <span className="brand-badge mb-6">100 % gratuit pour le moment</span>
          <h1
            className="mb-5 font-bold leading-[var(--leading-tight)] tracking-[var(--tracking-display)] text-[var(--foreground)]"
            style={{ fontSize: "var(--text-display)" }}
          >
            Simple, gratuit,
            <br />
            <span className="bg-gradient-to-r from-zinc-500 to-zinc-400 bg-clip-text text-transparent">
              sans surprise.
            </span>
          </h1>
          <p className="mx-auto max-w-xl text-lg leading-relaxed text-[var(--muted)]">
            OwnMyOwnAI est en phase bêta : tout est accessible gratuitement pendant que nous
            construisons l&apos;expérience avec vous.
          </p>
        </div>
      </section>

      <section className="mx-auto max-w-3xl px-6 pb-16">
        <Card className="animate-fade-up text-center shadow-glow" style={{ animationDelay: "80ms" }}>
          <p className="text-sm font-semibold uppercase tracking-widest text-[var(--link)]">
            Offre actuelle
          </p>
          <p className="mt-4 text-5xl font-bold tracking-tight text-[var(--foreground)]">0 €</p>
          <p className="mt-2 text-[var(--muted)]">Accès complet · sans carte bancaire</p>
          <div className="mt-8 flex flex-col items-center justify-center gap-3 sm:flex-row">
            <Link href="/download">
              <Button size="lg">Télécharger le Host</Button>
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
                  Créer un compte
                </Button>
              </Link>
            )}
          </div>
          <p className="mt-6 text-xs leading-relaxed text-[var(--muted)]">
            Des offres payantes pourront être proposées plus tard pour financer l&apos;infrastructure
            et le support. Rien n&apos;est facturé aujourd&apos;hui.
          </p>
        </Card>
      </section>

      <section className="brand-section-alt px-6 py-16 md:py-20">
        <div className="mx-auto max-w-5xl">
          <div className="mb-10 text-center">
            <h2 className="text-2xl font-bold tracking-tight md:text-3xl">Ce qui est inclus</h2>
            <p className="mt-3 text-[var(--muted)]">Tout ce dont vous avez besoin pour démarrer.</p>
          </div>
          <div className="grid gap-5 sm:grid-cols-2 lg:grid-cols-3">
            {included.map((item) => (
              <Card key={item.title} interactive>
                <span className="mb-3 block text-2xl" aria-hidden>
                  {item.emoji}
                </span>
                <h3 className="mb-2 font-semibold tracking-tight">{item.title}</h3>
                <p className="text-sm leading-relaxed text-[var(--muted)]">{item.description}</p>
              </Card>
            ))}
          </div>
        </div>
      </section>

      <section className="px-6 py-16 md:py-20">
        <div className="mx-auto max-w-2xl rounded-2xl border border-[var(--border)] bg-[var(--surface)] p-10 text-center shadow-soft">
          <h2 className="mb-3 text-2xl font-bold tracking-tight">Prêt à commencer ?</h2>
          <p className="mb-8 text-[var(--muted)]">
            Installez le Host, liez votre PC et discutez en quelques minutes.
          </p>
          <Link href="/download">
            <Button size="lg">Commencer gratuitement</Button>
          </Link>
        </div>
      </section>
    </MarketingShell>
  );
}
