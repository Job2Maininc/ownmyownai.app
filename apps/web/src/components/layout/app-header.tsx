"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
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
      <kbd className="ml-2 rounded border border-[var(--border)] px-1.5 py-0.5 font-mono text-xs">
        {PALETTE_SHORTCUT_LABEL}
      </kbd>
    </Button>
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
      {email ? (
        <header className="border-b border-[var(--border)] bg-white shadow-soft">
          <div className="mx-auto flex max-w-5xl items-center justify-between px-6 py-3">
            <nav className="flex items-center gap-4 text-sm">
              <BrandMark href="/dashboard" size="sm" />
              <Link href="/dashboard" className="text-[var(--muted)] hover:text-[var(--foreground)]">
                Mes PCs
              </Link>
              <Link href="/host/link" className="text-[var(--muted)] hover:text-[var(--foreground)]">
                Lier un PC
              </Link>
              <Link href="/download" className="text-[var(--muted)] hover:text-[var(--foreground)]">
                Télécharger
              </Link>
            </nav>
            <div className="flex items-center gap-3 text-sm">
              <span className="hidden text-[var(--muted)] sm:inline">{email}</span>
              <CommandPaletteTrigger />
              <Button type="button" variant="ghost" onClick={() => void handleSignOut()}>
                Déconnexion
              </Button>
            </div>
          </div>
        </header>
      ) : null}
      {children}
    </CommandPaletteProvider>
  );
}
