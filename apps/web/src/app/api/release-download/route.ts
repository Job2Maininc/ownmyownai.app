import { NextResponse } from "next/server";

const GITHUB_REPO = "Job2Maininc/ownmyownai.app";

export async function GET() {
  const envUrl = process.env.NEXT_PUBLIC_RUNNER_RELEASE_URL;
  if (envUrl && (envUrl.includes(".zip") || envUrl.includes(".msi") || envUrl.includes(".exe"))) {
    return NextResponse.json({ url: envUrl, source: "env" });
  }

  try {
    const res = await fetch(
      `https://api.github.com/repos/${GITHUB_REPO}/releases/latest`,
      {
        headers: {
          Accept: "application/vnd.github+json",
          "User-Agent": "OwnMyOwnAI-Web",
        },
        next: { revalidate: 300 },
      },
    );

    if (!res.ok) {
      return NextResponse.json(
        { error: "no_release", status: res.status },
        { status: 404 },
      );
    }

    const data = (await res.json()) as {
      tag_name?: string;
      assets?: { name: string; browser_download_url: string }[];
    };

    const installer =
      data.assets?.find((a) => a.name.includes("portable") && a.name.endsWith(".zip")) ??
      data.assets?.find(
        (a) => a.name.endsWith("-setup.exe") || a.name.includes("setup.exe"),
      ) ??
      data.assets?.find((a) => a.name.endsWith(".exe") && !a.name.endsWith(".msi.exe")) ??
      data.assets?.find((a) => a.name.endsWith(".msi"));

    if (!installer) {
      return NextResponse.json({ error: "no_asset" }, { status: 404 });
    }

    return NextResponse.json({
      url: installer.browser_download_url,
      name: installer.name,
      tag: data.tag_name,
      source: "github",
    });
  } catch {
    return NextResponse.json({ error: "fetch_failed" }, { status: 500 });
  }
}
