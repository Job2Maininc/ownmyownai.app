import { NextResponse } from "next/server";
import { INSTALLER_FILENAME, resolveInstallerUrl } from "@/lib/release-download";

export const runtime = "nodejs";

/** Télécharge l'installateur NSIS (mises à jour automatiques). */
export async function GET() {
  const url = await resolveInstallerUrl();
  if (!url) {
    return NextResponse.json(
      {
        error: "installer_unavailable",
        hint: "L'installateur n'est pas encore publié. Utilisez le ZIP portable ou attendez la prochaine release.",
      },
      { status: 404 },
    );
  }

  if (url.includes("supabase.co")) {
    return NextResponse.redirect(url);
  }

  try {
    const upstream = await fetch(url, { redirect: "follow" });
    if (!upstream.ok || !upstream.body) {
      return NextResponse.redirect(url);
    }
    return new NextResponse(upstream.body, {
      headers: {
        "Content-Type": "application/octet-stream",
        "Content-Disposition": `attachment; filename="${INSTALLER_FILENAME}"`,
        "Cache-Control": "public, max-age=300",
      },
    });
  } catch {
    return NextResponse.redirect(url);
  }
}
