import { NextResponse } from "next/server";
import { resolveReleaseDownload } from "@/lib/release-download";

export async function GET() {
  try {
    const found = await resolveReleaseDownload();

    if (!found) {
      return NextResponse.json({ error: "no_asset" }, { status: 404 });
    }

    return NextResponse.json(found);
  } catch {
    return NextResponse.json({ error: "fetch_failed" }, { status: 500 });
  }
}
