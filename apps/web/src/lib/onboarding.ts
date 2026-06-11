export const ONBOARDING_STEPS = [
  {
    id: "download",
    label: "Installer le Host",
    shortLabel: "Installer",
    href: "/download",
    description: "Téléchargez OwnMyOwnAI Host sur votre PC Windows.",
    emoji: "⬇️",
  },
  {
    id: "login",
    label: "Créer un compte",
    shortLabel: "Compte",
    href: "/login",
    description: "Connectez-vous avec un lien magique — sans mot de passe.",
    emoji: "✉️",
  },
  {
    id: "link",
    label: "Lier votre PC",
    shortLabel: "Lier",
    href: "/host/link",
    description: "Générez un code et entrez-le dans l'application Host.",
    emoji: "🔗",
  },
  {
    id: "chat",
    label: "Premier chat",
    shortLabel: "Discuter",
    href: "/dashboard",
    description: "Ouvrez le chat et posez votre première question.",
    emoji: "💬",
  },
] as const;

export type OnboardingStepId = (typeof ONBOARDING_STEPS)[number]["id"];

export function getOnboardingStepIndex(id: OnboardingStepId): number {
  return ONBOARDING_STEPS.findIndex((step) => step.id === id);
}
