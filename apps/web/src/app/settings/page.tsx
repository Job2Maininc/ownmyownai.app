import Link from "next/link";
import { redirect } from "next/navigation";
import { AppHeader } from "@/components/layout/app-header";
import { SignOutButton } from "@/components/auth/sign-out-button";
import { Card } from "@/components/ui/card";
import { createClient } from "@/lib/supabase/server";

export const dynamic = "force-dynamic";

export default async function SettingsPage() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect("/login");

  const createdAt = user.created_at
    ? new Date(user.created_at).toLocaleDateString("fr-FR", {
        day: "numeric",
        month: "long",
        year: "numeric",
      })
    : null;

  return (
    <AppHeader>
      <main className="mx-auto min-h-screen max-w-2xl px-6 py-10 md:py-12">
        <div className="mb-8">
          <h1 className="text-2xl font-bold tracking-tight">Compte</h1>
          <p className="mt-1 text-sm text-[var(--muted)]">
            Gérez votre profil et vos préférences OwnMyOwnAI.
          </p>
        </div>

        <div className="space-y-4">
          <Card>
            <h2 className="mb-1 text-sm font-semibold">Identité</h2>
            <p className="text-sm text-[var(--muted)]">Adresse e-mail de connexion</p>
            <p className="mt-2 font-mono text-sm">{user.email}</p>
            {createdAt ? (
              <p className="mt-2 text-xs text-[var(--muted)]">Membre depuis {createdAt}</p>
            ) : null}
          </Card>

          <Card>
            <h2 className="mb-1 text-sm font-semibold">Apparence</h2>
            <p className="text-sm text-[var(--muted)]">
              Le thème clair/sombre se règle via le bouton en haut à droite de l&apos;en-tête.
            </p>
          </Card>

          <Card>
            <h2 className="mb-1 text-sm font-semibold">Abonnement</h2>
            <p className="text-sm text-[var(--muted)]">
              OwnMyOwnAI est en accès anticipé — l&apos;inférence tourne sur votre PC, sans facturation
              cloud pour les modèles locaux.
            </p>
            <Link href="/pricing" className="mt-3 inline-block text-sm link">
              Voir les offres à venir
            </Link>
          </Card>

          <Card>
            <h2 className="mb-1 text-sm font-semibold">Confidentialité</h2>
            <p className="text-sm text-[var(--muted)]">
              Vos conversations restent sur votre Host. Consultez notre politique de confidentialité
              pour le traitement des données compte.
            </p>
            <div className="mt-3 flex flex-wrap gap-3 text-sm">
              <Link href="/legal/privacy" className="link">
                Confidentialité
              </Link>
              <Link href="/legal/terms" className="link">
                Conditions
              </Link>
            </div>
          </Card>
        </div>

        <div className="mt-8">
          <SignOutButton />
        </div>
      </main>
    </AppHeader>
  );
}
