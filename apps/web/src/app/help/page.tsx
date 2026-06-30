import type { Metadata } from "next";
import { HelpDocument } from "@/components/help/help-document";
import { HostGuideContent } from "@/components/help/host-guide-content";

export const metadata: Metadata = {
  title: "Guide Host — OwnMyOwnAI",
  description:
    "Guide utilisateur de l'application Host Windows : état, chat, modèles, Cursor, contexte, revue code, projets, MCP, mémoire et journal.",
};

export default function HelpPage() {
  return (
    <HelpDocument title="Guide utilisateur — Host" updatedAt="30 juin 2025">
      <HostGuideContent />
    </HelpDocument>
  );
}
