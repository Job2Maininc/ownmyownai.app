import { NextResponse } from "next/server";
import { PORTABLE_ZIP_FILENAME, resolvePortableZipUrl } from "@/lib/release-download";

/** JSON pour debug / clients — URL du ZIP via le site. */
export async function GET(request: Request) {
  const zipUrl = await resolvePortableZipUrl();
  const siteDownload = new URL("/api/download", request.url).toString();

  return NextResponse.json({
    url: siteDownload,
    upstream: zipUrl,
    name: PORTABLE_ZIP_FILENAME,
  });
}
