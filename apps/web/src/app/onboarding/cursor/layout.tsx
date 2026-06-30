import { Suspense } from "react";
import { Card } from "@/components/ui/card";

function OnboardingCursorFallback() {
  return (
    <main className="auth-backdrop flex min-h-screen items-center justify-center px-6">
      <Card className="w-full max-w-md text-center shadow-glow">
        <p className="text-sm text-[var(--muted)]">Chargement de l&apos;étape Cursor…</p>
      </Card>
    </main>
  );
}

export default function OnboardingCursorLayout({ children }: { children: React.ReactNode }) {
  return <Suspense fallback={<OnboardingCursorFallback />}>{children}</Suspense>;
}
