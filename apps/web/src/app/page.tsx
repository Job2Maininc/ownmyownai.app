import Link from "next/link";
import { Button } from "@/components/ui/button";
import { createClient } from "@/lib/supabase/server";

export const dynamic = "force-dynamic";

export default async function HomePage() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  return (
    <main className="mx-auto flex min-h-screen max-w-4xl flex-col items-center justify-center px-6 text-center">
      <p className="mb-4 text-sm font-medium uppercase tracking-widest text-brand-500">
        OwnMyOwnAI
      </p>
      <h1 className="mb-6 text-4xl font-bold leading-tight md:text-5xl">
        Votre IA vit sur votre PC.
        <br />
        <span className="text-brand-500">Simple. Privé. Local.</span>
      </h1>
      <p className="mb-10 max-w-xl text-lg text-[var(--muted)]">
        Téléchargez le host Windows, liez votre compte, et discutez depuis le navigateur —
        sans envoyer vos données aux grands clouds.
      </p>
      <div className="flex flex-wrap justify-center gap-4">
        <Link href="/download">
          <Button>Télécharger le host</Button>
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
    </main>
  );
}
