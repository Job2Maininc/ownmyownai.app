const GITHUB_REPO = "Job2Maininc/ownmyownai.app";
export const HOST_RELEASE_OBJECT_PATH = "latest/OwnMyOwnAI-Host-portable-x64.zip";

export type ReleaseDownload = {
  url: string;
  name?: string;
  tag?: string;
  source: "env" | "supabase" | "github";
};

export function getSupabaseReleasePublicUrl(): string | null {
  const base = process.env.NEXT_PUBLIC_SUPABASE_URL;
  if (!base) return null;
  return `${base}/storage/v1/object/public/host-releases/${HOST_RELEASE_OBJECT_PATH}`;
}

type ReleaseAsset = { name: string; browser_download_url: string };
type Release = { tag_name?: string; assets?: ReleaseAsset[] };

function isBlockedInstaller(name: string): boolean {
  return name.endsWith(".msi");
}

function pickGithubAsset(assets: ReleaseAsset[] | undefined): ReleaseAsset | undefined {
  if (!assets?.length) return undefined;

  return (
    assets.find((a) => a.name.includes("portable") && a.name.endsWith(".zip")) ??
    assets.find(
      (a) =>
        !isBlockedInstaller(a.name) &&
        (a.name.endsWith("-setup.exe") || a.name.includes("setup.exe")),
    ) ??
    assets.find((a) => !isBlockedInstaller(a.name) && a.name.endsWith(".exe"))
  );
}

async function findGithubRelease(): Promise<ReleaseDownload | null> {
  const res = await fetch(
    `https://api.github.com/repos/${GITHUB_REPO}/releases?per_page=20`,
    {
      headers: {
        Accept: "application/vnd.github+json",
        "User-Agent": "OwnMyOwnAI-Web",
      },
      next: { revalidate: 120 },
    },
  );

  if (!res.ok) return null;

  const releases = (await res.json()) as Release[];

  for (const release of releases) {
    const asset = pickGithubAsset(release.assets);
    if (asset) {
      return {
        url: asset.browser_download_url,
        name: asset.name,
        tag: release.tag_name,
        source: "github",
      };
    }
  }

  return null;
}

export async function resolveReleaseDownload(): Promise<ReleaseDownload | null> {
  const envUrl = process.env.NEXT_PUBLIC_RUNNER_RELEASE_URL;

  if (envUrl && !envUrl.includes(".msi")) {
    if (envUrl.includes(".zip") || envUrl.includes(".exe")) {
      return { url: envUrl, source: "env" };
    }
  }

  const supabaseUrl = getSupabaseReleasePublicUrl();
  if (supabaseUrl) {
    try {
      const head = await fetch(supabaseUrl, {
        method: "HEAD",
        next: { revalidate: 60 },
      });
      if (head.ok) {
        return {
          url: supabaseUrl,
          name: "OwnMyOwnAI-Host-portable-x64.zip",
          source: "supabase",
        };
      }
    } catch {
      // fallback GitHub
    }
  }

  return findGithubRelease();
}
