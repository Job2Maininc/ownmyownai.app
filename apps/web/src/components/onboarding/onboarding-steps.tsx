import Link from "next/link";
import { Icon } from "@/components/ui/icon";
import {
  getOnboardingStepIndex,
  ONBOARDING_STEPS,
  type OnboardingStepId,
} from "@/lib/onboarding";

interface OnboardingStepsProps {
  currentStepId: OnboardingStepId;
  className?: string;
  compact?: boolean;
}

export function OnboardingSteps({
  currentStepId,
  className = "",
  compact = false,
}: OnboardingStepsProps) {
  const currentIndex = getOnboardingStepIndex(currentStepId);

  return (
    <nav
      className={`onboarding-steps ${compact ? "onboarding-steps--compact" : ""} ${className}`.trim()}
      aria-label="Étapes de démarrage"
    >
      <ol className="onboarding-steps__list">
        {ONBOARDING_STEPS.map((step, index) => {
          const isComplete = index < currentIndex;
          const isCurrent = index === currentIndex;
          const state = isComplete ? "complete" : isCurrent ? "current" : "upcoming";

          return (
            <li key={step.id} className={`onboarding-steps__item onboarding-steps__item--${state}`}>
              <Link href={step.href} className="onboarding-steps__link">
                <span className="onboarding-steps__marker" aria-hidden>
                  {isComplete ? <Icon name="check" size={14} /> : index + 1}
                </span>
                <span className="onboarding-steps__label">
                  {compact ? step.shortLabel : step.label}
                </span>
              </Link>
              {index < ONBOARDING_STEPS.length - 1 && (
                <span className="onboarding-steps__connector" aria-hidden />
              )}
            </li>
          );
        })}
      </ol>
    </nav>
  );
}

interface OnboardingStepDetailProps {
  stepId: OnboardingStepId;
  className?: string;
}

export function OnboardingStepDetail({ stepId, className = "" }: OnboardingStepDetailProps) {
  const step = ONBOARDING_STEPS.find((s) => s.id === stepId);
  if (!step) return null;

  const stepNumber = getOnboardingStepIndex(stepId) + 1;

  return (
    <div className={`onboarding-step-detail ${className}`.trim()}>
      <p className="onboarding-step-detail__eyebrow">
        Étape {stepNumber} sur {ONBOARDING_STEPS.length}
      </p>
      <h2 className="onboarding-step-detail__title">
        <span className="onboarding-step-detail__icon" aria-hidden>
          <Icon name={step.icon} size={22} />
        </span>
        {step.label}
      </h2>
      <p className="onboarding-step-detail__description">{step.description}</p>
    </div>
  );
}
