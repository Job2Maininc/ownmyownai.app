import Link from "next/link";
import { Card } from "@/components/ui/card";
import { DownloadButton } from "./download-button";

const GITHUB_REPO = "https://github.com/Job2Maininc/ownmyownai.app";

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

        <DownloadButton />

        <details className="mt-6 rounded-lg border border-[var(--border)] p-4 text-sm">
          <summary className="cursor-pointer font-medium text-brand-500">
            Problème d&apos;installation ? Builder depuis le code source
          </summary>
          <ol className="mt-3 list-decimal space-y-2 pl-5 text-[var(--muted)]">
            <li>
              Installez{" "}
              <a
                href="https://www.rust-lang.org/tools/install"
                className="text-brand-500 hover:underline"
                target="_blank"
                rel="noopener noreferrer"
              >
                Rust
              </a>{" "}
              et{" "}
              <a
                href="https://ollama.com/download"
                className="text-brand-500 hover:underline"
                target="_blank"
                rel="noopener noreferrer"
              >
                Ollama
              </a>
            </li>
            <li>Clonez le dépôt : {GITHUB_REPO}</li>
            <li>
              Dans PowerShell :
              <pre className="mt-2 overflow-x-auto rounded bg-black/40 p-3 text-xs text-[var(--foreground)]">
{`cd apps\\runner
npm.cmd install
npm.cmd run tauri build`}
              </pre>
            </li>
            <li>
              L&apos;installeur .exe se trouve dans{" "}
              <code className="text-brand-500">apps/runner/src-tauri/target/release/bundle/nsis/</code>
            </li>
            <li>
              Publiez-le sur{" "}
              <a
                href={`${GITHUB_REPO}/releases/new`}
                className="text-brand-500 hover:underline"
                target="_blank"
                rel="noopener noreferrer"
              >
                GitHub Releases
              </a>{" "}
              pour activer le bouton de téléchargement automatique.
            </li>
          </ol>
        </details>

        <div className="mt-4 rounded-lg border border-red-500/40 bg-red-500/10 p-3 text-sm text-red-100">
          <strong>Ne pas utiliser le fichier .msi</strong> — il est bloqué par Windows sur votre PC.
          Supprimez{" "}
          <code className="text-brand-500">OwnMyOwnAI.Host_0.1.0_x64_en-US.msi</code> dans
          Téléchargements. Téléchargez uniquement le{" "}
          <strong className="text-white">ZIP portable</strong> (extrait → double-clic sur l&apos;exe).
        </div>

        <ol className="mt-8 list-decimal space-y-2 pl-5 text-sm text-[var(--muted)]">
          <li>Extrayez le ZIP et lancez OwnMyOwnAI Host.exe</li>
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
