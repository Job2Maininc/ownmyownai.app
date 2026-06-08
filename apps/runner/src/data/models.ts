export interface RecommendedModel {
  id: string;
  name: string;
  sizeGb: number;
  ramGb: number;
  tags: string[];
  description: string;
  bestFor: string[];
}

export const RECOMMENDED_MODELS: RecommendedModel[] = [
  {
    id: "llama3.2:3b",
    name: "Llama 3.2 · 3B",
    sizeGb: 2.0,
    ramGb: 8,
    tags: ["Recommandé", "Léger"],
    description:
      "Modèle polyvalent et rapide, idéal pour démarrer sur un PC avec 8 Go de RAM.",
    bestFor: ["Chat général", "Résumés", "Questions / réponses", "Aide au code simple"],
  },
  {
    id: "llama3.2:1b",
    name: "Llama 3.2 · 1B",
    sizeGb: 1.3,
    ramGb: 4,
    tags: ["Très léger"],
    description:
      "Le plus petit modèle de la gamme Llama 3.2 — réponses rapides, empreinte minimale.",
    bestFor: ["Machines limitées", "Réponses courtes", "Brouillons rapides"],
  },
  {
    id: "gemma2:2b",
    name: "Gemma 2 · 2B",
    sizeGb: 1.6,
    ramGb: 6,
    tags: ["Équilibré"],
    description:
      "Modèle Google compact, bon compromis entre vitesse et qualité de rédaction.",
    bestFor: ["Rédaction", "Reformulation", "Chat quotidien"],
  },
  {
    id: "phi3:mini",
    name: "Phi-3 Mini",
    sizeGb: 2.3,
    ramGb: 8,
    tags: ["Raisonnement"],
    description:
      "Modèle Microsoft orienté raisonnement et logique, performant pour sa taille.",
    bestFor: ["Analyse", "Maths simples", "Code", "Explications structurées"],
  },
  {
    id: "qwen2.5:3b",
    name: "Qwen 2.5 · 3B",
    sizeGb: 2.0,
    ramGb: 8,
    tags: ["Multilingue"],
    description:
      "Excellent en français et en langues asiatiques, bon pour le code et le chat.",
    bestFor: ["Français", "Traduction", "Code", "Chat multilingue"],
  },
  {
    id: "mistral:7b",
    name: "Mistral · 7B",
    sizeGb: 4.1,
    ramGb: 16,
    tags: ["Qualité"],
    description:
      "Modèle plus capable, nécessite plus de RAM mais offre des réponses plus riches.",
    bestFor: ["Rédaction longue", "Code avancé", "Analyse détaillée"],
  },
];

export function findModel(id: string): RecommendedModel | undefined {
  return RECOMMENDED_MODELS.find((m) => m.id === id);
}
