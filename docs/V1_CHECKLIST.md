# V1 — Checklist d'acceptation

## Prérequis cloud

- [x] Projet Supabase créé, migrations appliquées (incl. `host_models_context` via MCP, 2026-06-08)
- [X] Secrets : `RELAY_JWT_SECRET`, `RELAY_URL`, `APP_URL`
- [x] Doc/CI release : procédure `TAURI_SIGNING_PRIVATE_KEY` pour auto-update (`docs/AUTO_UPDATE.md`, `setup-tauri-signing.ps1`, workflow `release-windows.yml`)
- [ ] Secrets GitHub déposés : `TAURI_SIGNING_PRIVATE_KEY`, `TAURI_SIGNING_PRIVATE_KEY_PASSWORD` (`gh secret list` — voir `docs/AUTO_UPDATE.md`)
- [x] Edge Functions déployées (5 fonctions, `runner-heartbeat` v4 avec sync modèles)
- [x] Relay Cloudflare deploye (smoke GET /health -> {"ok":true}, 2026-06-08)
- [x] Web deploye sur Vercel avec `NEXT_PUBLIC_*` (Production HTTP 200, commit 3410634)

## Tests manuels

Procédure d'acceptation V1 exécutée sur une machine Windows réelle (pas uniquement dev). Chaque cas possède des **instructions reproductibles** et un bloc **Résultat** à remplir après exécution.

### Environnement de référence

| Élément | Valeur attendue |
|---------|-----------------|
| OS | Windows 10/11 x64 |
| RAM | 8 Go (obligatoire pour TM-04) |
| Web | URL Vercel production (`NEXT_PUBLIC_*` configurés, voir `docs/DEPLOYMENT.md`) |
| Host | Installateur ou build Tauri local, pairé au même compte Supabase |
| Modèle local | `llama3.2:3b` ou équivalent 3B (TM-04) |
| Ollama | Installé par le Host ou déjà présent ; pas de commandes CLI manuelles pour TM-01 |
| Supabase | Projet cloud avec migrations + Edge Functions (section Prérequis cloud) |
| Relay | Worker Cloudflare déployé, `GET /health` → `{"ok":true}` |

**Ordre recommandé :** TM-01 → TM-02 → TM-03 → TM-04 → TM-07 → contexte (TM-08–12) → RAG/UX (TM-13–18).

### Légende des résultats

| Statut | Signification |
|--------|---------------|
| `OK` | Critère satisfait |
| `KO` | Échec reproductible — détailler dans **Notes** (+ lien issue si ouverte) |
| `N/A` | Non applicable (ex. pas de Google Drive local) |
| `—` | Pas encore exécuté |

### Tableau de synthèse

| # | Critère | Résultat | Date | Testeur | Build / commit | Notes |
|---|---------|:------:|------|---------|----------------|-------|
| TM-01 | Install Windows → Ollama + modèle sans CLI manuelle | — | | | | |
| TM-02 | Pairing Supabase → host visible dashboard &lt; 2 min | — | | | | |
| TM-03 | Host éteint → web affiche « Hors ligne » | — | | | | |
| TM-04 | Chat web → streaming &lt; 60 s (8 Go RAM, 3B) | — | | | | |
| TM-05 | 2 onglets : message « autre onglet actif » ou file d'attente | — | | | | Web Locks + `tab-session.ts` |
| TM-06 | Aucun message chat en base Supabase | — | | | | |
| TM-07 | Relais redémarre → reconnexion auto runner/web | — | | | | |
| TM-08 | Lier un dossier Google Drive local depuis l'app Host | — | | | | |
| TM-09 | Modifier un fichier lié → ré-indexation auto &lt; 30 s | — | | | | |
| TM-10 | Redémarrer Host → resync complet au lancement | — | | | | |
| TM-11 | Chat avec base active utilise le contenu à jour | — | | | | |
| TM-12 | Web affiche statut des sources liées (lecture seule) | — | | | | |
| TM-13 | Chat RAG : badges sources cliquables (fichier + extrait + score) | — | | | | `chat.citations` + `RagCitationBadges` |
| TM-13b | Instruction système par base : Host éditable, web visible, appliquée au prochain message | — | | | | |
| TM-14 | Export conversation : télécharger le fil en .md depuis le chat | — | | | | |
| TM-15 | Patch unified : preview diff, Appliquer/Rejeter, pas d'écriture silencieuse | — | | | | |
| TM-15b | Artefacts : prompt Host ; bloc `artifact` → panneau latéral copie/téléchargement .md | — | | | | `assistant_output.rs` + `artifacts.ts` |
| TM-16 | Partage conversation : lien temporaire, contenu seul (pas RAG) | — | | | | |
| TM-17 | Palette commandes (`Ctrl+K`) + envoi chat (`Ctrl+Entrée`) | — | | | | |
| TM-18 | Artefacts : ouvrir, copier ou télécharger .md depuis le panneau latéral | — | | | | |

---

### Cas détaillés

Pour chaque cas : exécuter les étapes, comparer au **résultat attendu**, puis remplir le bloc **Résultat** (et la ligne correspondante dans le tableau de synthèse).

---

#### TM-01 — Installation Windows sans CLI manuelle

**Objectif :** Un utilisateur final installe le Host et obtient Ollama + un modèle utilisable sans ouvrir un terminal.

**Prérequis :** Machine Windows vierge ou sans Ollama ; installateur Host (`.msi` ou portable).

**Instructions :**

1. Lancer l'installateur Host (ou extraire le ZIP portable).
2. Suivre l'assistant de première configuration (modèle suggéré, ex. `llama3.2:3b`).
3. Attendre la fin du téléchargement / pull du modèle.
4. Vérifier dans le gestionnaire de modèles Host que le modèle est listé comme disponible.
5. Ne pas exécuter de commande `ollama` manuellement.

**Résultat attendu :** Ollama opérationnel et au moins un modèle prêt ; chat local ou statut Host « prêt » sans intervention CLI.

| Champ | Valeur |
|-------|--------|
| Résultat | — |
| Date | |
| Testeur | |
| Build / commit | |
| Notes / captures | |

---

#### TM-02 — Pairing Supabase

**Objectif :** Associer le Host au compte web ; le dashboard affiche le host en ligne rapidement.

**Prérequis :** Compte Supabase créé sur le web ; Host lancé ; section Prérequis cloud validée.

**Instructions :**

1. Se connecter sur l'app web (Vercel).
2. Ouvrir le flux de pairing (code à 6 chiffres ou QR selon l'UI).
3. Dans le Host, saisir le code / confirmer le pairing.
4. Chronométrer jusqu'à l'apparition du host sur le dashboard web (statut en ligne).
5. Vérifier que le nom / ID du host correspond.

**Résultat attendu :** Host visible et en ligne sur le dashboard en **moins de 2 minutes** après validation du code.

| Champ | Valeur |
|-------|--------|
| Résultat | — |
| Date | |
| Testeur | |
| Build / commit | |
| Notes / captures | |

---

#### TM-03 — Host hors ligne

**Objectif :** Le web reflète correctement l'absence du runner.

**Prérequis :** Host pairé et précédemment en ligne (TM-02).

**Instructions :**

1. Depuis le web, confirmer que le host est « En ligne ».
2. Quitter complètement l'application Host (pas seulement réduire dans le tray).
3. Attendre ≤ 30 s (heartbeat / timeout UI).
4. Rafraîchir la page dashboard ou chat si nécessaire.

**Résultat attendu :** Statut **« Hors ligne »** (ou équivalent) affiché ; pas de streaming chat possible.

| Champ | Valeur |
|-------|--------|
| Résultat | — |
| Date | |
| Testeur | |
| Build / commit | |
| Notes / captures | |

---

#### TM-04 — Streaming chat web (perf)

**Objectif :** Première réponse streamed dans un délai acceptable sur matériel minimal.

**Prérequis :** Machine **8 Go RAM** ; modèle **~3B** actif ; Host en ligne ; TM-02 OK.

**Instructions :**

1. Ouvrir le chat web, sélectionner le host et le modèle 3B.
2. Envoyer un message court (ex. « Explique en 3 phrases ce qu'est OwnMyOwnAI »).
3. Chronométrer jusqu'au **premier token** affiché dans l'UI.
4. Laisser le stream se terminer.

**Résultat attendu :** Premier token en **&lt; 60 secondes** ; stream continu sans erreur relay.

| Champ | Valeur |
|-------|--------|
| Résultat | — |
| Date | |
| Testeur | |
| Build / commit | |
| Durée 1er token (s) | |
| Notes / captures | |

---

#### TM-05 — Session multi-onglets

**Objectif :** Comportement défini quand deux onglets web utilisent le même host.

**Prérequis :** Host en ligne ; navigateur permettant plusieurs onglets (Chrome/Edge).

**Instructions :**

1. Ouvrir l'app web dans l'onglet A ; démarrer ou préparer un chat.
2. Ouvrir la même session (même URL / compte) dans l'onglet B.
3. Tenter d'envoyer un message depuis B pendant qu'A est actif (ou inversement).
4. Observer bannière, toast ou message d'erreur.

**Résultat attendu :** Le second onglet affiche une UX explicite (« autre onglet actif », file d'attente, ou erreur claire) — pas de corruption silencieuse du fil. Réf. `apps/web/src/lib/tab-session.ts`.

| Champ | Valeur |
|-------|--------|
| Résultat | — |
| Date | |
| Testeur | |
| Build / commit | |
| Notes / captures | |

---

#### TM-06 — Confidentialité messages (Supabase)

**Objectif :** Aucun contenu de conversation n'est stocké côté cloud.

**Prérequis :** Au moins un échange chat complet via le web (TM-04).

**Instructions :**

1. Envoyer 2–3 messages dont un avec contenu identifiable (ex. chaîne unique `TEST-V1-XXXX`).
2. Ouvrir Supabase Dashboard → **Table Editor**.
3. Parcourir toutes les tables du projet (`profiles`, `hosts`, `pairing_requests`, etc.).
4. Rechercher la chaîne unique dans les colonnes texte / JSON.

**Résultat attendu :** **Aucune** table ne contient le corps des messages chat ; seules métadonnées host/pairing éventuelles.

| Champ | Valeur |
|-------|--------|
| Résultat | — |
| Date | |
| Testeur | |
| Build / commit | |
| Tables vérifiées | |
| Notes / captures | |

---

#### TM-07 — Résilience relay

**Objectif :** Reconnexion automatique après interruption du relais.

**Prérequis :** Host + web connectés ; accès pour redémarrer le Worker relay (ou couper réseau ciblé).

**Instructions :**

1. Confirmer chat ou dashboard « connecté ».
2. Redémarrer le Worker Cloudflare relay (ou simuler coupure &lt; 1 min).
3. Attendre sans relancer manuellement le Host.
4. Renvoyer un message chat depuis le web.

**Résultat attendu :** Runner et web se reconnectent **automatiquement** ; chat fonctionnel sans re-pairing.

| Champ | Valeur |
|-------|--------|
| Résultat | — |
| Date | |
| Testeur | |
| Build / commit | |
| Notes / captures | |

---

#### TM-08 — Lier Google Drive local

**Objectif :** Indexer un dossier synchronisé Google Drive depuis le Host.

**Prérequis :** Google Drive for Desktop installé ; dossier local synchronisé avec quelques fichiers `.md` ou `.txt`.

**Instructions :**

1. Host → Contexte / liens → « Lier dossier » (ou équivalent).
2. Choisir un dossier sous le chemin Google Drive local (ex. `G:\Mon Drive\docs-test`).
3. Attendre la fin de l'indexation initiale (notification ou compteur documents).
4. Vérifier que les fichiers apparaissent dans la liste des documents indexés.

**Résultat attendu :** Lien créé ; documents comptabilisés ; pas d'erreur de chemin hors sandbox.

| Champ | Valeur |
|-------|--------|
| Résultat | — |
| Date | |
| Testeur | |
| Build / commit | |
| Chemin testé | |
| Notes / captures | |

---

#### TM-09 — Ré-indexation après modification

**Objectif :** Le watcher détecte les changements fichiers rapidement.

**Prérequis :** TM-08 OK ; fichier texte déjà indexé.

**Instructions :**

1. Noter l'horodatage / compteur chunks du document dans l'UI Host.
2. Modifier le fichier sur disque (ajouter une phrase unique, ex. `PHRASE-REINDEX-TEST`).
3. Sauvegarder le fichier ; ne pas lancer de sync manuelle.
4. Chronométrer jusqu'à mise à jour du statut ou du contenu indexé.

**Résultat attendu :** Ré-indexation automatique en **&lt; 30 secondes** ; nouvelle phrase retrouvable en recherche / RAG.

| Champ | Valeur |
|-------|--------|
| Résultat | — |
| Date | |
| Testeur | |
| Build / commit | |
| Délai observé (s) | |
| Notes / captures | |

---

#### TM-10 — Resync au démarrage

**Objectif :** Cohérence index après redémarrage Host.

**Prérequis :** Au moins un lien de contexte configuré (TM-08).

**Instructions :**

1. Modifier un fichier lié pendant que le Host est **fermé**.
2. Relancer le Host.
3. Observer les logs / notifications de sync au lancement.
4. Vérifier que le document reflète la modification sans action manuelle.

**Résultat attendu :** **Resync complet** (ou sync incrémentale équivalente) au lancement ; index à jour.

| Champ | Valeur |
|-------|--------|
| Résultat | — |
| Date | |
| Testeur | |
| Build / commit | |
| Notes / captures | |

---

#### TM-11 — Chat avec contexte à jour

**Objectif :** Le RAG injecte le contenu récent de la base active.

**Prérequis :** TM-09 ou TM-10 OK ; base de connaissances activée sur le chat web.

**Instructions :**

1. Activer la base liée au dossier de test.
2. Poser une question ciblée sur la **phrase unique** ajoutée en TM-09.
3. Vérifier que la réponse mentionne ou s'appuie sur ce contenu.

**Résultat attendu :** Réponse cohérente avec le fichier modifié ; pas de contenu obsolète manifeste.

| Champ | Valeur |
|-------|--------|
| Résultat | — |
| Date | |
| Testeur | |
| Build / commit | |
| Notes / captures | |

---

#### TM-12 — Statut sources (web lecture seule)

**Objectif :** Le web affiche l'état des liens sans permettre de les modifier.

**Prérequis :** Liens de contexte existants (TM-08).

**Instructions :**

1. Sur le web, ouvrir la vue contexte / sources du host.
2. Vérifier noms, statuts (sync, nombre de docs, erreurs éventuelles).
3. Confirmer l'absence de boutons « lier » / « supprimer lien » côté web (lecture seule).

**Résultat attendu :** Statuts visibles et à jour ; **aucune** action de modification de liens depuis le web.

| Champ | Valeur |
|-------|--------|
| Résultat | — |
| Date | |
| Testeur | |
| Build / commit | |
| Notes / captures | |

---

#### TM-13 — Citations RAG cliquables

**Objectif :** Badges sources avec fichier, extrait et score.

**Prérequis :** Base indexée ; question RAG déclenchant des citations.

**Instructions :**

1. Envoyer une question dont la réponse s'appuie sur les documents liés.
2. Attendre l'événement `chat.citations` (badges sous le message).
3. Cliquer un badge : vérifier nom fichier, extrait, score (si affiché).

**Résultat attendu :** Badges **cliquables** ; détail source lisible. Composant `RagCitationBadges`.

| Champ | Valeur |
|-------|--------|
| Résultat | — |
| Date | |
| Testeur | |
| Build / commit | |
| Notes / captures | |

---

#### TM-13b — Instructions système par base

**Objectif :** Instructions éditables Host, visibles web, prises en compte au prochain tour.

**Prérequis :** Base de connaissances active.

**Instructions :**

1. Host : éditer l'instruction système de la base (ex. « Réponds toujours en vers »).
2. Web : ouvrir la fiche de la base et vérifier que l'instruction est **visible** (lecture seule).
3. Envoyer un **nouveau** message chat avec cette base active.
4. Vérifier que le style / consigne est respecté.

**Résultat attendu :** Instruction persistée ; visible web ; appliquée au **prochain** message (pas rétroactivement).

| Champ | Valeur |
|-------|--------|
| Résultat | — |
| Date | |
| Testeur | |
| Build / commit | |
| Notes / captures | |

---

#### TM-14 — Export conversation .md

**Objectif :** Télécharger le fil courant en Markdown.

**Prérequis :** Conversation avec au moins 2 tours user/assistant.

**Instructions :**

1. Ouvrir le menu export (chat ou palette `Ctrl+K` → export).
2. Télécharger le fichier `.md`.
3. Ouvrir le fichier localement : vérifier rôles, contenu, ordre chronologique.

**Résultat attendu :** Fichier `.md` complet et lisible ; correspond au fil affiché.

| Champ | Valeur |
|-------|--------|
| Résultat | — |
| Date | |
| Testeur | |
| Build / commit | |
| Notes / captures | |

---

#### TM-15 — Patch unified (preview / apply)

**Objectif :** Aucune écriture fichier sans confirmation explicite.

**Prérequis :** Fichier `.md` lié ; agent ou chat produisant un unified diff.

**Instructions :**

1. Demander une modification ciblée d'un fichier lié (ex. ajouter une section).
2. Vérifier l'affichage **prévisualisation diff** (`DiffPatchPanel`).
3. Tester **Rejeter** : le fichier sur disque ne change pas.
4. Redemander / **Appliquer** : le fichier reflète le patch.

**Résultat attendu :** Preview obligatoire ; **jamais** d'écriture silencieuse.

| Champ | Valeur |
|-------|--------|
| Résultat | — |
| Date | |
| Testeur | |
| Build / commit | |
| Notes / captures | |

---

#### TM-15b — Artefacts (génération Host)

**Objectif :** Bloc `artifact` ouvrant le panneau latéral avec export.

**Prérequis :** Host avec prompt artefacts ; modèle capable de suivre le format.

**Instructions :**

1. Demander un livrable structuré (ex. « Rédige un plan en artefact markdown »).
2. Vérifier la détection du bloc ```artifact dans la réponse.
3. Panneau latéral : ouvrir, **copier**, **télécharger** en `.md`.

**Résultat attendu :** Artefact isolé du chat ; actions copie / téléchargement fonctionnelles.

| Champ | Valeur |
|-------|--------|
| Résultat | — |
| Date | |
| Testeur | |
| Build / commit | |
| Notes / captures | |

---

#### TM-16 — Partage conversation (lecture seule)

**Objectif :** Lien temporaire sans fuite RAG / contexte index.

**Prérequis :** Conversation avec messages et éventuellement citations RAG.

**Instructions :**

1. Créer un lien de partage depuis le chat web.
2. Ouvrir le lien en navigation privée (non authentifié).
3. Vérifier que seuls les messages du fil sont visibles.
4. Confirmer l'absence de chunks / sources RAG / fichiers liés dans la page partagée.

**Résultat attendu :** Lien **temporaire** ; **contenu conversation seul** ; pas d'index RAG exposé.

| Champ | Valeur |
|-------|--------|
| Résultat | — |
| Date | |
| Testeur | |
| Build / commit | |
| Notes / captures | |

---

#### TM-17 — Raccourcis clavier web

**Objectif :** Palette globale et envoi message au clavier.

**Prérequis :** Session authentifiée sur le web.

**Instructions :**

1. `Ctrl+K` (ou `⌘K`) : la palette s'ouvre ; rechercher une commande (ex. nouvelle conversation).
2. Exécuter une commande depuis la palette.
3. Dans le chat, saisir un message ; `Ctrl+Entrée` envoie sans cliquer Envoyer.

**Résultat attendu :** Palette et envoi **Ctrl+Entrée** opérationnels sur pages authentifiées.

| Champ | Valeur |
|-------|--------|
| Résultat | — |
| Date | |
| Testeur | |
| Build / commit | |
| Notes / captures | |

---

#### TM-18 — Panneau artefacts (actions locales)

**Objectif :** Parcours complet ouvrir / copier / télécharger depuis le panneau latéral.

**Prérequis :** Artefact généré (TM-15b) ou conversation avec artefact existant.

**Instructions :**

1. Ouvrir le panneau latéral artefacts.
2. Sélectionner un artefact ; vérifier le rendu markdown.
3. **Copier** dans le presse-papiers et coller dans un éditeur externe.
4. **Télécharger** `.md` et comparer le contenu.

**Résultat attendu :** Les trois actions fonctionnent ; fichier local identique au contenu affiché.

| Champ | Valeur |
|-------|--------|
| Résultat | — |
| Date | |
| Testeur | |
| Build / commit | |
| Notes / captures | |

---

### Clôture campagne de tests

| Métrique | Valeur |
|----------|--------|
| Cas exécutés | / 20 |
| OK | |
| KO | |
| N/A | |
| Dernière campagne | |
| Responsable | |
| Verdict V1 tests manuels | `En attente` / `Accepté` / `Bloqué` |

**Critère de passage :** tous les cas applicables en `OK`, aucun `KO` bloquant sans issue de suivi.

## UX Web — raccourcis clavier

- [x] Palette de commandes globale (`Ctrl+K` / `⌘K`) sur pages authentifiées
- [x] Envoi message chat via `Ctrl+Entrée` / `⌘Entrée`
- [x] Commandes contextuelles chat (nouvelle conversation, contexte, export, partage, arrêt)

## UX Host — raccourcis clavier

- [x] `keyboard-shortcuts.ts` + hook `use-keyboard-shortcut.ts` (équivalent web)
- [x] Palette de commandes globale (`Ctrl+K` / `⌘K`) sur le dashboard Host
- [x] Navigation onglets, ouverture web et actualisation via la palette
- [x] Envoi chat local via `Ctrl+Entrée` / `⌘Entrée` (`LocalChat.tsx`)

## Mémoire utilisateur (Host)

- [x] Table `user_memory` dans `context.db`
- [x] Ajouter / supprimer fait (Tauri + WS `memory.add` / `memory.delete`)
- [x] Toggle global `userMemoryEnabled` (settings + WS `memory.setEnabled`)
- [x] Injection sélective au chat (mots-clés de la question)
- [x] UI Host `UserMemoryPanel.tsx` (toggle, ajout/suppression faits)
- [x] Web : `memory-panel.tsx` (lecture/écriture via WS `memory.*`)

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
- [x] UI Host : panneau fournisseurs cloud (onglet Modèles, `get_cloud_providers_status`, `save_cloud_provider_key`)

## Mode réflexion (omoa-thinking-mode)

- [x] `thinkingMode` dans `chat.start` + `chat.thinking_delta` (protocole WS)
- [x] Routage modèles thinking côté Host (`think: true`, `/api/chat`)
- [x] Sélecteur Normal / Réflexion + panneau repliable chaîne de pensée (web)

## Contexte lié (Host v0.2.0)

- [x] Images liées (.png/.jpg) décrites via modèle vision Ollama local, indexées en RAG
- [x] Chat vision : images pertinentes attachées au message quand un modèle multimodal est actif
- [x] Table `context_links` + colonnes `documents` (source lié / upload)
- [x] Ingestion depuis chemin (`ingest_from_path`, `reindex_document`)
- [x] Ingestion DOCX (extraction OOXML via omniparse + repli ZIP, `context/docx.rs`)
- [x] Sync au lancement + watcher `notify` avec debounce
- [x] Sync planifiée (cron configurable, rapport `sync-schedule.log`, log par lien)
- [x] UI Host : lier fichier / dossier / disque, sync manuel et planifiée (cron + rapport)
- [x] Web : statut liens, suppression document, progression upload
- [x] Déduplication cross-liens : même contenu sous deux chemins → un seul index (hash SHA-256)
- [x] Politique par extension : allowlist configurable par lien (Host + protocole WS)

## Recherche full-text (omoa-fulltext-search)

- [x] Table virtuelle FTS5 `chunks_fts` (contenu + nom de fichier)
- [x] Triggers sync insert/update/delete + backfill au démarrage
- [x] RAG hybride : hits FTS prioritaires, complétés par similarité embeddings
- [x] Requête « contrat 2024 » trouve le chunk sans similarité sémantique (tests unitaires)
- [x] UI Host : seuils éditables `ragTopK`, `ragChunkTokens`, `chatTokenThreshold` (`HostSettingsPanel`)

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

- [x] `fallbackModel` dans `settings.json` + chaîne auto (défaut → sélection → `qwen2.5:7b`)
- [x] Chat relay : bascule si modèle absent ou premier token &gt; 45 s (`chat.modelFallback` WS)
- [x] UI Host : sélecteur modèle secours dans le gestionnaire de modèles

## Routage multi-modèle par tâche (omoa-multi-model-routing)

- [x] `modelRouting.summaryModel` / `writingModel` dans `settings.json`
- [x] Détection intent côté Host (`detect_task_intent`, `resolve_chat_model`)
- [x] Fallback si modèle routé absent (défaut → sélection → `qwen2.5:7b`)
- [x] UI Host : sélecteurs résumé / rédaction dans le gestionnaire de modèles

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

## Historique complet Host (omoa-host-chat-history)

- [x] SQLite local `%LOCALAPPDATA%\OwnMyOwnAI\chat_history.db` (threads + messages)
- [x] Protocole WS `history.list` / `history.get` / `history.save` / `history.delete`
- [x] Persistance auto à la fin du streaming (`threadId` dans `chat.start`)
- [x] Web : fermer le navigateur puis rouvrir → fil rechargé depuis le Host
- [x] `cargo check` dans `apps/runner/src-tauri`

## Branches de conversation (omoa-conversation-branches)

- [x] Fork depuis le message N sans écraser le fil principal (Host SQLite + cache web)
- [x] Protocole WS `history.fork` / `history.branches` dans `packages/protocol`
- [x] UI web : bouton « Brancher ici » + sélecteur de branches
- [x] Tests unitaires `conversation-store` (fork, switch, nouvelle racine)

## Citations RAG (omoa-rag-citations)

- [x] `chat.citations` WS avec source, extrait, score, chunkId
- [x] Host : `build_rag_bundle_scoped` + émission avant streaming
- [x] Web : badges cliquables `RagCitationBadges`

## @mentions chat (omoa-chat-mentions)

- [x] Parser `@base`, `@fichier`, `@dossier` côté web (`chat-mentions.ts`)
- [x] `mentionScope` dans `chat.start` + résolution Host (`mentions.rs`)
- [x] Tests unitaires web

## Diff / apply patch (omoa-diff-apply)

- [x] Preview unified diff sandboxé (`patch.preview` / `patch.previewed`)
- [x] Application confirmée (`patch.apply` / `patch.applied`)
- [x] Web : `DiffPatchPanel` + jamais d'écriture silencieuse

## Playbooks (omoa-playbooks)

- [x] Host : `playbook.list` / `playbook.run` (ex. summarize-folder)
- [x] Protocole WS `PlaybookRunPayloadSchema`
- [x] Web : `playbook-picker.tsx`

## MCP servers (omoa-mcp-servers)

- [x] Host : builtin-fs + serveurs stdio configurables
- [x] WS `mcp.list` / `mcp.tools` / `mcp.call` / `mcp.result`
- [x] Protocole `McpServerSummarySchema`, `McpCallPayloadSchema`
- [x] UI Host : CRUD `mcpServers` dans `settings.json` (`McpServersManager.tsx`)
- [x] Web : panneau lecture seule outils MCP (`mcp-tools-panel.tsx` via `mcp.list` / `mcp.tools`)

## Résumé conversations (omoa-conversation-summary)

- [x] Compaction auto si tokens > seuil (`conversation_summary.rs`)
- [x] Réglages `chatTokenThreshold` / `chatRecentMessages` dans settings Host
- [x] Injection résumé en message system avant chat relay

## Mode air-gapped (omoa-air-gapped)

- [x] `airGapped` dans settings Host — relay/heartbeat désactivés
- [x] Chat local Host (`local_chat` Tauri + onglet Dashboard)
- [x] Statut `airGapped` exposé dans `get_host_status`

## Journal audit (omoa-audit-trail)

- [x] Table audit + `list_audit_log` Tauri
- [x] UI Host `AuditTrail.tsx`
- [x] Journalisation accès gateway OpenAI (`openai_gateway` → `agent_access`)

## Inline edit (omoa-inline-edit)

- [x] WS `inline_edit.preview` / `inline_edit.apply` sur documents .md liés
- [x] Web : `inline-edit-panel.tsx`

## Génération média (post-V1)

- [x] Image locale : ComfyUI / SD WebUI via HTTP localhost configurable (`media/image.rs`, `localImage` settings)
- [x] Commandes Tauri `get_local_image_status`, `list_comfyui_checkpoints`, `generate_local_image`
- [x] WS `media.generate` / `media.progress` / `media.done` (kind `image`)
- [x] UI Host `LocalImagePanel.tsx` (onglet Images)
- [x] Voix TTS : Piper (offline) / edge-tts / OpenAI dans `media/voice.rs` (`voiceTts` settings)
- [x] Commandes Tauri `get_tts_status`, `synthesize_speech`
- [x] WS `media.generate` kind `voice` (TTS par défaut, STT Whisper via `voiceMode=stt`)
- [x] `cargo check` dans `apps/runner/src-tauri`

## Build local

```bash
npm install
npm run build --workspace=@ownmyownai/protocol
npm run build --workspace=@ownmyownai/web
cd apps/runner && npm run tauri build
```
