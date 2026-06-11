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
    <div className="flex min-h-screen flex-col bg-[var(--background)]">
      <header className="nav-glass">
        <div className="mx-auto flex max-w-5xl items-center justify-between px-6 py-3.5">
          <BrandMark href="/" size="sm" />
          <nav className="flex items-center gap-4 text-sm sm:gap-6">
            <Link href="/download" className="nav-link hidden sm:inline">
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

      <div className="flex-1">{children}</div>

      <footer className="border-t border-[var(--border)] bg-[var(--surface)]">
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
