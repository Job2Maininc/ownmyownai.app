import { NextResponse } from "next/server";
import {
  PORTABLE_ZIP_FILENAME,
  resolvePortableZipAsset,
  resolveSupabaseZipUrl,
} from "@/lib/release-download";

export async function GET(request: Request) {
  const supabase = await resolveSupabaseZipUrl();
  const siteDownload = new URL("/api/download", request.url).toString();

  if (supabase) {
    return NextResponse.json({
      url: siteDownload,
      direct: supabase,
      name: PORTABLE_ZIP_FILENAME,
      source: "supabase",
    });
  }

  const asset = await resolvePortableZipAsset();
  if (!asset) {
    return NextResponse.json({ error: "no_asset" }, { status: 404 });
  }

  return NextResponse.json({
    url: siteDownload,
    direct: asset.browser_download_url,
    name: asset.name,
    source: "github",
  });
}
