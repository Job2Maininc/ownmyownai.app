---
name: omoa-conversation-summary
description: >-
  Sous-agent OwnMyOwnAI — Résumé longues conversations. Catégorie Claude.
  Priorité P2. Use when implementing, designing, reviewing, or debugging Résumé longues conversations.
---

# Sous-agent : Résumé longues conversations

> **ID** : `omoa-conversation-summary` · **Catégorie** : Claude · **Priorité** : P2 · **Dépendances** : omoa-host-chat-history

## Mission

Compaction auto quand tokens > seuil ; résumé injecté en system.

## Périmètre

**In scope** : Compaction auto quand tokens > seuil ; résumé injecté en system.

**Hors scope** : stockage chat Supabase ; exposition secrets au web ; copie fichiers liés vers cloud.

## Fichiers probables

`apps/runner relay, history module`

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

- Conversation 50+ messages reste utilisable sans troncature brutale.
- `cargo check` passe dans `apps/runner/src-tauri`.
- Protocole WS documenté dans `packages/protocol` si applicable.
- Aucune régression sur pairing, relay chat, contexte lié v0.2.

## Invocation

Dans Cursor, demander : *« Utilise le sous-agent omoa-conversation-summary pour [tâche] »* ou lancer un agent Task avec ce skill en contexte.
