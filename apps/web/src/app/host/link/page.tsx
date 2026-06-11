"use client";

import { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import { useSearchParams } from "next/navigation";
import { QRCodeSVG } from "qrcode.react";
import { createPairingCode } from "@/lib/api";
import { AppHeader } from "@/components/layout/app-header";
import {
  OnboardingStepDetail,
  OnboardingSteps,
} from "@/components/onboarding/onboarding-steps";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { ErrorAlert } from "@/components/ui/error-alert";
import { BRAND_ACCENT } from "@/lib/brand";
import { formatApiError } from "@/lib/user-errors";
import { PairingStatus } from "./pairing-status";

export default function HostLinkPage() {
  const searchParams = useSearchParams();
  const initialCode = searchParams.get("code");
  const [code, setCode] = useState<string | null>(initialCode);
  const [pairingUrl, setPairingUrl] = useState<string | null>(null);
  const [expiresAt, setExpiresAt] = useState<string | null>(null);
  const [loading, setLoading] = useState(!initialCode);
  const [error, setError] = useState<ReturnType<typeof formatApiError> | null>(null);

  const generateCode = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const result = await createPairingCode();
      setCode(result.code);
      setPairingUrl(result.pairing_url);
      setExpiresAt(result.expires_at);
    } catch (e) {
      setError(formatApiError(e));
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    if (!initialCode) {
      void generateCode();
    }
  }, [initialCode, generateCode]);

  return (
    <AppHeader>
      <main className="mx-auto min-h-screen max-w-lg px-6 py-8 md:py-12">
        <Link href="/dashboard" className="mb-6 inline-block text-sm link">
          ← Retour au dashboard
        </Link>

        <div className="mb-8 animate-fade-up">
          <OnboardingSteps currentStepId="link" className="mb-6" compact />
          <OnboardingStepDetail stepId="link" />
        </div>

        <Card className="animate-fade-up shadow-glow" style={{ animationDelay: "80ms" }}>
          <ol className="mb-6 list-decimal space-y-2 pl-5 text-sm text-[var(--muted)]">
            <li>
              Vérifiez que{" "}
              <Link href="/download" className="link">
                OwnMyOwnAI Host
              </Link>{" "}
              est installé et ouvert sur votre PC
            </li>
            <li>Entrez le code ci-dessous dans l&apos;application (ou scannez le QR)</li>
            <li>Votre PC apparaîtra sur le dashboard — vous pourrez chatter immédiatement</li>
          </ol>

          {loading && (
            <div className="py-6 text-center">
              <p className="text-sm text-[var(--muted)]">Génération du code…</p>
              <div className="mx-auto mt-3 h-1.5 w-32 overflow-hidden rounded-full bg-[var(--border)]">
                <div className="h-full w-1/2 animate-pulse rounded-full bg-[var(--link)]" />
              </div>
            </div>
          )}

          {error && !loading && (
            <div className="mb-4">
              <ErrorAlert
                {...error}
                actionLabel={error.actionLabel ?? "Réessayer"}
                onAction={error.actionHref ? undefined : () => void generateCode()}
              />
            </div>
          )}

          {code && !loading && (
            <div className="flex flex-col items-center gap-4">
              <p className="text-xs font-medium uppercase tracking-widest text-[var(--muted)]">
                Votre code de pairing
              </p>
              <p className="font-mono text-4xl font-bold tracking-[0.2em] text-[var(--link)]">
                {code}
              </p>
              {pairingUrl && (
                <div className="rounded-xl border border-[var(--border)] bg-[var(--surface-subtle)] p-3">
                  <QRCodeSVG
                    value={pairingUrl}
                    size={160}
                    bgColor="transparent"
                    fgColor={BRAND_ACCENT}
                  />
                </div>
              )}
              {expiresAt && (
                <p className="text-xs text-[var(--muted)]">
                  Expire à {new Date(expiresAt).toLocaleTimeString("fr-FR")}
                </p>
              )}
            </div>
          )}

          <Button
            onClick={() => void generateCode()}
            variant="secondary"
            className="mt-4 w-full"
            disabled={loading}
          >
            Générer un nouveau code
          </Button>
          <PairingStatus code={code} />
        </Card>
      </main>
    </AppHeader>
  );
}
