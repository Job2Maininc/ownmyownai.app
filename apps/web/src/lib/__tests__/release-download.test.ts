import { describe, expect, it, vi, afterEach } from "vitest";
import {
  compareVersions,
  resolveHostReleaseInfo,
} from "../release-download";

describe("compareVersions", () => {
  it("compare les versions semver", () => {
    expect(compareVersions("0.2.1", "0.1.19")).toBeGreaterThan(0);
    expect(compareVersions("0.1.19", "0.2.1")).toBeLessThan(0);
    expect(compareVersions("1.0.0", "1.0.0")).toBe(0);
  });
});

describe("resolveHostReleaseInfo", () => {
  afterEach(() => {
    vi.unstubAllGlobals();
    delete process.env.NEXT_PUBLIC_SUPABASE_URL;
    delete process.env.NEXT_PUBLIC_HOST_APP_VERSION;
  });

  it("lit la version depuis latest.json Supabase si GitHub est absent", async () => {
    process.env.NEXT_PUBLIC_SUPABASE_URL = "https://example.supabase.co";
    vi.stubGlobal(
      "fetch",
      vi.fn(async (url: string) => {
        if (url.endsWith("/latest.json")) {
          return new Response(
            JSON.stringify({
              version: "0.1.16",
              pub_date: "2026-06-08T12:00:00Z",
            }),
            { status: 200 },
          );
        }
        if (url.includes("api.github.com")) {
          return new Response(JSON.stringify([]), { status: 200 });
        }
        throw new Error(`unexpected fetch: ${url}`);
      }),
    );

    const info = await resolveHostReleaseInfo();
    expect(info).toEqual({
      version: "0.1.16",
      pubDate: new Date("2026-06-08T12:00:00Z"),
      source: "supabase",
    });
  });

  it("préfère GitHub quand sa version est plus récente que Supabase", async () => {
    process.env.NEXT_PUBLIC_SUPABASE_URL = "https://example.supabase.co";
    vi.stubGlobal(
      "fetch",
      vi.fn(async (url: string) => {
        if (url.endsWith("/latest.json")) {
          return new Response(
            JSON.stringify({
              version: "0.1.19",
              pub_date: "2026-06-08T12:00:00Z",
            }),
            { status: 200 },
          );
        }
        if (url.includes("api.github.com")) {
          return new Response(
            JSON.stringify([
              {
                tag_name: "v0.2.1",
                published_at: "2026-06-09T10:00:00Z",
              },
            ]),
            { status: 200 },
          );
        }
        throw new Error(`unexpected fetch: ${url}`);
      }),
    );

    const info = await resolveHostReleaseInfo();
    expect(info).toEqual({
      version: "0.2.1",
      pubDate: new Date("2026-06-09T10:00:00Z"),
      source: "github",
    });
  });

  it("retombe sur NEXT_PUBLIC_HOST_APP_VERSION", async () => {
    process.env.NEXT_PUBLIC_HOST_APP_VERSION = "v0.1.0";
    vi.stubGlobal(
      "fetch",
      vi.fn(async () => new Response(null, { status: 404 })),
    );

    const info = await resolveHostReleaseInfo();
    expect(info).toEqual({
      version: "0.1.0",
      pubDate: null,
      source: "config",
    });
  });
});
