# V1 — Checklist d'acceptation

## Prérequis cloud

- [x] Projet Supabase créé, migrations appliquées (incl. `host_models_context` via MCP, 2026-06-08)
- [X] Secrets : `RELAY_JWT_SECRET`, `RELAY_URL`, `APP_URL`
- [ ] Secrets release : `TAURI_SIGNING_PRIVATE_KEY`, `TAURI_SIGNING_PRIVATE_KEY_PASSWORD` (voir `docs/AUTO_UPDATE.md`)
- [x] Edge Functions déployées (5 fonctions, `runner-heartbeat` v4 avec sync modèles)
- [x] Relay Cloudflare deploye (smoke GET /health -> {"ok":true}, 2026-06-08)
- [x] Web deploye sur Vercel avec `NEXT_PUBLIC_*` (Production HTTP 200, commit 3410634)

## Tests manuels

| # | Critère | OK |
|---|---------|-----|
| 1 | Install Windows → Ollama + modèle sans CLI manuelle | |
| 2 | Pairing Supabase → host visible dashboard < 2 min | |
| 3 | Host éteint → web affiche « Hors ligne » | |
| 4 | Chat web → streaming < 60s (8 Go RAM, 3B) | |
| 5 | 2 onglets : second onglet reçoit erreur ou partage session | UX « autre onglet actif » — Web Locks + BroadcastChannel (`tab-session.ts`) |
| 6 | Aucun message chat en base Supabase | |
| 7 | Relais redémarre → reconnexion auto runner/web | |
| 8 | Lier un dossier Google Drive local depuis l'app Host | |
| 9 | Modifier un fichier lié → ré-indexation auto < 30 s | |
| 10 | Redémarrer Host → resync complet au lancement | |
| 11 | Chat avec base active utilise le contenu à jour | |
| 12 | Web affiche statut des sources liées (lecture seule) | |
| 13 | Chat RAG affiche badges sources cliquables (fichier + extrait + score) | |
| 13 | Instruction système par base : éditable Host, visible web, appliquée au prochain message | |
| 14 | Export conversation : télécharger le fil actuel en .md depuis le chat | |
| 15 | Patch unified : prévisualisation diff, Appliquer/Rejeter, jamais d'écriture silencieuse | |
| 16 | Partage conversation : lien temporaire, contenu seul (pas RAG) | |
| 17 | Palette commandes (`Ctrl+K`) + envoi chat (`Ctrl+Entrée`) | |
| 18 | Artefacts : ouvrir, copier ou télécharger en local (.md) depuis le panneau latéral | |

## UX Web — raccourcis clavier

- [x] Palette de commandes globale (`Ctrl+K` / `⌘K`) sur pages authentifiées
- [x] Envoi message chat via `Ctrl+Entrée` / `⌘Entrée`
- [x] Commandes contextuelles chat (nouvelle conversation, contexte, export, partage, arrêt)

## Mémoire utilisateur (Host)

- [x] Table `user_memory` dans `context.db`
- [x] Ajouter / supprimer fait (Tauri + WS `memory.add` / `memory.delete`)
- [x] Toggle global `userMemoryEnabled` (settings + WS `memory.setEnabled`)
- [x] Injection sélective au chat (mots-clés de la question)

## Projets / espaces de travail (Host v0.3)

- [x] Tables `projects` + `project_knowledge_bases` dans `context.db`
- [x] Créer / ouvrir / supprimer un projet (Host + WS `project.*`)
- [x] Ouvrir un projet active ses bases en un clic (persistance `active_project_id`)
- [x] Web : liste projets lecture seule + activation des bases

## Règles projet / .cursorrules (omoa-project-rules)

- [x] Lecture `.ownmyownai/rules.md` ou `.cursorrules` dans dossiers liés au projet
- [x] Injection automatique au chat (instructions système + règles + RAG)

## Sécurité locale (Host)

- [x] `context.db` chiffré au repos via DPAPI Windows (`context.db.enc`)
- [x] Providers cloud optionnels (OpenAI, Anthropic) : clés en keyring Host, routage relay depuis runner uniquement

## Modèles cloud (optionnels)

- [x] OpenAI / Anthropic activables dans `settings.json` (`cloudProviders`)
- [x] Clés API via keyring Host — jamais exposées au web ni au relay
- [x] Chat relay route vers API cloud si modèle `openai:*` ou `anthropic:*`

## Mode réflexion (omoa-thinking-mode)

- [x] `thinkingMode` dans `chat.start` + `chat.thinking_delta` (protocole WS)
- [x] Routage modèles thinking côté Host (`think: true`, `/api/chat`)
- [x] Sélecteur Normal / Réflexion + panneau repliable chaîne de pensée (web)

## Contexte lié (Host v0.2.0)

- [x] Images liées (.png/.jpg) décrites via modèle vision Ollama local, indexées en RAG
- [x] Chat vision : images pertinentes attachées au message quand un modèle multimodal est actif
- [x] Table `context_links` + colonnes `documents` (source lié / upload)
- [x] Ingestion depuis chemin (`ingest_from_path`, `reindex_document`)
- [x] Sync au lancement + watcher `notify` avec debounce
- [x] Sync planifiée (cron configurable, rapport `sync-schedule.log`, log par lien)
- [x] UI Host : lier fichier / dossier / disque, sync manuel
- [x] Web : statut liens, suppression document, progression upload
- [x] Déduplication cross-liens : même contenu sous deux chemins → un seul index (hash SHA-256)
- [x] Politique par extension : allowlist configurable par lien (Host + protocole WS)

## Recherche full-text (omoa-fulltext-search)

- [x] Table virtuelle FTS5 `chunks_fts` (contenu + nom de fichier)
- [x] Triggers sync insert/update/delete + backfill au démarrage
- [x] RAG hybride : hits FTS prioritaires, complétés par similarité embeddings
- [x] Requête « contrat 2024 » trouve le chunk sans similarité sémantique (tests unitaires)

## Index codebase Git (omoa-codebase-index)

- [x] Lier dépôt Git local (`link_context_repo`, type `repo`, exclusion `.git`)
- [x] Table `code_symbols` + index embeddings sur fichiers code
- [x] Chat : recherche symbole/fichier via `build_codebase_context` + `contextIds`
- [x] UI Host : bouton « Dépôt Git », compteur symboles sur liens `repo`

## Outils locaux (omoa-local-tools)

- [x] `read_file`, `search_chunks`, `list_dir`, `stat` — sandbox chemins liés
- [x] Tool calling Ollama côté Host (`enableTools` dans `chat.start`)
- [x] Schémas protocole `LocalToolNameSchema` dans `@ownmyownai/protocol`

## Agent multi-étapes (omoa-multi-step-agent)

- [x] Boucle plan → outil → observation → réponse (`run_agent_loop`, max 10 étapes)
- [x] Garde-fous : sandbox chemins liés, annulation `chat.cancel`, erreur outil renvoyée au modèle
- [x] Chat relay : `enableTools: true` dans `chat.start` déclenche l'agent multi-étapes
- [x] Playbooks Host (`summarize-folder`) réutilisent la même boucle

## Quantization advisor (omoa-quantization-advisor)

- [x] Recommandation Q4/Q8 selon RAM et espace disque (`hardware.rs`, `get_quantization_advice`)
- [x] Suggestion affichée à l'ajout d'un modèle (ModelSetup + ModelManager)

## Fallback modèle (Host)

- [x] `fallbackModel` dans `settings.json` + chaîne auto (défaut → sélection → `llama3.2:3b`)
- [x] Chat relay : bascule si modèle absent ou premier token &gt; 45 s (`chat.modelFallback` WS)
- [x] UI Host : sélecteur modèle secours dans le gestionnaire de modèles

## Background agent (Host)

- [x] File de tâches `tokio::spawn` (indexation, agent multi-étapes)
- [x] Statut tray + événements WS `job.*`
- [x] Annulation via `job.cancel` / `cancel_background_job`

## Notifications desktop (omoa-desktop-notifications)

- [x] Toast Windows à la fin d'une indexation (`sync_all_links`, `sync_context_link`, jobs `context.sync*`)
- [x] Toast Windows à la fin d'un agent / playbook
- [x] `tauri-plugin-notification` + réglage `desktopNotifications` (défaut activé)
- [x] `cargo check` dans `apps/runner/src-tauri`

## Review PR assistée (omoa-pr-review)

- [x] Dépôts Git détectés depuis les liens de contexte
- [x] Coller ou charger un diff → review structurée locale (Ollama + checklist sécurité)
- [x] Intégration `git diff` et `gh pr diff` optionnelle
- [x] Protocole WS `pr.review` / `pr.review.done` dans `packages/protocol`
- [x] `cargo check` dans `apps/runner/src-tauri`

## Branches de conversation (omoa-conversation-branches)

- [x] Fork depuis le message N sans écraser le fil principal (Host SQLite + cache web)
- [x] Protocole WS `history.fork` / `history.branches` dans `packages/protocol`
- [x] UI web : bouton « Brancher ici » + sélecteur de branches
- [x] Tests unitaires `conversation-store` (fork, switch, nouvelle racine)

## Build local

```bash
npm install
npm run build --workspace=@ownmyownai/protocol
npm run build --workspace=@ownmyownai/web
cd apps/runner && npm run tauri build
```
