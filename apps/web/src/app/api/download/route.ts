import { NextResponse } from "next/server";
import { PORTABLE_ZIP_FILENAME, resolvePortableZipUrl } from "@/lib/release-download";

/** Téléchargement du ZIP portable au clic (fichier servi par le site). */
export async function GET() {
  const zipUrl = await resolvePortableZipUrl();

  const upstream = await fetch(zipUrl);
  if (!upstream.ok) {
    return NextResponse.json(
      { error: "zip_unavailable" },
      { status: upstream.status === 404 ? 404 : 502 },
    );
  }

  const body = upstream.body;
  if (!body) {
    return NextResponse.json({ error: "empty_response" }, { status: 502 });
  }

  return new NextResponse(body, {
    headers: {
      "Content-Type": "application/zip",
      "Content-Disposition": `attachment; filename="${PORTABLE_ZIP_FILENAME}"`,
      "Cache-Control": "public, max-age=300",
    },
  });
}
