---
name: omoa-chat-mentions
description: >-
  Sous-agent OwnMyOwnAI — @mentions (fichier, dossier, base). Catégorie Cursor.
  Priorité P1. Use when implementing, designing, reviewing, or debugging @mentions (fichier, dossier, base).
---

# Sous-agent : @mentions (fichier, dossier, base)

> **ID** : `omoa-chat-mentions` · **Catégorie** : Cursor · **Priorité** : P1 · **Dépendances** : omoa-rag-citations

## Mission

Parser @fichier @dossier @base dans le composer.

## Périmètre

**In scope** : Parser @fichier @dossier @base dans le composer.

**Hors scope** : stockage chat Supabase ; exposition secrets au web ; copie fichiers liés vers cloud.

## Fichiers probables

`chat-view, context-panel, rag.rs`

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

- @base:Notes limite le RAG à cette base uniquement.
- `cargo check` passe dans `apps/runner/src-tauri`.
- Protocole WS documenté dans `packages/protocol` si applicable.
- Aucune régression sur pairing, relay chat, contexte lié v0.2.

## Invocation

Dans Cursor, demander : *« Utilise le sous-agent omoa-chat-mentions pour [tâche] »* ou lancer un agent Task avec ce skill en contexte.
