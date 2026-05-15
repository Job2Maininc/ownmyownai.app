import { Suspense } from "react";

export default function HostLinkLayout({ children }: { children: React.ReactNode }) {
  return <Suspense fallback={<main className="flex min-h-screen items-center justify-center">Chargement…</main>}>{children}</Suspense>;
}
