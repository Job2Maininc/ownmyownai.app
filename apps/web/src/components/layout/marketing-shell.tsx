import Link from "next/link";
import { createClient } from "@/lib/supabase/server";
import { BrandMark } from "@/components/brand/brand-mark";
import { MarketingFooter } from "@/components/layout/marketing-footer";
import { ThemeToggle } from "@/components/theme/theme-toggle";
import { Icon } from "@/components/ui/icon";
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
          <nav className="flex items-center gap-2 text-sm sm:gap-4">
            <Link href="/help" className="nav-link hidden sm:inline">
              Aide
            </Link>
            <Link href="/cursor" className="nav-link hidden sm:inline">
              Cursor
            </Link>
            <Link href="/pricing" className="nav-link hidden sm:inline">
              Tarifs
            </Link>
            <Link href="/download" className="nav-link hidden sm:inline">
              Télécharger
            </Link>

            <details className="nav-mobile-menu sm:hidden">
              <summary aria-label="Menu navigation">
                <Icon name="more-horizontal" size={18} />
              </summary>
              <div className="nav-mobile-menu__panel">
                <Link href="/help" className="nav-mobile-menu__link">
                  Aide
                </Link>
                <Link href="/cursor" className="nav-mobile-menu__link">
                  Cursor
                </Link>
                <Link href="/pricing" className="nav-mobile-menu__link">
                  Tarifs
                </Link>
                <Link href="/download" className="nav-mobile-menu__link">
                  Télécharger
                </Link>
              </div>
            </details>

            <ThemeToggle />
            {user ? (
              <Link href="/dashboard">
                <Button variant="secondary" className="!px-4 !py-2 text-sm">
                  <span className="hidden sm:inline">Mon tableau de bord</span>
                  <span className="sm:hidden">Dashboard</span>
                </Button>
              </Link>
            ) : (
              <Link href="/login">
                <Button className="!px-4 !py-2 text-sm">
                  <span className="hidden sm:inline">Se connecter</span>
                  <span className="sm:hidden">Connexion</span>
                </Button>
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
