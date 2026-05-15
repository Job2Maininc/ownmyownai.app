"use client";

import { useEffect, useState } from "react";
import { Button } from "@/components/ui/button";

const GITHUB_REPO = "Job2Maininc/ownmyownai.app";
const RELEASES_PAGE = `https://github.com/${GITHUB_REPO}/releases`;

type DownloadInfo = {
  url: string;
  name?: string;
  isPortable: boolean;
};

export function DownloadButton() {
  const [download, setDownload] = useState<DownloadInfo | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<"no_release" | "no_asset" | "fetch_failed" | null>(null);

  const envUrl = process.env.NEXT_PUBLIC_RUNNER_RELEASE_URL;
  const envIsMsi = Boolean(envUrl?.includes(".msi"));

  useEffect(() => {
    if (envUrl && !envUrl.includes(".msi") && (envUrl.includes(".zip") || envUrl.includes(".exe"))) {
      setDownload({
        url: envUrl,
        isPortable: envUrl.includes(".zip"),
      });
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

        const data = (await res.json()) as { url?: string; name?: string };
        if (data.url) {
          setDownload({
            url: data.url,
            name: data.name,
            isPortable: data.name?.includes("portable") ?? data.url.includes(".zip"),
          });
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

  return (
    <div className="space-y-3">
      {envIsMsi && (
        <div className="rounded-lg border border-red-500/40 bg-red-500/10 px-4 py-3 text-sm text-red-200">
          Vercel pointe encore vers un ancien fichier <strong>.msi</strong> (bloqué par Windows).
          Supprimez <code>NEXT_PUBLIC_RUNNER_RELEASE_URL</code> ou mettez le lien ZIP portable,
          puis redéployez.
        </div>
      )}

      {download ? (
        <a href="/api/download">
          <Button className="w-full">
            Télécharger ZIP portable (depuis le site)
          </Button>
        </a>
      ) : (
        <div className="rounded-lg border border-amber-500/30 bg-amber-500/10 px-4 py-3 text-sm text-amber-200">
          {error === "fetch_failed"
            ? "Impossible de contacter GitHub. Réessayez plus tard."
            : "ZIP portable en cours de publication. Utilisez GitHub Releases ci-dessous."}
        </div>
      )}

      <a href={RELEASES_PAGE} target="_blank" rel="noopener noreferrer">
        <Button variant="secondary" className="w-full">
          Ouvrir GitHub Releases
        </Button>
      </a>
    </div>
  );
}
