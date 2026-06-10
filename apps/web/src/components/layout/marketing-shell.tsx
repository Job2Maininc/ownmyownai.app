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
    <div className="relative flex min-h-screen flex-col bg-[var(--background)]">
      <div className="brand-blob brand-blob--1" aria-hidden />
      <div className="brand-blob brand-blob--2" aria-hidden />

      <header className="relative z-10 bg-[var(--surface)]/90 shadow-soft backdrop-blur-sm">
        <div className="mx-auto flex max-w-5xl items-center justify-between px-6 py-4">
          <BrandMark href="/" size="sm" />
          <nav className="flex items-center gap-3 text-sm sm:gap-5">
            <Link
              href="/download"
              className="hidden font-medium text-[var(--muted)] hover:text-[var(--foreground)] sm:inline"
            >
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

      <div className="relative z-10 flex-1">{children}</div>

      <footer className="relative z-10 border-t border-[var(--border)] bg-[var(--surface)]">
        <div className="mx-auto flex max-w-5xl flex-col gap-4 px-6 py-10 text-sm text-[var(--muted)] sm:flex-row sm:items-center sm:justify-between">
          <p className="font-medium text-[var(--foreground)]">
            OwnMyOwnAI — votre IA reste chez vous.
          </p>
          <div className="flex gap-5">
            <Link href="/download" className="hover:text-brand-600">
              Installer le Host
            </Link>
            <Link href="/login" className="hover:text-brand-600">
              Connexion
            </Link>
          </div>
        </div>
      </footer>
    </div>
  );
}
