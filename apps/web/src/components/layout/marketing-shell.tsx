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
    <div className="relative flex min-h-screen flex-col">
      <div className="brand-blob brand-blob--1" aria-hidden />
      <div className="brand-blob brand-blob--2" aria-hidden />

      <header className="relative z-10 border-b border-[var(--border)] bg-[var(--surface)]/80 backdrop-blur-sm">
        <div className="mx-auto flex max-w-5xl items-center justify-between px-6 py-4">
          <BrandMark href="/" size="sm" />
          <nav className="flex items-center gap-4 text-sm">
            <Link href="/download" className="text-[var(--muted)] hover:text-[var(--foreground)]">
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
        <div className="mx-auto flex max-w-5xl flex-col gap-4 px-6 py-8 text-sm text-[var(--muted)] sm:flex-row sm:items-center sm:justify-between">
          <p>Vos données restent chez vous — sur votre PC.</p>
          <div className="flex gap-4">
            <Link href="/download" className="hover:text-brand-400">
              Télécharger le Host
            </Link>
            <Link href="/login" className="hover:text-brand-400">
              Connexion
            </Link>
          </div>
        </div>
      </footer>
    </div>
  );
}
