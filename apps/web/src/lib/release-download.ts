const GITHUB_REPO = "Job2Maininc/ownmyownai.app";

export const PORTABLE_ZIP_FILENAME = "OwnMyOwnAI-Host-portable-x64.zip";

/** Dernière release connue (secours si l’API GitHub est indisponible). */
const PINNED_ZIP_URL = `https://github.com/${GITHUB_REPO}/releases/download/v0.1.7/${PORTABLE_ZIP_FILENAME}`;

type Release = {
  tag_name?: string;
  assets?: { name: string; browser_download_url: string }[];
};

export async function resolvePortableZipUrl(): Promise<string> {
  const envUrl = process.env.NEXT_PUBLIC_RUNNER_RELEASE_URL;
  if (envUrl?.endsWith(".zip") && !envUrl.includes(".msi")) {
    return envUrl;
  }

  try {
    const res = await fetch(
      `https://api.github.com/repos/${GITHUB_REPO}/releases?per_page=15`,
      {
        headers: {
          Accept: "application/vnd.github+json",
          "User-Agent": "OwnMyOwnAI-Web",
        },
        next: { revalidate: 300 },
      },
    );

    if (res.ok) {
      const releases = (await res.json()) as Release[];
      for (const release of releases) {
        const zip = release.assets?.find(
          (a) => a.name.endsWith(".zip") && a.name.includes("portable"),
        );
        if (zip) return zip.browser_download_url;
      }
    }
  } catch {
    // pinned fallback
  }

  return PINNED_ZIP_URL;
}
