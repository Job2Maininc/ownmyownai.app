"use client";

import { useState } from "react";
import Link from "next/link";
import { useSearchParams } from "next/navigation";
import { formatAuthError } from "@/lib/auth-errors";
import { createClient } from "@/lib/supabase/client";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";

export default function LoginPage() {
  const [email, setEmail] = useState("");
  const [loading, setLoading] = useState(false);
  const [sent, setSent] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const searchParams = useSearchParams();
  const redirect = searchParams.get("redirect") ?? "/dashboard";

  async function handleLogin(e: React.FormEvent) {
    e.preventDefault();
    setLoading(true);
    setError(null);

    const supabase = createClient();
    const appUrl = process.env.NEXT_PUBLIC_APP_URL ?? window.location.origin;

    const { error: authError } = await supabase.auth.signInWithOtp({
      email,
      options: {
        emailRedirectTo: `${appUrl}/auth/callback?redirect=${encodeURIComponent(redirect)}`,
      },
    });

    setLoading(false);
    if (authError) {
      setError(formatAuthError(authError));
      return;
    }
    setSent(true);
  }

  if (sent) {
    return (
      <main className="mx-auto flex min-h-screen max-w-md items-center px-6">
        <Card className="w-full text-center">
          <h1 className="mb-2 text-xl font-semibold">Vérifiez votre boîte mail</h1>
          <p className="text-[var(--muted)]">
            Un lien de connexion a été envoyé à <strong>{email}</strong>.
          </p>
        </Card>
      </main>
    );
  }

  return (
    <main className="mx-auto flex min-h-screen max-w-md items-center px-6">
      <Card className="w-full">
        <h1 className="mb-2 text-xl font-semibold">Connexion</h1>
        <p className="mb-6 text-sm text-[var(--muted)]">
          Magic link — pas de mot de passe.
        </p>
        <form onSubmit={handleLogin} className="space-y-4">
          <input
            type="email"
            required
            placeholder="vous@exemple.com"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            className="w-full rounded-lg border border-[var(--border)] bg-black/30 px-4 py-2 text-sm outline-none focus:border-brand-500"
          />
          {error && <p className="text-sm text-red-400">{error}</p>}
          <Button type="submit" className="w-full" disabled={loading}>
            {loading ? "Envoi…" : "Recevoir le lien"}
          </Button>
        </form>
        <p className="mt-4 text-center text-sm text-[var(--muted)]">
          <Link href="/" className="text-brand-500 hover:underline">
            Retour
          </Link>
        </p>
      </Card>
    </main>
  );
}
