import Link from "next/link";
import { Card } from "@/components/ui/card";
import { DownloadButton } from "./download-button";

export default async function DownloadPage({
  searchParams,
}: {
  searchParams: Promise<{ error?: string }>;
}) {
  const { error } = await searchParams;

  return (
    <main className="mx-auto min-h-screen max-w-2xl px-6 py-12">
      <Link href="/" className="mb-6 inline-block text-sm text-brand-500 hover:underline">
        ← Accueil
      </Link>

      <Card>
        <h1 className="mb-2 text-2xl font-bold">Télécharger OwnMyOwnAI Host</h1>
        <p className="mb-6 text-[var(--muted)]">
          Windows 10+, 8 Go RAM recommandés. Un fichier ZIP — extrayez-le, puis lancez l&apos;exe.
        </p>

        {error && (
          <p className="mb-4 rounded-lg border border-amber-500/30 bg-amber-500/10 p-3 text-sm text-amber-200">
            Le ZIP n&apos;est pas disponible pour le moment. Réessayez dans quelques minutes.
          </p>
        )}

        <DownloadButton />

        <ol className="mt-8 list-decimal space-y-2 pl-5 text-sm text-[var(--muted)]">
          <li>Téléchargez et extrayez le ZIP</li>
          <li>Lancez OwnMyOwnAI Host.exe</li>
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
  );
}
