"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { formatAuthError } from "@/lib/auth-errors";
import { sanitizeRedirectPath } from "@/lib/auth-redirect";
import { getRememberedEmail, rememberEmail } from "@/lib/remembered-email";
import { createClient } from "@/lib/supabase/client";
import { BrandMark } from "@/components/brand/brand-mark";
import { FeatureIcon } from "@/components/ui/icon";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";

export default function LoginPage() {
  const router = useRouter();
  const [email, setEmail] = useState("");
  const [checkingSession, setCheckingSession] = useState(true);
  const [loading, setLoading] = useState(false);
  const [sent, setSent] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const searchParams = useSearchParams();
  const redirect = sanitizeRedirectPath(searchParams.get("redirect"));

  useEffect(() => {
    if (searchParams.get("error") === "callback_failed") {
      setError("Le lien de connexion est invalide ou a expiré. Demandez-en un nouveau.");
    }

    const supabase = createClient();

    void supabase.auth.getUser().then(({ data: { user } }) => {
      if (user) {
        router.replace(redirect);
        return;
      }

      const remembered = getRememberedEmail();
      if (remembered) setEmail(remembered);
      setCheckingSession(false);
    });
  }, [redirect, router, searchParams]);

  async function handleLogin(e: React.FormEvent) {
    e.preventDefault();
    setLoading(true);
    setError(null);
    rememberEmail(email);

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

  if (checkingSession) {
    return (
      <main className="auth-backdrop flex min-h-screen items-center justify-center px-6">
        <p className="animate-fade-in text-sm text-[var(--muted)]">Vérification de la session…</p>
      </main>
    );
  }

  if (sent) {
    return (
      <main className="auth-backdrop flex min-h-screen flex-col items-center justify-center px-6">
        <Card className="w-full max-w-md animate-fade-up text-center shadow-glow">
          <FeatureIcon name="mail" className="mx-auto mb-4" />
          <h1 className="mb-2 text-xl font-semibold">Vérifiez votre boîte mail</h1>
          <p className="text-[var(--muted)]">
            Un lien de connexion a été envoyé à <strong className="text-[var(--foreground)]">{email}</strong>.
          </p>
        </Card>
      </main>
    );
  }

  return (
    <main className="auth-backdrop flex min-h-screen flex-col items-center justify-center px-6">
      <div className="mb-8 animate-fade-up">
        <BrandMark href="/" />
      </div>
      <Card className="w-full max-w-md animate-fade-up shadow-glow" style={{ animationDelay: "80ms" }}>
        <h1 className="mb-2 text-xl font-semibold tracking-tight">Connexion</h1>
        <p className="mb-6 text-sm text-[var(--muted)]">
          Entrez votre e-mail — on vous envoie un lien magique, sans mot de passe.
        </p>
        <form onSubmit={handleLogin} className="space-y-4">
          <input
            type="email"
            required
            placeholder="vous@exemple.com"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            className="input-field"
          />
          {error && <p className="text-sm text-[var(--error)]">{error}</p>}
          <Button type="submit" className="w-full" disabled={loading}>
            {loading ? "Envoi…" : "Recevoir le lien"}
          </Button>
        </form>
        <p className="mt-4 text-center text-sm text-[var(--muted)]">
          <Link href="/" className="link font-medium">
            Retour à l&apos;accueil
          </Link>
        </p>
      </Card>
    </main>
  );
}
