"use client";

import { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import { useSearchParams } from "next/navigation";
import { QRCodeSVG } from "qrcode.react";
import { createPairingCode } from "@/lib/api";
import { AppHeader } from "@/components/layout/app-header";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { PairingStatus } from "./pairing-status";

export default function HostLinkPage() {
  const searchParams = useSearchParams();
  const initialCode = searchParams.get("code");
  const [code, setCode] = useState<string | null>(initialCode);
  const [pairingUrl, setPairingUrl] = useState<string | null>(null);
  const [expiresAt, setExpiresAt] = useState<string | null>(null);
  const [loading, setLoading] = useState(!initialCode);
  const [error, setError] = useState<string | null>(null);

  const generateCode = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const result = await createPairingCode();
      setCode(result.code);
      setPairingUrl(result.pairing_url);
      setExpiresAt(result.expires_at);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Erreur");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    if (!initialCode) {
      generateCode();
    }
  }, [initialCode, generateCode]);

  return (
    <>
    <AppHeader />
    <main className="mx-auto min-h-screen max-w-lg px-6 py-12">
      <Link href="/dashboard" className="mb-6 inline-block text-sm text-brand-500 hover:underline">
        ← Dashboard
      </Link>

      <Card>
        <h1 className="mb-2 text-xl font-semibold">Lier un PC Windows</h1>
        <ol className="mb-6 list-decimal space-y-2 pl-5 text-sm text-[var(--muted)]">
          <li>Téléchargez et lancez OwnMyOwnAI Host</li>
          <li>Entrez le code ci-dessous dans l&apos;application</li>
          <li>Votre PC apparaîtra sur le dashboard</li>
        </ol>

        {loading && <p className="text-center text-[var(--muted)]">Génération du code…</p>}
        {error && <p className="text-center text-red-400">{error}</p>}

        {code && !loading && (
          <div className="flex flex-col items-center gap-4">
            <p className="font-mono text-3xl font-bold tracking-widest text-brand-500">
              {code}
            </p>
            {pairingUrl && (
              <QRCodeSVG value={pairingUrl} size={160} bgColor="transparent" fgColor="#10b981" />
            )}
            {expiresAt && (
              <p className="text-xs text-[var(--muted)]">
                Expire à {new Date(expiresAt).toLocaleTimeString("fr-FR")}
              </p>
            )}
          </div>
        )}

        <Button onClick={generateCode} variant="secondary" className="mt-4 w-full" disabled={loading}>
          Nouveau code
        </Button>
        <PairingStatus code={code} />
      </Card>
    </main>
    </>
  );
}
