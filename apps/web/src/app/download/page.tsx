import Link from "next/link";
import { MarketingShell } from "@/components/layout/marketing-shell";
import {
  OnboardingStepDetail,
  OnboardingSteps,
} from "@/components/onboarding/onboarding-steps";
import { Card } from "@/components/ui/card";
import { ErrorAlert } from "@/components/ui/error-alert";
import { formatDownloadError } from "@/lib/user-errors";
import { resolveHostReleaseInfo } from "@/lib/release-download";
import { DownloadButton } from "./download-button";

export const dynamic = "force-dynamic";

function formatReleaseDate(date: Date | null): string | null {
  if (!date || Number.isNaN(date.getTime())) return null;
  return date.toLocaleDateString("fr-FR", {
    day: "numeric",
    month: "long",
    year: "numeric",
  });
}

export default async function DownloadPage({
  searchParams,
}: {
  searchParams: Promise<{ error?: string }>;
}) {
  const [{ error }, release] = await Promise.all([
    searchParams,
    resolveHostReleaseInfo(),
  ]);
  const releaseDate = formatReleaseDate(release?.pubDate ?? null);
  const downloadError = error ? formatDownloadError(error) : null;

  return (
    <MarketingShell>
      <section className="brand-hero-gradient px-6 pb-8 pt-10 md:pt-14">
        <div className="mx-auto max-w-2xl animate-fade-up">
          <OnboardingSteps currentStepId="download" className="mb-8" />
          <OnboardingStepDetail stepId="download" />
        </div>
      </section>

      <main className="mx-auto max-w-2xl px-6 pb-12">
        <Card className="animate-fade-up shadow-glow" style={{ animationDelay: "80ms" }}>
          <p className="mb-2 text-sm text-[var(--muted)]">
            Gratuit, sur votre PC. Windows 10+, 8 Go RAM recommandés. L&apos;installateur gère
            les mises à jour automatiquement.
          </p>
          {release ? (
            <p className="mb-6 text-sm">
              <span className="text-[var(--muted)]">Version disponible : </span>
              <span className="font-medium text-[var(--link)]">v{release.version}</span>
              {releaseDate && (
                <span className="text-[var(--muted)]"> — publiée le {releaseDate}</span>
              )}
            </p>
          ) : (
            <div className="mb-6">
              <ErrorAlert
                message="La dernière version n'est pas encore publiée. Le téléchargement peut échouer — réessayez bientôt."
                actionLabel="Actualiser"
                actionHref="/download"
              />
            </div>
          )}

          {downloadError && (
            <div className="mb-4">
              <ErrorAlert {...downloadError} />
            </div>
          )}

          <DownloadButton version={release?.version ?? null} />

          <div className="mt-8 rounded-xl border border-[var(--border)] bg-[var(--surface-subtle)] p-4">
            <p className="mb-3 text-sm font-semibold text-[var(--foreground)]">Ensuite</p>
            <ol className="list-decimal space-y-2 pl-5 text-sm text-[var(--muted)]">
              <li>Lancez l&apos;installateur et ouvrez OwnMyOwnAI Host</li>
              <li>
                <Link href="/login" className="link">
                  Connectez-vous
                </Link>{" "}
                sur le web (lien magique par e-mail)
              </li>
              <li>
                <Link href="/host/link" className="link">
                  Générez un code de pairing
                </Link>{" "}
                et entrez-le dans l&apos;app
              </li>
              <li>Discutez depuis le dashboard — prêt en moins de 5 minutes</li>
            </ol>
          </div>
        </Card>
      </main>
    </MarketingShell>
  );
}
