const GITHUB_REPO = "Job2Maininc/ownmyownai.app";

export const PORTABLE_ZIP_FILENAME = "OwnMyOwnAI-Host-portable-x64.zip";
export const INSTALLER_FILENAME = "OwnMyOwnAI-Host-setup.exe";

export type HostReleaseSource = "supabase" | "github" | "config";

export type HostReleaseInfo = {
  version: string;
  pubDate: Date | null;
  source: HostReleaseSource;
};

type LatestManifest = {
  version?: string;
  pub_date?: string;
  notes?: string;
};

export type PortableZipAsset = {
  name: string;
  browser_download_url: string;
  api_url: string;
  publishedAt?: Date;
};

type Release = {
  tag_name?: string;
  published_at?: string;
  assets?: {
    id: number;
    name: string;
    browser_download_url: string;
    url: string;
  }[];
};

function supabasePublicBase(): string | null {
  const base = process.env.NEXT_PUBLIC_SUPABASE_URL;
  if (!base) return null;
  return `${base}/storage/v1/object/public/host-releases/latest`;
}

function supabasePublicZipUrl(): string | null {
  const root = supabasePublicBase();
  if (!root) return null;
  return `${root}/${PORTABLE_ZIP_FILENAME}`;
}

export function supabasePublicInstallerUrl(): string | null {
  const root = supabasePublicBase();
  if (!root) return null;
  return `${root}/${INSTALLER_FILENAME}`;
}

function supabasePublicManifestUrl(): string | null {
  const root = supabasePublicBase();
  if (!root) return null;
  return `${root}/latest.json`;
}

function normalizeVersion(raw: string | undefined | null): string | null {
  if (!raw?.trim()) return null;
  return raw.trim().replace(/^v/i, "");
}

/** >0 si `a` est plus récent que `b`. */
export function compareVersions(a: string, b: string): number {
  const parts = (value: string) =>
    value.split(".").map((segment) => {
      const parsed = Number.parseInt(segment, 10);
      return Number.isNaN(parsed) ? 0 : parsed;
    });
  const left = parts(a);
  const right = parts(b);
  const length = Math.max(left.length, right.length);
  for (let index = 0; index < length; index += 1) {
    const diff = (left[index] ?? 0) - (right[index] ?? 0);
    if (diff !== 0) return diff;
  }
  return 0;
}

async function fetchSupabaseReleaseInfo(): Promise<HostReleaseInfo | null> {
  const manifestUrl = supabasePublicManifestUrl();
  if (!manifestUrl) return null;
  try {
    const res = await fetch(manifestUrl, { cache: "no-store" });
    if (!res.ok) return null;
    const manifest = (await res.json()) as LatestManifest;
    const version = normalizeVersion(manifest.version);
    if (!version) return null;
    return {
      version,
      pubDate: manifest.pub_date ? new Date(manifest.pub_date) : null,
      source: "supabase",
    };
  } catch {
    return null;
  }
}

async function fetchGithubReleaseInfo(): Promise<HostReleaseInfo | null> {
  try {
    const res = await fetch(
      `https://api.github.com/repos/${GITHUB_REPO}/releases?per_page=5`,
      { headers: githubAuthHeaders(), next: { revalidate: 300 } },
    );
    if (!res.ok) return null;
    const releases = (await res.json()) as Release[];
    for (const release of releases) {
      const version = normalizeVersion(release.tag_name);
      if (!version) continue;
      return {
        version,
        pubDate: release.published_at ? new Date(release.published_at) : null,
        source: "github",
      };
    }
    return null;
  } catch {
    return null;
  }
}

export async function resolveHostReleaseInfo(): Promise<HostReleaseInfo | null> {
  const [supabase, github] = await Promise.all([
    fetchSupabaseReleaseInfo(),
    fetchGithubReleaseInfo(),
  ]);

  const candidates = [supabase, github].filter(
    (entry): entry is HostReleaseInfo => entry !== null,
  );

  if (candidates.length > 0) {
    return candidates.sort((a, b) => compareVersions(b.version, a.version))[0];
  }

  const configVersion = normalizeVersion(process.env.NEXT_PUBLIC_HOST_APP_VERSION);
  if (configVersion) {
    return { version: configVersion, pubDate: null, source: "config" };
  }

  return null;
}

async function resolveGithubInstallerUrl(version?: string): Promise<string | null> {
  try {
    const res = await fetch(
      `https://api.github.com/repos/${GITHUB_REPO}/releases?per_page=20`,
      { headers: githubAuthHeaders(), next: { revalidate: 120 } },
    );
    if (!res.ok) return null;
    const releases = (await res.json()) as Release[];
    for (const release of releases) {
      if (version && normalizeVersion(release.tag_name) !== version) continue;
      const setup = release.assets?.find(
        (asset) => asset.name.endsWith("-setup.exe") && !asset.name.includes("nsis"),
      );
      if (setup) return setup.browser_download_url;
    }
  } catch {
    return null;
  }
  return null;
}

export async function resolveInstallerUrl(): Promise<string | null> {
  const envUrl = process.env.NEXT_PUBLIC_RUNNER_INSTALLER_URL;
  if (envUrl?.endsWith(".exe")) return envUrl;

  const release = await resolveHostReleaseInfo();
  if (release?.source === "github") {
    const githubUrl = await resolveGithubInstallerUrl(release.version);
    if (githubUrl) return githubUrl;
  }

  const supabase = supabasePublicInstallerUrl();
  if (supabase) {
    try {
      const head = await fetch(supabase, { method: "HEAD", next: { revalidate: 60 } });
      if (head.ok) return supabase;
    } catch {
      /* ignore */
    }
  }

  try {
    const githubUrl = await resolveGithubInstallerUrl();
    if (githubUrl) return githubUrl;
  } catch {
    return null;
  }

  return null;
}

export async function resolveSupabaseZipUrl(): Promise<string | null> {
  const meta = await resolveSupabaseZipMeta();
  return meta?.url ?? null;
}

export async function resolveSupabaseZipMeta(): Promise<{
  url: string;
  lastModified: Date | null;
} | null> {
  const url = supabasePublicZipUrl();
  if (!url) return null;

  try {
    const head = await fetch(url, { method: "HEAD", next: { revalidate: 60 } });
    if (!head.ok) return null;
    const raw = head.headers.get("last-modified");
    const lastModified = raw ? new Date(raw) : null;
    return { url, lastModified };
  } catch {
    return null;
  }
}

function githubAuthHeaders(): Record<string, string> {
  const token =
    process.env.GITHUB_TOKEN ?? process.env.GITHUB_RELEASES_TOKEN ?? null;
  return {
    Accept: "application/vnd.github+json",
    ...(token ? { Authorization: `Bearer ${token}` } : {}),
    "User-Agent": "OwnMyOwnAI-Web",
  };
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

  try {
    const res = await fetch(
      `https://api.github.com/repos/${GITHUB_REPO}/releases?per_page=20`,
      {
        headers: githubAuthHeaders(),
        next: { revalidate: 120 },
      },
    );

    if (!res.ok) return null;

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
          publishedAt: release.published_at
            ? new Date(release.published_at)
            : undefined,
        };
      }
    }
  } catch {
    return null;
  }

  return null;
}

function isNewer(candidate: Date | null | undefined, baseline: Date | null): boolean {
  if (!candidate) return false;
  if (!baseline || Number.isNaN(baseline.getTime())) return true;
  return candidate.getTime() > baseline.getTime();
}

async function fetchZipFromUrl(url: string, apiStyle: boolean): Promise<Response> {
  const token =
    process.env.GITHUB_TOKEN ?? process.env.GITHUB_RELEASES_TOKEN ?? null;

  if (apiStyle && token && url.includes("api.github.com")) {
    const res = await fetch(url, {
      headers: {
        Accept: "application/octet-stream",
        Authorization: `Bearer ${token}`,
        "User-Agent": "OwnMyOwnAI-Web",
      },
      redirect: "follow",
    });
    if (res.ok && res.body) return res;
  }

  const res = await fetch(url, {
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

/** Choisit Supabase ou GitHub selon la date la plus récente (évite un ZIP figé sur Storage). */
export async function fetchPortableZipStream(): Promise<Response> {
  const [supabase, github] = await Promise.all([
    resolveSupabaseZipMeta(),
    resolvePortableZipAsset(),
  ]);

  const preferGithub =
    github &&
    isNewer(github.publishedAt, supabase?.lastModified ?? null);

  if (preferGithub) {
    return fetchZipFromUrl(github.api_url, true);
  }

  if (supabase) {
    const res = await fetch(supabase.url);
    if (res.ok && res.body) return res;
  }

  if (github) {
    return fetchZipFromUrl(github.api_url, true);
  }

  throw new Error("release_not_found");
}
