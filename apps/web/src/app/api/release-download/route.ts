import { NextResponse } from "next/server";

const GITHUB_REPO = "Job2Maininc/ownmyownai.app";

type ReleaseAsset = { name: string; browser_download_url: string };
type Release = { tag_name?: string; assets?: ReleaseAsset[] };

function isBlockedInstaller(name: string): boolean {
  return name.endsWith(".msi");
}

function pickAsset(assets: ReleaseAsset[] | undefined): ReleaseAsset | undefined {
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

async function findPortableFromReleases(): Promise<{
  installer: ReleaseAsset;
  tag?: string;
} | null> {
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
    const installer = pickAsset(release.assets);
    if (installer) {
      return { installer, tag: release.tag_name };
    }
  }

  return null;
}

export async function GET() {
  const envUrl = process.env.NEXT_PUBLIC_RUNNER_RELEASE_URL;

  if (envUrl) {
    if (envUrl.includes(".msi")) {
      // Ancienne variable Vercel → ignorer, chercher le ZIP sur GitHub
    } else if (envUrl.includes(".zip") || envUrl.includes(".exe")) {
      return NextResponse.json({ url: envUrl, source: "env" });
    }
  }

  try {
    const found = await findPortableFromReleases();

    if (!found) {
      return NextResponse.json({ error: "no_asset" }, { status: 404 });
    }

    return NextResponse.json({
      url: found.installer.browser_download_url,
      name: found.installer.name,
      tag: found.tag,
      source: "github",
    });
  } catch {
    return NextResponse.json({ error: "fetch_failed" }, { status: 500 });
  }
}
