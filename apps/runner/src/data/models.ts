export const DEFAULT_MODEL = "qwen2.5:7b";

export type ModelCategory = "chat" | "code" | "vision" | "embedding";

export type ModelFamily = "llama" | "qwen" | "mistral";

export const MODEL_FAMILIES: { id: ModelFamily; label: string }[] = [
  { id: "llama", label: "Llama" },
  { id: "qwen", label: "Qwen" },
  { id: "mistral", label: "Mistral" },
];

export interface RecommendedModel {
  id: string;
  name: string;
  sizeGb: number;
  ramGb: number;
  tags: string[];
  category: ModelCategory;
  description: string;
  bestFor: string[];
}

export const RECOMMENDED_MODELS: RecommendedModel[] = [
  {
    id: "llama3.2:3b",
    name: "Llama 3.2 · 3B",
    sizeGb: 2.0,
    ramGb: 8,
    tags: ["Léger"],
    category: "chat",
    description: "Modèle polyvalent et rapide, idéal pour démarrer sur un PC avec 8 Go de RAM.",
    bestFor: ["Chat général", "Résumés", "Questions / réponses"],
  },
  {
    id: "llama3.2:1b",
    name: "Llama 3.2 · 1B",
    sizeGb: 1.3,
    ramGb: 4,
    tags: ["Très léger"],
    category: "chat",
    description: "Le plus petit modèle Llama 3.2 — réponses rapides, empreinte minimale.",
    bestFor: ["Machines limitées", "Réponses courtes"],
  },
  {
    id: "llama3.1:8b",
    name: "Llama 3.1 · 8B",
    sizeGb: 4.7,
    ramGb: 16,
    tags: ["Qualité"],
    category: "chat",
    description: "Modèle Meta performant pour le chat et le raisonnement.",
    bestFor: ["Chat avancé", "Analyse", "Rédaction"],
  },
  {
    id: "llama3.1:70b",
    name: "Llama 3.1 · 70B",
    sizeGb: 40,
    ramGb: 48,
    tags: ["Premium"],
    category: "chat",
    description: "Très haute qualité, nécessite une machine puissante.",
    bestFor: ["Rédaction longue", "Raisonnement complexe"],
  },
  {
    id: "gemma2:2b",
    name: "Gemma 2 · 2B",
    sizeGb: 1.6,
    ramGb: 6,
    tags: ["Équilibré"],
    category: "chat",
    description: "Modèle Google compact, bon compromis vitesse / qualité.",
    bestFor: ["Rédaction", "Reformulation", "Chat quotidien"],
  },
  {
    id: "gemma2:9b",
    name: "Gemma 2 · 9B",
    sizeGb: 5.4,
    ramGb: 16,
    tags: ["Qualité"],
    category: "chat",
    description: "Version plus capable de Gemma 2.",
    bestFor: ["Rédaction", "Analyse", "Chat"],
  },
  {
    id: "phi3:mini",
    name: "Phi-3 Mini",
    sizeGb: 2.3,
    ramGb: 8,
    tags: ["Raisonnement"],
    category: "chat",
    description: "Modèle Microsoft orienté raisonnement et logique.",
    bestFor: ["Analyse", "Maths", "Code", "Explications"],
  },
  {
    id: "phi3:medium",
    name: "Phi-3 Medium",
    sizeGb: 7.9,
    ramGb: 16,
    tags: ["Raisonnement"],
    category: "chat",
    description: "Phi-3 plus capable pour le raisonnement.",
    bestFor: ["Analyse", "Code", "Maths avancées"],
  },
  {
    id: "qwen2.5:3b",
    name: "Qwen 2.5 · 3B",
    sizeGb: 2.0,
    ramGb: 8,
    tags: ["Multilingue"],
    category: "chat",
    description: "Excellent en français et langues asiatiques.",
    bestFor: ["Français", "Traduction", "Code"],
  },
  {
    id: "qwen2.5:7b",
    name: "Qwen 2.5 · 7B",
    sizeGb: 4.7,
    ramGb: 16,
    tags: ["Recommandé", "Multilingue"],
    category: "chat",
    description: "Qwen 2.5 plus puissant, multilingue.",
    bestFor: ["Français", "Code", "Analyse"],
  },
  {
    id: "qwen2.5:14b",
    name: "Qwen 2.5 · 14B",
    sizeGb: 9.0,
    ramGb: 24,
    tags: ["Premium"],
    category: "chat",
    description: "Haute qualité multilingue.",
    bestFor: ["Rédaction", "Code avancé", "Analyse"],
  },
  {
    id: "mistral:7b",
    name: "Mistral · 7B",
    sizeGb: 4.1,
    ramGb: 16,
    tags: ["Qualité"],
    category: "chat",
    description: "Modèle français performant.",
    bestFor: ["Rédaction longue", "Code", "Analyse"],
  },
  {
    id: "mistral-nemo:12b",
    name: "Mistral Nemo · 12B",
    sizeGb: 7.1,
    ramGb: 24,
    tags: ["Qualité"],
    category: "chat",
    description: "Collaboration Mistral / NVIDIA, 128k contexte.",
    bestFor: ["Documents longs", "Chat", "Code"],
  },
  {
    id: "mixtral:8x7b",
    name: "Mixtral 8x7B",
    sizeGb: 26,
    ramGb: 48,
    tags: ["MoE", "Premium"],
    category: "chat",
    description: "Mixture of Experts — très performant.",
    bestFor: ["Raisonnement", "Code", "Multitâche"],
  },
  {
    id: "deepseek-r1:7b",
    name: "DeepSeek R1 · 7B",
    sizeGb: 4.7,
    ramGb: 16,
    tags: ["Raisonnement"],
    category: "chat",
    description: "Modèle de raisonnement chain-of-thought.",
    bestFor: ["Maths", "Logique", "Problèmes complexes"],
  },
  {
    id: "deepseek-coder:6.7b",
    name: "DeepSeek Coder · 6.7B",
    sizeGb: 3.8,
    ramGb: 16,
    tags: ["Code"],
    category: "code",
    description: "Spécialisé génération et complétion de code.",
    bestFor: ["Python", "JavaScript", "Refactoring"],
  },
  {
    id: "codellama:7b",
    name: "Code Llama · 7B",
    sizeGb: 3.8,
    ramGb: 16,
    tags: ["Code"],
    category: "code",
    description: "Meta Code Llama pour le développement.",
    bestFor: ["Code", "Debug", "Explications techniques"],
  },
  {
    id: "starcoder2:7b",
    name: "StarCoder2 · 7B",
    sizeGb: 4.0,
    ramGb: 16,
    tags: ["Code"],
    category: "code",
    description: "Modèle code open-source performant.",
    bestFor: ["Code multi-langages", "Complétion"],
  },
  {
    id: "qwen2.5-coder:7b",
    name: "Qwen 2.5 Coder · 7B",
    sizeGb: 4.7,
    ramGb: 16,
    tags: ["Code"],
    category: "code",
    description: "Qwen optimisé pour le code.",
    bestFor: ["Code", "Debug", "Refactoring"],
  },
  {
    id: "llava:7b",
    name: "LLaVA · 7B",
    sizeGb: 4.7,
    ramGb: 16,
    tags: ["Vision"],
    category: "vision",
    description: "Modèle multimodal texte + image.",
    bestFor: ["Description d'images", "OCR simple"],
  },
  {
    id: "llava:13b",
    name: "LLaVA · 13B",
    sizeGb: 8.0,
    ramGb: 24,
    tags: ["Vision"],
    category: "vision",
    description: "LLaVA plus capable pour la vision.",
    bestFor: ["Analyse d'images", "Documents scannés"],
  },
  {
    id: "bakllava:7b",
    name: "BakLLaVA · 7B",
    sizeGb: 4.7,
    ramGb: 16,
    tags: ["Vision"],
    category: "vision",
    description: "Vision basée sur Mistral.",
    bestFor: ["Images", "Diagrammes"],
  },
  {
    id: "moondream:1.8b",
    name: "Moondream · 1.8B",
    sizeGb: 1.7,
    ramGb: 8,
    tags: ["Vision", "Léger"],
    category: "vision",
    description: "Petit modèle vision compact.",
    bestFor: ["Description rapide", "Machines limitées"],
  },
  {
    id: "nomic-embed-text",
    name: "Nomic Embed Text",
    sizeGb: 0.3,
    ramGb: 4,
    tags: ["Embedding", "RAG"],
    category: "embedding",
    description: "Modèle d'embedding pour bases de contexte.",
    bestFor: ["RAG", "Recherche sémantique", "Contexte documentaire"],
  },
  {
    id: "mxbai-embed-large",
    name: "MXBai Embed Large",
    sizeGb: 0.7,
    ramGb: 8,
    tags: ["Embedding"],
    category: "embedding",
    description: "Embeddings haute qualité.",
    bestFor: ["RAG avancé", "Recherche précise"],
  },
  {
    id: "snowflake-arctic-embed:xs",
    name: "Snowflake Arctic Embed XS",
    sizeGb: 0.1,
    ramGb: 4,
    tags: ["Embedding", "Léger"],
    category: "embedding",
    description: "Embedding très léger.",
    bestFor: ["RAG léger", "Machines limitées"],
  },
  {
    id: "tinyllama:1.1b",
    name: "TinyLlama · 1.1B",
    sizeGb: 0.6,
    ramGb: 4,
    tags: ["Très léger"],
    category: "chat",
    description: "Ultra-compact pour tests rapides.",
    bestFor: ["Brouillons", "Tests", "Machines faibles"],
  },
  {
    id: "orca-mini:3b",
    name: "Orca Mini · 3B",
    sizeGb: 1.9,
    ramGb: 8,
    tags: ["Léger"],
    category: "chat",
    description: "Petit modèle instruct performant.",
    bestFor: ["Chat", "Instructions", "Résumés"],
  },
  {
    id: "neural-chat:7b",
    name: "Neural Chat · 7B",
    sizeGb: 4.1,
    ramGb: 16,
    tags: ["Chat"],
    category: "chat",
    description: "Modèle conversationnel Intel.",
    bestFor: ["Chat", "Assistance"],
  },
  {
    id: "openchat:7b",
    name: "OpenChat · 7B",
    sizeGb: 4.1,
    ramGb: 16,
    tags: ["Chat"],
    category: "chat",
    description: "Modèle conversationnel open-source.",
    bestFor: ["Chat naturel", "Rôle-play"],
  },
  {
    id: "dolphin-mistral:7b",
    name: "Dolphin Mistral · 7B",
    sizeGb: 4.1,
    ramGb: 16,
    tags: ["Chat"],
    category: "chat",
    description: "Mistral fine-tuné pour le dialogue.",
    bestFor: ["Chat créatif", "Assistance"],
  },
  {
    id: "granite3-dense:8b",
    name: "Granite 3 Dense · 8B",
    sizeGb: 4.9,
    ramGb: 16,
    tags: ["Entreprise"],
    category: "chat",
    description: "Modèle IBM pour usage professionnel.",
    bestFor: ["Entreprise", "Conformité", "Chat"],
  },
  {
    id: "command-r:35b",
    name: "Command R · 35B",
    sizeGb: 20,
    ramGb: 32,
    tags: ["RAG", "Premium"],
    category: "chat",
    description: "Optimisé pour RAG et outils.",
    bestFor: ["RAG", "Documents", "Recherche"],
  },
];

export function getModelFamily(model: RecommendedModel): ModelFamily | null {
  const id = model.id.toLowerCase();
  if (
    id.startsWith("llama") ||
    id.startsWith("codellama") ||
    id.startsWith("tinyllama") ||
    id.startsWith("llava")
  ) {
    return "llama";
  }
  if (id.startsWith("qwen")) {
    return "qwen";
  }
  if (
    id.startsWith("mistral") ||
    id.startsWith("mixtral") ||
    id.startsWith("dolphin-mistral") ||
    id.startsWith("bakllava")
  ) {
    return "mistral";
  }
  return null;
}

export function findModel(id: string): RecommendedModel | undefined {
  return RECOMMENDED_MODELS.find((m) => m.id === id);
}

export function modelsByCategory(category: ModelCategory): RecommendedModel[] {
  return RECOMMENDED_MODELS.filter((m) => m.category === category);
}

export type CompatibilityLevel = "compatible" | "limited" | "not_recommended";

export function getCompatibility(
  model: RecommendedModel,
  systemRamGb: number,
): CompatibilityLevel {
  if (systemRamGb >= model.ramGb) return "compatible";
  if (systemRamGb >= model.ramGb * 0.75) return "limited";
  return "not_recommended";
}

export function compatibilityLabel(level: CompatibilityLevel): string {
  switch (level) {
    case "compatible":
      return "Compatible";
    case "limited":
      return "Limite";
    case "not_recommended":
      return "Non recommandé";
  }
}
