import Link from "next/link";
import { MarketingShell } from "@/components/layout/marketing-shell";
import { FeatureIcon, type IconName } from "@/components/ui/icon";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { createClient } from "@/lib/supabase/server";

export const dynamic = "force-dynamic";

const included: { icon: IconName; title: string; description: string }[] = [
  {
    icon: "monitor",
    title: "Host Windows",
    description: "Installateur, mises à jour automatiques et liaison avec votre compte.",
  },
  {
    icon: "brain",
    title: "IA locale",
    description: "Modèles sur votre PC via Ollama — vos conversations restent chez vous.",
  },
  {
    icon: "message",
    title: "Chat web",
    description: "Interface navigateur pour discuter avec votre Host, où que vous soyez sur le réseau.",
  },
  {
    icon: "folder",
    title: "Contexte & projets",
    description: "Indexation locale, bases de connaissances et outils intégrés au Host.",
  },
  {
    icon: "lock",
    title: "Confidentialité",
    description: "Pas d'envoi de vos données vers des clouds tiers sans votre accord explicite.",
  },
  {
    icon: "sparkles",
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
            <span className="text-gradient-brand">sans surprise.</span>
          </h1>
          <p className="mx-auto max-w-xl text-lg leading-relaxed text-[var(--muted)]">
            OwnMyOwnAI est en phase bêta : tout est accessible gratuitement pendant que nous
            construisons l&apos;expérience avec vous.
          </p>
        </div>
      </section>

      <section className="mx-auto max-w-3xl px-6 pb-16">
        <Card className="animate-fade-up text-center shadow-glow" style={{ animationDelay: "80ms" }}>
          <p className="section-eyebrow">Offre actuelle</p>
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
          <div className="section-header mb-10 text-center">
            <h2 className="section-title">Ce qui est inclus</h2>
            <p className="section-subtitle">Tout ce dont vous avez besoin pour démarrer.</p>
          </div>
          <div className="stagger-children grid gap-5 sm:grid-cols-2 lg:grid-cols-3">
            {included.map((item) => (
              <Card key={item.title} interactive>
                <FeatureIcon name={item.icon} />
                <h3 className="mb-2 font-semibold tracking-tight">{item.title}</h3>
                <p className="text-sm leading-relaxed text-[var(--muted)]">{item.description}</p>
              </Card>
            ))}
          </div>
        </div>
      </section>

      <section className="px-6 py-16 md:py-20">
        <div className="mx-auto max-w-2xl animate-fade-up">
          <div className="cta-panel rounded-2xl border border-[var(--border)] bg-[var(--surface)] p-10 text-center shadow-soft">
            <h2 className="mb-3 text-2xl font-bold tracking-tight">Prêt à commencer ?</h2>
            <p className="mb-8 text-[var(--muted)]">
              Installez le Host, liez votre PC et discutez en quelques minutes.
            </p>
            <Link href="/download">
              <Button size="lg">Commencer gratuitement</Button>
            </Link>
          </div>
        </div>
      </section>
    </MarketingShell>
  );
}
