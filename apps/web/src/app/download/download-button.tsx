"use client";

import { Button } from "@/components/ui/button";
import { INSTALLER_FILENAME, PORTABLE_ZIP_FILENAME } from "@/lib/release-download";

interface DownloadButtonProps {
  version: string | null;
}

export function DownloadButton({ version }: DownloadButtonProps) {
  const versionLabel = version ? ` v${version}` : "";

  return (
    <div className="flex flex-col gap-3">
      <a href="/api/download-installer" download={INSTALLER_FILENAME}>
        <Button className="w-full">
          Installer OwnMyOwnAI Host{versionLabel} (recommandé)
        </Button>
      </a>
      <p className="text-center text-xs text-[var(--muted)]">
        Mises à jour automatiques incluses
      </p>
      <a
        href="/api/download"
        download={PORTABLE_ZIP_FILENAME}
        className="text-center text-sm link"
      >
        Version portable ZIP{versionLabel} (sans mise à jour auto)
      </a>
    </div>
  );
}
