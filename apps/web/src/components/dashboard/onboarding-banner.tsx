"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { ONBOARDING_STEPS } from "@/lib/onboarding";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { OnboardingSteps } from "@/components/onboarding/onboarding-steps";

const DISMISS_KEY = "onboarding-dismissed";

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

  const nextStep = ONBOARDING_STEPS[0];

  return (
    <Card className="mb-8 shadow-glow">
      <div className="mb-4 flex flex-wrap items-start justify-between gap-3">
        <div>
          <h2 className="font-semibold tracking-tight">Bienvenue — prêt en 5 minutes</h2>
          <p className="mt-1 text-sm text-[var(--muted)]">
            Suivez ces étapes pour installer, lier et discuter avec votre IA locale.
          </p>
        </div>
        <Button type="button" variant="ghost" onClick={dismiss}>
          Masquer
        </Button>
      </div>

      <OnboardingSteps currentStepId="download" className="mb-5" compact />

      <div className="rounded-xl border border-[var(--border)] bg-[var(--surface-subtle)] p-4">
        <p className="text-sm font-medium text-[var(--foreground)]">Prochaine étape</p>
        <p className="mt-1 text-sm text-[var(--muted)]">{nextStep.description}</p>
        <Link href={nextStep.href} className="mt-3 inline-block">
          <Button>{nextStep.label}</Button>
        </Link>
      </div>
    </Card>
  );
}
