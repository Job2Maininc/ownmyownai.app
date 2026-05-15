"use client";

import { useEffect, useState } from "react";
import { Button } from "@/components/ui/button";

const GITHUB_REPO = "Job2Maininc/ownmyownai.app";
const RELEASES_PAGE = `https://github.com/${GITHUB_REPO}/releases`;

export function DownloadButton() {
  const [msiUrl, setMsiUrl] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<"no_release" | "no_asset" | "fetch_failed" | null>(null);

  const envUrl = process.env.NEXT_PUBLIC_RUNNER_RELEASE_URL;

  useEffect(() => {
    if (envUrl && envUrl.includes(".msi")) {
      setMsiUrl(envUrl);
      setLoading(false);
      return;
    }

    async function fetchRelease() {
      try {
        const res = await fetch("/api/release-download");

        if (!res.ok) {
          setError("no_release");
          return;
        }

        const data = (await res.json()) as { url?: string };
        if (data.url) {
          setMsiUrl(data.url);
        } else {
          setError("no_asset");
        }
      } catch {
        setError("fetch_failed");
      } finally {
        setLoading(false);
      }
    }

    fetchRelease();
  }, [envUrl]);

  if (loading) {
    return (
      <Button className="w-full" disabled>
        Vérification des releases…
      </Button>
    );
  }

  if (msiUrl) {
    return (
      <a href={msiUrl}>
        <Button className="w-full">Télécharger pour Windows (.msi)</Button>
      </a>
    );
  }

  return (
    <div className="space-y-3">
      <div className="rounded-lg border border-amber-500/30 bg-amber-500/10 px-4 py-3 text-sm text-amber-200">
        {error === "no_release" ? (
          <>
            Aucune version publiée sur GitHub pour l&apos;instant. Builder l&apos;installeur en
            local (instructions ci-dessous) ou publiez une release sur GitHub.
          </>
        ) : error === "fetch_failed" ? (
          <>Impossible de contacter GitHub. Réessayez plus tard.</>
        ) : (
          <>
            Release trouvée mais sans fichier <code>.msi</code>. Attachez l&apos;installeur à la
            release GitHub.
          </>
        )}
      </div>
      <a href={RELEASES_PAGE} target="_blank" rel="noopener noreferrer">
        <Button variant="secondary" className="w-full">
          Ouvrir GitHub Releases
        </Button>
      </a>
    </div>
  );
}
