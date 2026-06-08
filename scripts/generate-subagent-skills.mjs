import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const root = path.resolve(__dirname, "..");
const skillsDir = path.join(root, ".cursor", "skills");

const commonContext = `## Contexte OwnMyOwnAI (obligatoire)

- **Inference** : uniquement via \`apps/runner\` (Tauri) + Ollama — jamais depuis le web.
- **Relay** : \`apps/relay\` (Cloudflare DO) — transport WS uniquement, pas de stockage chat.
- **Protocole** : \`packages/protocol\` — tout nouveau message WS passe par Zod ici.
- **Contexte RAG** : SQLite local \`%LOCALAPPDATA%\\OwnMyOwnAI\\context.db\` — lecture sur place pour sources liées.
- **Secrets** : keyring Host — jamais exposés au navigateur ni au relay.
- **Langue UI** : français. Code/comments : anglais si convention existante.
- **Principes** : diff minimal, réutiliser patterns existants (\`relay.rs\`, \`context/\`, \`settings.rs\`).

## Workflow du sous-agent

1. Lire les fichiers listés ci-dessous avant toute modification.
2. Proposer un plan court (3–6 étapes) si la tâche est ambiguë.
3. Implémenter côté Host en priorité pour toute donnée sensible.
4. Étendre le protocole WS si le web doit afficher ou déclencher la feature.
5. Mettre à jour \`docs/V1_CHECKLIST.md\` ou \`docs/ROADMAP.md\` si critère d'acceptation ajouté.
6. Vérifier : \`cargo check\` (runner), build protocol, tests pertinents.
7. Commit avec message en français centré sur le *pourquoi*.`;

const agents = [
  { id: "omoa-projects", title: "Projets / espaces de travail", category: "Claude", priority: "P1", deps: "omoa-system-instructions, omoa-host-chat-history", files: "apps/web, apps/runner/src-tauri/src/context, packages/protocol", scope: "Grouper bases de contexte, instructions système et historique par projet nommé.", acceptance: "Créer/ouvrir un projet ; activer ses bases en un clic ; persistance locale." },
  { id: "omoa-system-instructions", title: "Instructions personnalisées", category: "Claude", priority: "P1", deps: "omoa-projects", files: "apps/runner/src-tauri/src/settings.rs, relay.rs, chat-view", scope: "Prompt système par base/projet injecté avant RAG dans chat.start.", acceptance: "Instruction éditable Host ; visible web lecture seule ; appliquée au prochain message." },
  { id: "omoa-artifacts", title: "Artefacts (panneau latéral)", category: "Claude", priority: "P2", deps: "", files: "apps/web/src/components/chat", scope: "Panneau pour markdown/tableaux générés, export local.", acceptance: "L'assistant peut ouvrir un artefact ; l'utilisateur copie/télécharge sans cloud." },
  { id: "omoa-rag-citations", title: "Citations RAG explicites", category: "Claude", priority: "P1", deps: "", files: "apps/runner/src-tauri/src/context/rag.rs, relay.rs, chat-view", scope: "Retourner source fichier + extrait + score ; afficher badges cliquables.", acceptance: "Chaque affirmation RAG cite au moins un chunk avec chemin tronqué." },
  { id: "omoa-conversation-summary", title: "Résumé longues conversations", category: "Claude", priority: "P2", deps: "omoa-host-chat-history", files: "apps/runner relay, history module", scope: "Compaction auto quand tokens > seuil ; résumé injecté en system.", acceptance: "Conversation 50+ messages reste utilisable sans troncature brutale." },
  { id: "omoa-conversation-branches", title: "Branches de conversation", category: "Claude", priority: "P3", deps: "omoa-host-chat-history", files: "apps/web chat, history store", scope: "Fork depuis un message ; arbre local.", acceptance: "Repartir du message N sans écraser le fil principal." },
  { id: "omoa-thinking-mode", title: "Mode réflexion / raisonnement", category: "Claude", priority: "P2", deps: "", files: "ollama.rs, chat-view, settings", scope: "Route modèles thinking ; UI repliable pour chaîne de pensée.", acceptance: "Sélecteur mode normal/réflexion ; streaming séparé pensée/réponse." },
  { id: "omoa-chat-mentions", title: "@mentions (fichier, dossier, base)", category: "Cursor", priority: "P1", deps: "omoa-rag-citations", files: "chat-view, context-panel, rag.rs", scope: "Parser @fichier @dossier @base dans le composer.", acceptance: "@base:Notes limite le RAG à cette base uniquement." },
  { id: "omoa-codebase-index", title: "Index codebase Git", category: "Cursor", priority: "P2", deps: "", files: "context/sync.rs, index module", scope: "Lier repo ; index symboles + embeddings ; exclusions .git.", acceptance: "Lier repo local ; recherche symbole/fichier dans le chat." },
  { id: "omoa-diff-apply", title: "Diff / apply patch", category: "Cursor", priority: "P2", deps: "omoa-local-tools", files: "runner agent module, web diff UI", scope: "Proposer patch unified ; appliquer via Host avec confirmation.", acceptance: "Preview diff ; Appliquer/Rejeter ; jamais d'écriture silencieuse." },
  { id: "omoa-integrated-terminal", title: "Terminal intégré", category: "Cursor", priority: "P3", deps: "omoa-local-tools", files: "runner process.rs, relay", scope: "Exécuter commandes allowlistées depuis agent.", acceptance: "Commande dans liste blanche ; timeout ; sortie streamée au web." },
  { id: "omoa-project-rules", title: "Rules / .cursorrules par projet", category: "Cursor", priority: "P2", deps: "omoa-projects", files: "context ingest, sync", scope: "Lire .ownmyownai/rules.md ou .cursorrules dans dossiers liés.", acceptance: "Règles du dossier lié injectées automatiquement au chat du projet." },
  { id: "omoa-multi-model-routing", title: "Multi-modèle par tâche", category: "Cursor", priority: "P2", deps: "", files: "settings.rs, relay chat handler", scope: "Petit modèle résumé, gros rédaction — routage par intent.", acceptance: "Config Host : mapping tâche→modèle ; fallback si modèle absent." },
  { id: "omoa-background-agent", title: "Background agent", category: "Cursor", priority: "P2", deps: "omoa-multi-step-agent", files: "runner jobs queue, tray notifications", scope: "Tâches longues en tokio::spawn ; statut tray + WS event.", acceptance: "Lancer indexation/agent ; notification fin ; annulation possible." },
  { id: "omoa-inline-edit", title: "Inline edit sur document lié", category: "Cursor", priority: "P3", deps: "omoa-diff-apply", files: "web + runner file write", scope: "Sélection texte → reformuler → écrire fichier source (confirmé).", acceptance: "Modifier paragraphe dans .md lié avec preview." },
  { id: "omoa-multi-step-agent", title: "Agent multi-étapes", category: "Codex", priority: "P1", deps: "omoa-local-tools", files: "apps/runner/src-tauri/src/agent/", scope: "Boucle plan→outil→observation→réponse avec limite d'étapes.", acceptance: "Agent termine tâche fichier en ≤10 étapes avec garde-fous." },
  { id: "omoa-local-tools", title: "Outils locaux (read/search/list)", category: "Codex", priority: "P1", deps: "", files: "agent/tools.rs, protocol tool types", scope: "read_file, search_chunks, list_dir, stat — sandbox chemins liés.", acceptance: "Modèle appelle outil ; Host exécute ; résultat JSON au modèle." },
  { id: "omoa-mcp-servers", title: "MCP servers côté Host", category: "Codex", priority: "P2", deps: "omoa-local-tools", files: "runner mcp bridge", scope: "Configurer MCP dans Host ; proxy vers agent.", acceptance: "Un MCP (ex. filesystem) utilisable depuis le chat web via relay." },
  { id: "omoa-playbooks", title: "Skills / playbooks", category: "Codex", priority: "P2", deps: "omoa-multi-step-agent", files: ".cursor/skills, web playbook picker", scope: "Recettes réutilisables déclenchables depuis UI.", acceptance: "Choisir playbook « Résumer dossier » ; exécute workflow agent." },
  { id: "omoa-scheduled-sync", title: "Sync planifiée (cron)", category: "Codex", priority: "P3", deps: "", files: "watcher.rs, settings", scope: "Resync liens à heure fixe ; rapport local.", acceptance: "Cron configurable ; log dernière exécution par lien." },
  { id: "omoa-pr-review", title: "PR / review assisté", category: "Codex", priority: "P3", deps: "omoa-codebase-index, omoa-local-tools", files: "agent + gh integration", scope: "Résumer diff git ; checklist sécurité.", acceptance: "Sur repo lié : coller diff → review structurée locale." },
  { id: "omoa-user-memory", title: "Mémoire persistante utilisateur", category: "Mémoire", priority: "P2", deps: "", files: "context.db user_memory table", scope: "Faits opt-in ; injection sélective au chat.", acceptance: "Ajouter/supprimer fait ; toggle global mémoire on/off." },
  { id: "omoa-host-chat-history", title: "Historique complet Host (SQLite)", category: "Mémoire", priority: "P1", deps: "", files: "history.rs, relay, web", scope: "Persister threads/messages localement ; sync web via WS.", acceptance: "Fermer navigateur ; rouvrir ; historique intact depuis Host." },
  { id: "omoa-fulltext-search", title: "Recherche full-text", category: "Mémoire", priority: "P2", deps: "", files: "store.rs FTS5", scope: "FTS sur chunks + noms fichiers en complément embeddings.", acceptance: "Recherche « contrat 2024 » trouve chunk même sans similarité sémantique." },
  { id: "omoa-pdf-ocr", title: "OCR PDF scannés", category: "Mémoire", priority: "P3", deps: "", files: "ingest.rs", scope: "Pipeline OCR local si pdf-extract échoue.", acceptance: "PDF scanné indexé avec texte extractible." },
  { id: "omoa-vision-context", title: "Images dans le contexte", category: "Mémoire", priority: "P3", deps: "", files: "ingest, ollama vision", scope: "Supporter .png/.jpg liés ; modèle vision local.", acceptance: "Image liée décrite/indexée ; utilisable en question vision." },
  { id: "omoa-dedup", title: "Déduplication intelligente", category: "Mémoire", priority: "P3", deps: "", files: "sync.rs, store.rs", scope: "Hash contenu ; éviter doublons cross-liens.", acceptance: "Même fichier sous deux chemins → un seul index." },
  { id: "omoa-cloud-providers", title: "Providers cloud optionnels", category: "Modèles", priority: "P2", deps: "", files: "settings, provider layer", scope: "Clés API en keyring ; routage depuis Host uniquement.", acceptance: "OpenAI/Anthropic optionnel ; clé jamais dans relay/web." },
  { id: "omoa-model-fallback", title: "Fallback modèle", category: "Modèles", priority: "P2", deps: "", files: "relay chat, settings", scope: "Si modèle absent/lent → modèle secours auto.", acceptance: "Chat réussit avec modèle fallback configuré." },
  { id: "omoa-local-metrics", title: "Métriques locales", category: "Modèles", priority: "P2", deps: "", files: "host_status, heartbeat", scope: "Tokens/s, latence, RAM exposés au dashboard.", acceptance: "Dashboard affiche métriques dernière requête." },
  { id: "omoa-quantization-advisor", title: "Quantization advisor", category: "Modèles", priority: "P3", deps: "", files: "hardware.rs, UI Host", scope: "Recommander Q4/Q8 selon RAM/disque.", acceptance: "Suggestion affichée à l'ajout d'un modèle." },
  { id: "omoa-multi-tab-session", title: "Session partagée multi-onglets", category: "UX Web", priority: "P1", deps: "", files: "relay-client, Web Locks API", scope: "Un seul onglet actif chat ; autres en lecture ou file d'attente.", acceptance: "2 onglets : message clair, pas de réponses perdues." },
  { id: "omoa-export-conversation", title: "Export conversation", category: "UX Web", priority: "P2", deps: "omoa-host-chat-history", files: "web export utils", scope: "Markdown/PDF local.", acceptance: "Exporter thread en .md depuis le chat." },
  { id: "omoa-readonly-share", title: "Partage lecture seule", category: "UX Web", priority: "P3", deps: "omoa-host-chat-history", files: "web + optional edge", scope: "Lien temporaire sans exposer docs RAG.", acceptance: "Lien expire ; contenu conversation seulement." },
  { id: "omoa-desktop-notifications", title: "Notifications desktop", category: "UX Web", priority: "P2", deps: "omoa-background-agent", files: "tray.rs, tauri notification", scope: "Notifier fin indexation/agent.", acceptance: "Toast Windows quand sync/agent terminé." },
  { id: "omoa-keyboard-shortcuts", title: "Raccourcis clavier", category: "UX Web", priority: "P3", deps: "", files: "apps/web", scope: "Ctrl+K palette, Ctrl+Enter envoyer, etc.", acceptance: "Palette commandes accessible au clavier." },
  { id: "omoa-audit-trail", title: "Audit trail local", category: "Sécurité", priority: "P2", deps: "", files: "context.db audit_log", scope: "Journal indexation, suppressions, accès agent.", acceptance: "Historique actions consultable Host ; pas de cloud." },
  { id: "omoa-air-gapped", title: "Mode air-gapped", category: "Sécurité", priority: "P3", deps: "", files: "settings, relay", scope: "Désactiver relay/cloud ; LAN optionnel.", acceptance: "Mode offline total ; chat local uniquement." },
  { id: "omoa-context-db-encryption", title: "Chiffrement context.db", category: "Sécurité", priority: "P2", deps: "", files: "store.rs, DPAPI", scope: "Chiffrer SQLite au repos via DPAPI Windows.", acceptance: "DB illisible sans session Windows utilisateur." },
  { id: "omoa-extension-policy", title: "Politique par extension", category: "Sécurité", priority: "P2", deps: "", files: "sync.rs, settings", scope: "Allowlist extensions par lien.", acceptance: "Lien n'indexe que extensions configurées." },
];

function skillContent(a) {
  const deps = a.deps || "aucune";
  return `---
name: ${a.id}
description: >-
  Sous-agent OwnMyOwnAI — ${a.title}. Catégorie ${a.category}.
  Priorité ${a.priority}. Use when implementing, designing, reviewing, or debugging ${a.title}.
---

# Sous-agent : ${a.title}

> **ID** : \`${a.id}\` · **Catégorie** : ${a.category} · **Priorité** : ${a.priority} · **Dépendances** : ${deps}

## Mission

${a.scope}

## Périmètre

**In scope** : ${a.scope}

**Hors scope** : stockage chat Supabase ; exposition secrets au web ; copie fichiers liés vers cloud.

## Fichiers probables

\`${a.files}\`

${commonContext}

## Critères d'acceptation

- ${a.acceptance}
- \`cargo check\` passe dans \`apps/runner/src-tauri\`.
- Protocole WS documenté dans \`packages/protocol\` si applicable.
- Aucune régression sur pairing, relay chat, contexte lié v0.2.

## Invocation

Dans Cursor, demander : *« Utilise le sous-agent ${a.id} pour [tâche] »* ou lancer un agent Task avec ce skill en contexte.
`;
}

fs.mkdirSync(skillsDir, { recursive: true });

for (const a of agents) {
  const dir = path.join(skillsDir, a.id);
  fs.mkdirSync(dir, { recursive: true });
  fs.writeFileSync(path.join(dir, "SKILL.md"), skillContent(a), "utf8");
}

let registry = `# Registre des sous-agents OwnMyOwnAI

Chaque fonctionnalité inspirée de Claude / Cursor / Codex dispose d'un skill dans \`.cursor/skills/<id>/SKILL.md\`.

## Comment utiliser

1. Choisir un ID dans le tableau ci-dessous.
2. Demander à l'agent : **« Utilise le sous-agent \`<id>\` pour implémenter … »**
3. Ou lancer un **Task** (subagent) avec le contenu du SKILL.md en prompt.

## Tableau des sous-agents

| ID | Fonctionnalité | Catégorie | Priorité | Dépendances |
|----|----------------|-----------|----------|-------------|
`;

for (const a of agents) {
  registry += `| \`${a.id}\` | ${a.title} | ${a.category} | ${a.priority} | ${a.deps || "—"} |\n`;
}

registry += `
## Ordre recommandé (v0.3)

1. **P1** : omoa-rag-citations → omoa-host-chat-history → omoa-local-tools → omoa-multi-step-agent → omoa-chat-mentions → omoa-projects
2. **P2** : omoa-system-instructions, omoa-fulltext-search, omoa-multi-tab-session, omoa-cloud-providers
3. **P3+** : reste selon besoin produit

## Orchestration multi-agents

Pour une release thématique, lancer en parallèle des Tasks avec des IDs indépendants (sans dépendance croisée). Séquencer ceux qui partagent le même module (ex. \`agent/\`).

## Régénération

\`\`\`bash
node scripts/generate-subagent-skills.mjs
\`\`\`
`;

fs.writeFileSync(path.join(root, "docs", "SUBAGENTS.md"), registry, "utf8");
console.log(`Generated ${agents.length} sub-agent skills + docs/SUBAGENTS.md`);
