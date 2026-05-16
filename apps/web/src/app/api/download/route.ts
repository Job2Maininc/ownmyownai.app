import { NextResponse } from "next/server";
import {
  fetchPortableZipStream,
  PORTABLE_ZIP_FILENAME,
  resolvePortableZipAsset,
  resolveSupabaseZipUrl,
} from "@/lib/release-download";

export const runtime = "nodejs";

/** Télécharge le ZIP portable (Supabase public, ou GitHub avec token serveur). */
export async function GET() {
  try {
    const upstream = await fetchPortableZipStream();

    return new NextResponse(upstream.body, {
      headers: {
        "Content-Type": "application/zip",
        "Content-Disposition": `attachment; filename="${PORTABLE_ZIP_FILENAME}"`,
        "Cache-Control": "public, max-age=300",
      },
    });
  } catch {
    const supabase = await resolveSupabaseZipUrl();
    if (supabase) {
      return NextResponse.redirect(supabase);
    }

    const asset = await resolvePortableZipAsset();
    if (asset) {
      return NextResponse.redirect(asset.browser_download_url);
    }

    return NextResponse.json(
      {
        error: "zip_unavailable",
        hint:
          "Le dépôt GitHub est privé : ajoutez GITHUB_TOKEN sur Vercel, ou publiez le ZIP sur Supabase Storage (bucket host-releases).",
      },
      { status: 404 },
    );
  }
}
