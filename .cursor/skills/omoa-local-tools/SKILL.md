---
name: omoa-local-tools
description: >-
  Sous-agent OwnMyOwnAI — Outils locaux (read/search/list). Catégorie Codex.
  Priorité P1. Use when implementing, designing, reviewing, or debugging Outils locaux (read/search/list).
---

# Sous-agent : Outils locaux (read/search/list)

> **ID** : `omoa-local-tools` · **Catégorie** : Codex · **Priorité** : P1 · **Dépendances** : aucune

## Mission

read_file, search_chunks, list_dir, stat — sandbox chemins liés.

## Périmètre

**In scope** : read_file, search_chunks, list_dir, stat — sandbox chemins liés.

**Hors scope** : stockage chat Supabase ; exposition secrets au web ; copie fichiers liés vers cloud.

## Fichiers probables

`agent/tools.rs, protocol tool types`

## Contexte OwnMyOwnAI (obligatoire)

- **Inference** : uniquement via `apps/runner` (Tauri) + Ollama — jamais depuis le web.
- **Relay** : `apps/relay` (Cloudflare DO) — transport WS uniquement, pas de stockage chat.
- **Protocole** : `packages/protocol` — tout nouveau message WS passe par Zod ici.
- **Contexte RAG** : SQLite local `%LOCALAPPDATA%\OwnMyOwnAI\context.db` — lecture sur place pour sources liées.
- **Secrets** : keyring Host — jamais exposés au navigateur ni au relay.
- **Langue UI** : français. Code/comments : anglais si convention existante.
- **Principes** : diff minimal, réutiliser patterns existants (`relay.rs`, `context/`, `settings.rs`).

## Workflow du sous-agent

1. Lire les fichiers listés ci-dessous avant toute modification.
2. Proposer un plan court (3–6 étapes) si la tâche est ambiguë.
3. Implémenter côté Host en priorité pour toute donnée sensible.
4. Étendre le protocole WS si le web doit afficher ou déclencher la feature.
5. Mettre à jour `docs/V1_CHECKLIST.md` ou `docs/ROADMAP.md` si critère d'acceptation ajouté.
6. Vérifier : `cargo check` (runner), build protocol, tests pertinents.
7. Commit avec message en français centré sur le *pourquoi*.

## Critères d'acceptation

- Modèle appelle outil ; Host exécute ; résultat JSON au modèle.
- `cargo check` passe dans `apps/runner/src-tauri`.
- Protocole WS documenté dans `packages/protocol` si applicable.
- Aucune régression sur pairing, relay chat, contexte lié v0.2.

## Invocation

Dans Cursor, demander : *« Utilise le sous-agent omoa-local-tools pour [tâche] »* ou lancer un agent Task avec ce skill en contexte.
