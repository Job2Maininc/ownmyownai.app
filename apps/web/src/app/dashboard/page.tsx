import Link from "next/link";
import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { HostList } from "@/components/dashboard/host-list";
import { OnboardingBanner } from "@/components/dashboard/onboarding-banner";
import { AppHeader } from "@/components/layout/app-header";
import { EmptyState } from "@/components/ui/empty-state";
import type { Host } from "@ownmyownai/supabase-types";

export const dynamic = "force-dynamic";

export default async function DashboardPage() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect("/login");

  const { data: hostsData } = await supabase
    .from("hosts")
    .select("*")
    .order("created_at", { ascending: false });

  const hosts = (hostsData ?? []) as Host[];

  return (
    <AppHeader>
      <main className="mx-auto min-h-screen max-w-3xl px-6 py-10 md:py-12">
        <OnboardingBanner hasHosts={hosts.length > 0} />

        <div className="mb-8 flex items-center justify-between gap-4">
          <div>
            <h1 className="text-2xl font-bold tracking-tight">Mes PCs</h1>
            <p className="mt-1 text-sm text-[var(--muted)]">Vos PCs — votre IA reste chez vous</p>
          </div>
          {hosts.length > 0 && (
            <Link href="/host/link">
              <Button>Ajouter un PC</Button>
            </Link>
          )}
        </div>

        {!hosts?.length ? (
          <Card>
            <EmptyState
              emoji="🖥️"
              title="Connectez votre Host"
              description="Installez OwnMyOwnAI sur votre PC Windows, puis liez-le avec un code de pairing. Vous pourrez chatter en moins de 5 minutes."
            >
              <Link href="/download">
                <Button variant="secondary">1. Télécharger le Host</Button>
              </Link>
              <Link href="/host/link">
                <Button>2. Lier mon premier PC</Button>
              </Link>
            </EmptyState>
          </Card>
        ) : (
          <HostList initialHosts={hosts} />
        )}

        <p className="mt-8 text-center">
          <Link href="/download" className="text-sm link">
            Télécharger le host Windows
          </Link>
        </p>
      </main>
    </AppHeader>
  );
}
