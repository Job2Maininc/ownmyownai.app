"use client";

import { Button } from "@/components/ui/button";
import { INSTALLER_FILENAME, PORTABLE_ZIP_FILENAME } from "@/lib/release-download";

export function DownloadButton() {
  return (
    <div className="flex flex-col gap-3">
      <a href="/api/download-installer" download={INSTALLER_FILENAME}>
        <Button className="w-full">Installer OwnMyOwnAI Host (recommandé)</Button>
      </a>
      <p className="text-center text-xs text-[var(--muted)]">
        Mises à jour automatiques incluses
      </p>
      <a
        href="/api/download"
        download={PORTABLE_ZIP_FILENAME}
        className="text-center text-sm text-brand-500 hover:underline"
      >
        Version portable ZIP (sans mise à jour auto)
      </a>
    </div>
  );
}
