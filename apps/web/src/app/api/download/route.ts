import { NextResponse } from "next/server";
import { resolveReleaseDownload } from "@/lib/release-download";

/** Redirection directe vers le ZIP (Supabase en priorité). */
export async function GET(request: Request) {
  const found = await resolveReleaseDownload();

  if (!found) {
    return NextResponse.redirect(new URL("/download?error=no_asset", request.url));
  }

  return NextResponse.redirect(found.url);
}
