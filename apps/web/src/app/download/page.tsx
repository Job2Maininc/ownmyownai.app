import Link from "next/link";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";

const RELEASE_URL =
  process.env.NEXT_PUBLIC_RUNNER_RELEASE_URL ??
  "https://github.com/ownmyownai/ownmyownai/releases/latest";

export default function DownloadPage() {
  return (
    <main className="mx-auto min-h-screen max-w-2xl px-6 py-12">
      <Link href="/" className="mb-6 inline-block text-sm text-brand-500 hover:underline">
        ← Accueil
      </Link>

      <Card>
        <h1 className="mb-2 text-2xl font-bold">Télécharger OwnMyOwnAI Host</h1>
        <p className="mb-6 text-[var(--muted)]">
          Windows 10+, 8 Go RAM recommandés, ~10 Go d&apos;espace disque pour Ollama et un modèle.
        </p>

        <a href={RELEASE_URL} target="_blank" rel="noopener noreferrer">
          <Button className="w-full">Télécharger pour Windows (.msi)</Button>
        </a>

        <ol className="mt-8 list-decimal space-y-2 pl-5 text-sm text-[var(--muted)]">
          <li>Installez le host et lancez-le</li>
          <li>
            <Link href="/login" className="text-brand-500 hover:underline">
              Connectez-vous
            </Link>{" "}
            sur le web
          </li>
          <li>
            <Link href="/host/link" className="text-brand-500 hover:underline">
              Générez un code de pairing
            </Link>
          </li>
          <li>Entrez le code dans l&apos;application host</li>
          <li>Discutez depuis le dashboard</li>
        </ol>
      </Card>
    </main>
  );
}
