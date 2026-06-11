import { Suspense } from "react";
import { ThemeToggle } from "@/components/theme/theme-toggle";

export default function LoginLayout({ children }: { children: React.ReactNode }) {
  return (
    <Suspense
      fallback={<main className="flex min-h-screen items-center justify-center">Chargement…</main>}
    >
      <div className="relative min-h-screen">
        <div className="absolute right-4 top-4 z-10">
          <ThemeToggle />
        </div>
        {children}
      </div>
    </Suspense>
  );
}
