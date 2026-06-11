"use client";

import Link from "next/link";
import { useRouter, usePathname } from "next/navigation";
import { useEffect, useMemo, useState } from "react";
import {
  CommandPaletteProvider,
  PALETTE_SHORTCUT_LABEL,
  useCommandPalette,
  type PaletteCommand,
} from "@/components/command-palette/command-palette-provider";
import { BrandMark } from "@/components/brand/brand-mark";
import { createClient } from "@/lib/supabase/client";
import { Button } from "@/components/ui/button";

function CommandPaletteTrigger() {
  const { open } = useCommandPalette();

  return (
    <Button
      type="button"
      variant="ghost"
      className="hidden sm:inline-flex"
      onClick={open}
      title={`Palette de commandes (${PALETTE_SHORTCUT_LABEL})`}
    >
      Commandes
      <kbd className="ml-2 rounded-md border border-[var(--border)] bg-[var(--surface-subtle)] px-1.5 py-0.5 font-mono text-xs">
        {PALETTE_SHORTCUT_LABEL}
      </kbd>
    </Button>
  );
}

function NavLink({ href, children }: { href: string; children: React.ReactNode }) {
  const pathname = usePathname();
  const active = pathname === href || pathname.startsWith(`${href}/`);

  return (
    <Link
      href={href}
      className={`nav-link ${active ? "nav-link--active" : ""}`}
    >
      {children}
    </Link>
  );
}

export function AppHeader({ children }: { children?: React.ReactNode }) {
  const router = useRouter();
  const [email, setEmail] = useState<string | null>(null);

  useEffect(() => {
    const supabase = createClient();
    void supabase.auth.getUser().then(({ data }) => {
      setEmail(data.user?.email ?? null);
    });
  }, []);

  async function handleSignOut() {
    const supabase = createClient();
    await supabase.auth.signOut();
    router.push("/login");
    router.refresh();
  }

  const defaultCommands = useMemo<PaletteCommand[]>(
    () => [
      {
        id: "nav-dashboard",
        label: "Aller au tableau de bord",
        keywords: "mes pcs dashboard accueil",
        group: "Navigation",
        onSelect: () => router.push("/dashboard"),
      },
      {
        id: "nav-link-host",
        label: "Lier un PC",
        keywords: "pairing host ajouter",
        group: "Navigation",
        onSelect: () => router.push("/host/link"),
      },
      {
        id: "nav-download",
        label: "Télécharger le host",
        keywords: "installer windows",
        group: "Navigation",
        onSelect: () => router.push("/download"),
      },
      {
        id: "auth-sign-out",
        label: "Se déconnecter",
        keywords: "logout deconnexion",
        group: "Compte",
        onSelect: () => void handleSignOut(),
      },
    ],
    [router],
  );

  return (
    <CommandPaletteProvider defaultCommands={defaultCommands}>
      <div className="flex min-h-dvh flex-col bg-[var(--background)]">
      {email ? (
        <header className="nav-glass">
          <div className="mx-auto flex max-w-5xl items-center justify-between px-6 py-3">
            <nav className="flex items-center gap-5 text-sm">
              <BrandMark href="/dashboard" size="sm" />
              <NavLink href="/dashboard">Mes PCs</NavLink>
              <NavLink href="/host/link">Lier un PC</NavLink>
              <NavLink href="/download">Télécharger</NavLink>
            </nav>
            <div className="flex items-center gap-3 text-sm">
              <span className="hidden max-w-[12rem] truncate text-[var(--muted)] sm:inline">
                {email}
              </span>
              <CommandPaletteTrigger />
              <Button type="button" variant="ghost" onClick={() => void handleSignOut()}>
                Déconnexion
              </Button>
            </div>
          </div>
        </header>
      ) : null}
      {children}
      </div>
    </CommandPaletteProvider>
  );
}
