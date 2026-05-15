"use client";

import { Button } from "@/components/ui/button";
import { PORTABLE_ZIP_FILENAME } from "@/lib/release-download";

export function DownloadButton() {
  return (
    <a href="/api/download" download={PORTABLE_ZIP_FILENAME}>
      <Button className="w-full">Télécharger OwnMyOwnAI Host</Button>
    </a>
  );
}
