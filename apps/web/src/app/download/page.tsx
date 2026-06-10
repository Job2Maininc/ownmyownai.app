import Link from "next/link";
import { MarketingShell } from "@/components/layout/marketing-shell";
import { Card } from "@/components/ui/card";
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

  return (
    <MarketingShell>
      <main className="mx-auto max-w-2xl px-6 py-12">
        <Card>
          <h1 className="mb-2 text-2xl font-bold">Installer le Host</h1>
          <p className="mb-2 text-[var(--muted)]">
            Gratuit, sur votre PC. Windows 10+, 8 Go RAM recommandés. L&apos;installateur gère
            les mises à jour automatiquement.
          </p>
          {release ? (
            <p className="mb-6 text-sm">
              <span className="text-[var(--muted)]">Version disponible : </span>
              <span className="font-medium text-brand-400">v{release.version}</span>
              {releaseDate && (
                <span className="text-[var(--muted)]"> — publiée le {releaseDate}</span>
              )}
            </p>
          ) : (
            <p className="mb-6 text-sm text-[var(--warn)]">
              Version Host non publiée pour le moment — le téléchargement peut échouer.
            </p>
          )}

          {error && (
            <p className="mb-4 rounded-lg border border-[color-mix(in_srgb,var(--warn)_30%,transparent)] bg-[color-mix(in_srgb,var(--warn)_10%,transparent)] p-3 text-sm text-[var(--warn)]">
              Le ZIP n&apos;est pas disponible pour le moment. Réessayez dans quelques minutes.
            </p>
          )}

          <DownloadButton version={release?.version ?? null} />

          <ol className="mt-8 list-decimal space-y-2 pl-5 text-sm text-[var(--muted)]">
            <li>Téléchargez et lancez l&apos;installateur</li>
            <li>Ouvrez OwnMyOwnAI Host depuis le menu Démarrer</li>
            <li>
              <Link href="/login" className="text-brand-500 hover:underline">
                Connectez-vous
              </Link>{" "}
              sur le web
            </li>
            <li>
              <Link href="/host/link" className="text-brand-500 hover:underline">
                Générez un code de pairing
              </Link>{" "}
              et entrez-le dans l&apos;app
            </li>
            <li>Discutez depuis le dashboard</li>
          </ol>
        </Card>
      </main>
    </MarketingShell>
  );
}
