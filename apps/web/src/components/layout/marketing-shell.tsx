import Link from "next/link";
import { createClient } from "@/lib/supabase/server";
import { BrandMark } from "@/components/brand/brand-mark";
import { Button } from "@/components/ui/button";

export async function MarketingShell({ children }: { children: React.ReactNode }) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  return (
    <div className="flex min-h-screen flex-col bg-white">
      <header className="border-b border-[var(--border)] bg-white">
        <div className="mx-auto flex max-w-5xl items-center justify-between px-6 py-4">
          <BrandMark href="/" size="sm" />
          <nav className="flex items-center gap-3 text-sm sm:gap-5">
            <Link href="/download" className="hidden font-medium text-[var(--muted)] hover:text-[var(--foreground)] sm:inline">
              Télécharger
            </Link>
            {user ? (
              <Link href="/dashboard">
                <Button variant="secondary">Mon tableau de bord</Button>
              </Link>
            ) : (
              <Link href="/login">
                <Button>Se connecter</Button>
              </Link>
            )}
          </nav>
        </div>
      </header>

      <div className="flex-1 bg-white">{children}</div>

      <footer className="border-t border-[var(--border)] bg-white">
        <div className="mx-auto flex max-w-5xl flex-col gap-4 px-6 py-10 text-sm text-[var(--muted)] sm:flex-row sm:items-center sm:justify-between">
          <p className="font-medium text-[var(--foreground)]">
            OwnMyOwnAI — votre IA reste chez vous.
          </p>
          <div className="flex gap-5">
            <Link href="/download" className="link">
              Installer le Host
            </Link>
            <Link href="/login" className="link">
              Connexion
            </Link>
          </div>
        </div>
      </footer>
    </div>
  );
}
