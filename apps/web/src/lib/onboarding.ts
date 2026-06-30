import type { IconName } from "@/components/ui/icon";

export const ONBOARDING_STEPS = [
  {
    id: "download",
    label: "Installer le Host",
    shortLabel: "Installer",
    href: "/download",
    description: "Téléchargez OwnMyOwnAI Host sur votre PC Windows.",
    icon: "download" as IconName,
  },
  {
    id: "login",
    label: "Créer un compte",
    shortLabel: "Compte",
    href: "/login",
    description: "Connectez-vous avec un lien magique — sans mot de passe.",
    icon: "mail" as IconName,
  },
  {
    id: "link",
    label: "Lier votre PC",
    shortLabel: "Lier",
    href: "/host/link",
    description: "Générez un code et entrez-le dans l'application Host.",
    icon: "link" as IconName,
  },
  {
    id: "cursor",
    label: "Connecter Cursor",
    shortLabel: "Cursor",
    href: "/onboarding/cursor",
    description:
      "Branchez Cursor sur la passerelle locale du Host — inférence 0 crédit avec RAG et règles projet.",
    icon: "monitor" as IconName,
  },
  {
    id: "chat",
    label: "Premier chat",
    shortLabel: "Discuter",
    href: "/dashboard",
    description: "Ouvrez le chat et posez votre première question.",
    icon: "message" as IconName,
  },
] as const;

export type OnboardingStepId = (typeof ONBOARDING_STEPS)[number]["id"];

export function getOnboardingStepIndex(id: OnboardingStepId): number {
  return ONBOARDING_STEPS.findIndex((step) => step.id === id);
}
