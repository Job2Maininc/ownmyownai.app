"use client";

import Link from "next/link";
import { useSearchParams } from "next/navigation";
import { QRCodeSVG } from "qrcode.react";
import { useCallback, useEffect, useState } from "react";
import { createPairingCode } from "@/lib/api";
import { AppHeader } from "@/components/layout/app-header";
import {
  OnboardingStepDetail,
  OnboardingSteps,
} from "@/components/onboarding/onboarding-steps";
import { Icon } from "@/components/ui/icon";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { ErrorAlert } from "@/components/ui/error-alert";
import { BRAND_ACCENT } from "@/lib/brand";
import { formatApiError } from "@/lib/user-errors";
import { PairingStatus } from "./pairing-status";

function PairingCodeSkeleton() {
  return (
    <div className="py-6 text-center" aria-busy="true" aria-label="Génération du code">
      <div className="mx-auto space-y-3">
        <div className="skeleton-line mx-auto h-3 w-32" />
        <div className="skeleton-line mx-auto h-12 w-48 rounded-lg" />
        <div className="skeleton-line mx-auto h-40 w-40 rounded-xl" />
      </div>
    </div>
  );
}

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
        <Link
          href="/dashboard"
          className="mb-6 inline-flex items-center gap-1.5 text-sm link"
        >
          <Icon name="arrow-left" size={16} />
          Retour au dashboard
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

          {loading && <PairingCodeSkeleton />}

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
            <div className="flex flex-col items-center gap-4 animate-fade-up">
              <p className="text-xs font-medium uppercase tracking-widest text-[var(--muted)]">
                Votre code de pairing
              </p>
              <p className="pairing-code" aria-label={`Code ${code}`}>
                {code}
              </p>
              {pairingUrl && (
                <div className="rounded-xl border border-[var(--border)] bg-[var(--surface-subtle)] p-4 shadow-soft">
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
