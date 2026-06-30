"use client";

import Link from "next/link";
import { useSearchParams } from "next/navigation";
import { AppHeader } from "@/components/layout/app-header";
import { CursorOnboardingGuide } from "@/components/onboarding/cursor-onboarding-guide";
import {
  OnboardingStepDetail,
  OnboardingSteps,
} from "@/components/onboarding/onboarding-steps";
import { Icon } from "@/components/ui/icon";

export default function OnboardingCursorPage() {
  const searchParams = useSearchParams();
  const hostId = searchParams.get("host");

  return (
    <AppHeader>
      <main className="mx-auto min-h-screen max-w-lg px-6 py-8 md:py-12">
        <Link
          href="/host/link"
          className="mb-6 inline-flex items-center gap-1.5 text-sm link"
        >
          <Icon name="arrow-left" size={16} />
          Retour au pairing
        </Link>

        <div className="mb-8 animate-fade-up">
          <OnboardingSteps currentStepId="cursor" className="mb-6" compact />
          <OnboardingStepDetail stepId="cursor" />
        </div>

        <CursorOnboardingGuide hostId={hostId} />
      </main>
    </AppHeader>
  );
}
