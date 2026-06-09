---
name: omoa-artifacts
description: >-
  Sous-agent OwnMyOwnAI — Artefacts (panneau latéral). Catégorie Claude.
  Priorité P2. Use when implementing, designing, reviewing, or debugging Artefacts (panneau latéral),
  teaching the model output format, or parsing ```artifact blocks in chat.
---

# Sous-agent : Artefacts (panneau latéral)

> **ID** : `omoa-artifacts` · **Catégorie** : Claude · **Priorité** : P2 · **Dépendances** : aucune

## Mission

Panneau latéral pour documents markdown/tableaux générés par l'assistant : aperçu, copie, téléchargement `.md` — **export local uniquement**, jamais cloud.

## Documentation de référence

Lire **`docs/ARTIFACTS.md`** avant toute modification du format ou du prompt modèle.

## Architecture (vue d'ensemble)

```
assistant_output.rs  →  prompt système injecté à chaque chat (Host)
        ↓
relay / local_chat  →  stream texte assistant via WS
        ↓
artifacts.ts        →  parse ```artifact fences
        ↓
markdown-message    →  cartes [[ARTIFACT:id]]
artifacts-panel   →  panneau latéral (copie / .md)
```

**Pas de type WS dédié** — le protocole reste du texte markdown dans `chat.delta`.

## Fichiers clés

| Fichier | Rôle |
|---------|------|
| `apps/runner/src-tauri/src/assistant_output.rs` | Prompt système complet (`OUTPUT_FORMAT_SYSTEM_HINT`) |
| `apps/runner/src-tauri/src/relay.rs` | Injection chat web (`prepend_system`, agent tools) |
| `apps/runner/src-tauri/src/local_chat.rs` | Injection chat local Host |
| `apps/web/src/lib/artifacts.ts` | Parseur + export |
| `apps/web/src/components/chat/markdown-message.tsx` | Cartes + streaming |
| `apps/web/src/components/chat/artifacts-panel.tsx` | Panneau latéral |
| `apps/web/src/components/chat/chat-view.tsx` | Onglet Artefacts, agrégation messages |
| `apps/web/src/lib/__tests__/artifacts.test.ts` | Tests parseur |

## Format artefact (contrat modèle)

### Quand produire un artefact

- Rapport, spec, plan, procédure, document long à conserver
- Tableau markdown (comparaison, inventaire)
- Livrable explicite « à télécharger / copier »

### Quand NE PAS en produire

- Réponse courte conversationnelle
- Petit extrait de code dans une explication → fence ` ```lang ` normale
- Modification fichier projet → `` ```diff `` / `` ```patch `` (voir `unified-patch.ts`, omoa-diff-apply)

### Syntaxe obligatoire

**Variante A** (recommandée) :

````markdown
```artifact
title: Titre descriptif
type: markdown
---
# Contenu complet
```
````

**Variante B** :

````markdown
```artifact:Titre court
# Contenu
```
````

### Règles critiques (ne pas casser le parseur)

1. Fermer le bloc avec ``` **avant** le texte de suite.
2. Contenu livrable **à l'intérieur** ; chat **à l'extérieur**.
3. Un bloc = un artefact ; plusieurs livrables = plusieurs blocs.
4. **Pas** de fences ``` imbriquées dans un artefact.
5. Tableaux : syntaxe `| col |` + ligne `|---|---|`.
6. `type:` optionnel — `markdown` ou `table` (sinon inféré dans `inferArtifactType`).

### Rendu UX

- Message chat : carte « Artefact · Titre · Ouvrir »
- Clic → panneau latéral, onglet Artefacts
- Boutons Copier / Télécharger (`{titre-sanitisé}.md`)
- Streaming : `hasOpenArtifactFence()` → « Génération de l'artefact… »

## Modifier le système

### Étendre le prompt modèle

1. Éditer `OUTPUT_FORMAT_SYSTEM_HINT` dans `assistant_output.rs`
2. Mettre à jour `docs/ARTIFACTS.md` et exemples dans ce skill
3. `cargo test assistant_output`

### Étendre le parseur web

1. Éditer `artifacts.ts` (`ArtifactType`, `parseArtifactBody`, regex)
2. Adapter `artifacts-panel.tsx` si nouveau rendu
3. Tests dans `artifacts.test.ts`

### Nouveau type WS (éviter sauf besoin fort)

Préférer garder le format fence ; le protocole WS n'a pas besoin d'évoluer pour les artefacts.

## Contexte OwnMyOwnAI (obligatoire)

- **Inference** : uniquement via `apps/runner` (Tauri) + Ollama — jamais depuis le web.
- **Relay** : transport WS uniquement, pas de stockage chat.
- **Secrets** : keyring Host — jamais exposés au navigateur.
- **Langue UI** : français. Code/comments : anglais si convention existante.
- **Principes** : diff minimal, réutiliser patterns existants.

## Workflow du sous-agent

1. Lire `docs/ARTIFACTS.md` et les fichiers listés ci-dessus.
2. Vérifier que `prepend_output_format_hint` est appelé sur **tous** les chemins chat (relay, local_chat, agent tools).
3. Toute évolution du format = prompt Host + parseur web + tests des deux côtés.
4. `cargo test assistant_output` + `npm test -- artifacts.test.ts`
5. Commit message en français centré sur le *pourquoi*.

## Critères d'acceptation

- L'assistant reçoit le prompt format à chaque requête chat.
- Bloc ```artifact valide → carte + panneau + copie/téléchargement.
- Texte hors bloc reste visible dans le fil de chat.
- Streaming : indicateur tant que le fence n'est pas fermé.
- Aucune donnée artefact en Supabase.
- `cargo check` + tests web passent.

## Invocation

*« Utilise le sous-agent omoa-artifacts pour [tâche] »* ou Task avec ce skill.
