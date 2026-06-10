"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";

const DISMISS_KEY = "onboarding-dismissed";

const STEPS = [
  { label: "Télécharger", href: "/download" },
  { label: "Lier un PC", href: "/host/link" },
  { label: "Créer une base de contexte", href: "/dashboard" },
  { label: "Premier chat", href: "/dashboard" },
];

interface OnboardingBannerProps {
  hasHosts: boolean;
}

export function OnboardingBanner({ hasHosts }: OnboardingBannerProps) {
  const [dismissed, setDismissed] = useState(true);

  useEffect(() => {
    setDismissed(sessionStorage.getItem(DISMISS_KEY) === "1");
  }, []);

  if (dismissed || hasHosts) return null;

  function dismiss() {
    sessionStorage.setItem(DISMISS_KEY, "1");
    setDismissed(true);
  }

  return (
    <Card className="mb-8">
      <h2 className="mb-2 font-semibold">Bienvenue — par où commencer ?</h2>
      <ol className="mb-4 list-decimal space-y-1 pl-5 text-sm text-[var(--muted)]">
        {STEPS.map((step) => (
          <li key={step.label}>
            <Link href={step.href} className="link">
              {step.label}
            </Link>
          </li>
        ))}
      </ol>
      <Button type="button" variant="ghost" onClick={dismiss}>
        Masquer
      </Button>
    </Card>
  );
}
