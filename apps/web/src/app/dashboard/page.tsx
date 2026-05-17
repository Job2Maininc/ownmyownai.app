import Link from "next/link";
import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import type { Host } from "@ownmyownai/supabase-types";

function isOnline(host: Host): boolean {
  if (!host.last_seen_at) return false;
  const lastSeen = new Date(host.last_seen_at).getTime();
  return Date.now() - lastSeen < 60_000;
}

export const dynamic = "force-dynamic";

export default async function DashboardPage() {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) redirect("/login");

  const { data: hostsData } = await supabase
    .from("hosts")
    .select("*")
    .order("created_at", { ascending: false });

  const hosts = (hostsData ?? []) as Host[];

  return (
    <main className="mx-auto min-h-screen max-w-3xl px-6 py-12">
      <div className="mb-8 flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold">Mes PCs</h1>
          <p className="text-sm text-[var(--muted)]">
            Vos hosts IA locaux
          </p>
        </div>
        <Link href="/host/link">
          <Button>Ajouter un PC</Button>
        </Link>
      </div>

      {!hosts?.length ? (
        <Card>
          <p className="mb-4 text-[var(--muted)]">
            Aucun PC lié. Téléchargez le host Windows et créez un code de pairing.
          </p>
          <Link href="/host/link">
            <Button>Lier mon premier PC</Button>
          </Link>
        </Card>
      ) : (
        <ul className="space-y-3">
          {hosts.map((host) => {
            const online = isOnline(host) || host.status === "online";
            return (
              <li key={host.id}>
                <Card className="flex items-center justify-between">
                  <div>
                    <p className="font-medium">{host.name}</p>
                    <p className="text-sm text-[var(--muted)]">
                      {host.default_model} ·{" "}
                      <span className={online ? "text-brand-500" : "text-red-400"}>
                        {online ? "En ligne" : "Hors ligne"}
                      </span>
                    </p>
                  </div>
                  <Link href={`/chat/${host.id}`}>
                    <Button variant={online ? "primary" : "secondary"} disabled={!online}>
                      Chat
                    </Button>
                  </Link>
                </Card>
              </li>
            );
          })}
        </ul>
      )}

      <p className="mt-8 text-center">
        <Link href="/download" className="text-sm text-brand-500 hover:underline">
          Télécharger le host Windows
        </Link>
      </p>
    </main>
  );
}
