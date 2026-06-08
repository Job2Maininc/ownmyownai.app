# Registre des sous-agents OwnMyOwnAI

Chaque fonctionnalité inspirée de Claude / Cursor / Codex dispose d'un skill dans `.cursor/skills/<id>/SKILL.md`.

## Comment utiliser

1. Choisir un ID dans le tableau ci-dessous.
2. Demander à l'agent : **« Utilise le sous-agent `<id>` pour implémenter … »**
3. Ou lancer un **Task** (subagent) avec le contenu du SKILL.md en prompt.

## Tableau des sous-agents

| ID | Fonctionnalité | Catégorie | Priorité | Dépendances |
|----|----------------|-----------|----------|-------------|
| `omoa-projects` | Projets / espaces de travail | Claude | P1 | omoa-system-instructions, omoa-host-chat-history |
| `omoa-system-instructions` | Instructions personnalisées | Claude | P1 | omoa-projects |
| `omoa-artifacts` | Artefacts (panneau latéral) | Claude | P2 | — |
| `omoa-rag-citations` | Citations RAG explicites | Claude | P1 | — |
| `omoa-conversation-summary` | Résumé longues conversations | Claude | P2 | omoa-host-chat-history |
| `omoa-conversation-branches` | Branches de conversation | Claude | P3 | omoa-host-chat-history |
| `omoa-thinking-mode` | Mode réflexion / raisonnement | Claude | P2 | — |
| `omoa-chat-mentions` | @mentions (fichier, dossier, base) | Cursor | P1 | omoa-rag-citations |
| `omoa-codebase-index` | Index codebase Git | Cursor | P2 | — |
| `omoa-diff-apply` | Diff / apply patch | Cursor | P2 | omoa-local-tools |
| `omoa-integrated-terminal` | Terminal intégré | Cursor | P3 | omoa-local-tools |
| `omoa-project-rules` | Rules / .cursorrules par projet | Cursor | P2 | omoa-projects |
| `omoa-multi-model-routing` | Multi-modèle par tâche | Cursor | P2 | — |
| `omoa-background-agent` | Background agent | Cursor | P2 | omoa-multi-step-agent |
| `omoa-inline-edit` | Inline edit sur document lié | Cursor | P3 | omoa-diff-apply |
| `omoa-multi-step-agent` | Agent multi-étapes | Codex | P1 | omoa-local-tools |
| `omoa-local-tools` | Outils locaux (read/search/list) | Codex | P1 | — |
| `omoa-mcp-servers` | MCP servers côté Host | Codex | P2 | omoa-local-tools |
| `omoa-playbooks` | Skills / playbooks | Codex | P2 | omoa-multi-step-agent |
| `omoa-scheduled-sync` | Sync planifiée (cron) | Codex | P3 | — |
| `omoa-pr-review` | PR / review assisté | Codex | P3 | omoa-codebase-index, omoa-local-tools |
| `omoa-user-memory` | Mémoire persistante utilisateur | Mémoire | P2 | — |
| `omoa-host-chat-history` | Historique complet Host (SQLite) | Mémoire | P1 | — |
| `omoa-fulltext-search` | Recherche full-text | Mémoire | P2 | — |
| `omoa-pdf-ocr` | OCR PDF scannés | Mémoire | P3 | — |
| `omoa-vision-context` | Images dans le contexte | Mémoire | P3 | — |
| `omoa-dedup` | Déduplication intelligente | Mémoire | P3 | — |
| `omoa-cloud-providers` | Providers cloud optionnels | Modèles | P2 | — |
| `omoa-model-fallback` | Fallback modèle | Modèles | P2 | — |
| `omoa-local-metrics` | Métriques locales | Modèles | P2 | — |
| `omoa-quantization-advisor` | Quantization advisor | Modèles | P3 | — |
| `omoa-multi-tab-session` | Session partagée multi-onglets | UX Web | P1 | — |
| `omoa-export-conversation` | Export conversation | UX Web | P2 | omoa-host-chat-history |
| `omoa-readonly-share` | Partage lecture seule | UX Web | P3 | omoa-host-chat-history |
| `omoa-desktop-notifications` | Notifications desktop | UX Web | P2 | omoa-background-agent |
| `omoa-keyboard-shortcuts` | Raccourcis clavier | UX Web | P3 | — |
| `omoa-audit-trail` | Audit trail local | Sécurité | P2 | — |
| `omoa-air-gapped` | Mode air-gapped | Sécurité | P3 | — |
| `omoa-context-db-encryption` | Chiffrement context.db | Sécurité | P2 | — |
| `omoa-extension-policy` | Politique par extension | Sécurité | P2 | — |

## Ordre recommandé (v0.3)

1. **P1** : omoa-rag-citations → omoa-host-chat-history → omoa-local-tools → omoa-multi-step-agent → omoa-chat-mentions → omoa-projects
2. **P2** : omoa-system-instructions, omoa-fulltext-search, omoa-multi-tab-session, omoa-cloud-providers
3. **P3+** : reste selon besoin produit

## Orchestration multi-agents

Pour une release thématique, lancer en parallèle des Tasks avec des IDs indépendants (sans dépendance croisée). Séquencer ceux qui partagent le même module (ex. `agent/`).

## Régénération

```bash
node scripts/generate-subagent-skills.mjs
```
