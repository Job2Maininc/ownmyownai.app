const GITHUB_REPO = "Job2Maininc/ownmyownai.app";

export const PORTABLE_ZIP_FILENAME = "OwnMyOwnAI-Host-portable-x64.zip";

const PINNED_TAG = "v0.1.7";

export type PortableZipAsset = {
  name: string;
  browser_download_url: string;
  api_url: string;
};

type Release = {
  tag_name?: string;
  assets?: {
    id: number;
    name: string;
    browser_download_url: string;
    url: string;
  }[];
};

function supabasePublicZipUrl(): string | null {
  const base = process.env.NEXT_PUBLIC_SUPABASE_URL;
  if (!base) return null;
  return `${base}/storage/v1/object/public/host-releases/latest/${PORTABLE_ZIP_FILENAME}`;
}

export async function resolveSupabaseZipUrl(): Promise<string | null> {
  const url = supabasePublicZipUrl();
  if (!url) return null;

  try {
    const head = await fetch(url, { method: "HEAD", next: { revalidate: 60 } });
    if (head.ok) return url;
  } catch {
    /* ignore */
  }
  return null;
}

export async function resolvePortableZipAsset(): Promise<PortableZipAsset | null> {
  const envUrl = process.env.NEXT_PUBLIC_RUNNER_RELEASE_URL;
  if (envUrl?.endsWith(".zip") && !envUrl.includes(".msi")) {
    return {
      name: PORTABLE_ZIP_FILENAME,
      browser_download_url: envUrl,
      api_url: envUrl,
    };
  }

  const token =
    process.env.GITHUB_TOKEN ?? process.env.GITHUB_RELEASES_TOKEN ?? null;

  try {
    const res = await fetch(
      `https://api.github.com/repos/${GITHUB_REPO}/releases?per_page=20`,
      {
        headers: {
          Accept: "application/vnd.github+json",
          ...(token ? { Authorization: `Bearer ${token}` } : {}),
          "User-Agent": "OwnMyOwnAI-Web",
        },
        next: { revalidate: 120 },
      },
    );

    if (res.ok) {
      const releases = (await res.json()) as Release[];
      for (const release of releases) {
        const zip = release.assets?.find(
          (a) => a.name.endsWith(".zip") && a.name.includes("portable"),
        );
        if (zip) {
          return {
            name: zip.name,
            browser_download_url: zip.browser_download_url,
            api_url: zip.url,
          };
        }
      }
    }
  } catch {
    /* fallback below */
  }

  return {
    name: PORTABLE_ZIP_FILENAME,
    browser_download_url: `https://github.com/${GITHUB_REPO}/releases/download/${PINNED_TAG}/${PORTABLE_ZIP_FILENAME}`,
    api_url: `https://github.com/${GITHUB_REPO}/releases/download/${PINNED_TAG}/${PORTABLE_ZIP_FILENAME}`,
  };
}

export async function fetchPortableZipStream(): Promise<Response> {
  const supabaseUrl = await resolveSupabaseZipUrl();
  if (supabaseUrl) {
    const res = await fetch(supabaseUrl);
    if (res.ok && res.body) return res;
  }

  const asset = await resolvePortableZipAsset();
  if (!asset) {
    throw new Error("release_not_found");
  }

  const token =
    process.env.GITHUB_TOKEN ?? process.env.GITHUB_RELEASES_TOKEN ?? null;

  if (token && asset.api_url.includes("api.github.com")) {
    const res = await fetch(asset.api_url, {
      headers: {
        Accept: "application/octet-stream",
        Authorization: `Bearer ${token}`,
        "User-Agent": "OwnMyOwnAI-Web",
      },
      redirect: "follow",
    });
    if (res.ok && res.body) return res;
  }

  const res = await fetch(asset.browser_download_url, {
    headers: {
      Accept: "application/octet-stream",
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
      "User-Agent": "Mozilla/5.0 (compatible; OwnMyOwnAI-Web/1.0)",
    },
    redirect: "follow",
  });

  if (!res.ok || !res.body) {
    throw new Error("zip_unavailable");
  }

  return res;
}
