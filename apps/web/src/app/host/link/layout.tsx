import { Suspense } from "react";
import { Card } from "@/components/ui/card";

function HostLinkFallback() {
  return (
    <main className="auth-backdrop flex min-h-screen items-center justify-center px-6">
      <Card className="w-full max-w-md text-center shadow-glow">
        <p className="text-sm text-[var(--muted)]">Préparation du code de pairing…</p>
      </Card>
    </main>
  );
}

export default function HostLinkLayout({ children }: { children: React.ReactNode }) {
  return <Suspense fallback={<HostLinkFallback />}>{children}</Suspense>;
}
