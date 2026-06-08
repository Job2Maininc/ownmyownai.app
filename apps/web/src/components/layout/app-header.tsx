"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useState } from "react";
import { createClient } from "@/lib/supabase/client";
import { Button } from "@/components/ui/button";

export function AppHeader() {
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

  if (!email) return null;

  return (
    <header className="border-b border-[var(--border)] bg-black/20">
      <div className="mx-auto flex max-w-5xl items-center justify-between px-6 py-3">
        <nav className="flex items-center gap-4 text-sm">
          <Link href="/dashboard" className="font-semibold text-brand-400 hover:underline">
            OwnMyOwnAI
          </Link>
          <Link href="/dashboard" className="text-[var(--muted)] hover:text-white">
            Mes PCs
          </Link>
          <Link href="/host/link" className="text-[var(--muted)] hover:text-white">
            Lier un PC
          </Link>
          <Link href="/download" className="text-[var(--muted)] hover:text-white">
            Télécharger
          </Link>
        </nav>
        <div className="flex items-center gap-3 text-sm">
          <span className="hidden text-[var(--muted)] sm:inline">{email}</span>
          <Button type="button" variant="ghost" onClick={() => void handleSignOut()}>
            Déconnexion
          </Button>
        </div>
      </div>
    </header>
  );
}
