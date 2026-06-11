import Link from "next/link";
import { createClient } from "@/lib/supabase/server";
import { BrandMark } from "@/components/brand/brand-mark";
import { MarketingFooter } from "@/components/layout/marketing-footer";
import { ThemeToggle } from "@/components/theme/theme-toggle";
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
          <nav className="flex items-center gap-3 text-sm sm:gap-4">
            <Link href="/pricing" className="nav-link hidden sm:inline">
              Tarifs
            </Link>
            <Link href="/download" className="nav-link hidden sm:inline">
              Télécharger
            </Link>
            <ThemeToggle />
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

      <MarketingFooter />
    </div>
  );
}
