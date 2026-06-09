# Artefacts — spécification et guide modèle

Les **artefacts** sont des documents générés par l'assistant (markdown, tableaux) affichés dans le panneau latéral du chat web. Export **local uniquement** (copie presse-papiers, téléchargement `.md`) — rien n'est stocké dans Supabase.

## Architecture

```
Ollama (Host)  →  stream markdown  →  Relay WS  →  Web chat
                                                      ↓
                                            extractArtifacts()
                                                      ↓
                              Carte « Artefact » + panneau latéral
```

| Couche | Fichier | Rôle |
|--------|---------|------|
| Prompt système | `apps/runner/src-tauri/src/assistant_output.rs` | Enseigne au modèle le format ```artifact |
| Injection | `relay.rs`, `local_chat.rs`, `agent_loop.rs` | `ensure_output_format_hint()` (idempotent) sur chaque chat et agent |
| Parseur | `apps/web/src/lib/artifacts.ts` | Extrait titres, types, contenu |
| UI chat | `markdown-message.tsx` | Cartes cliquables `[[ARTIFACT:id]]` |
| UI panneau | `artifacts-panel.tsx` | Aperçu, copie, téléchargement |

Il n'y a **pas** de message WS dédié : le format est entièrement embarqué dans le texte assistant.

## Syntaxe artefact

### Variante A (recommandée)

````markdown
```artifact
title: Rapport mensuel
type: markdown
---
# Titre du document

Contenu markdown complet…
```
````

### Variante B (titre court)

````markdown
```artifact:Notes de réunion
- Point 1
- Point 2
```
````

### Champs d'en-tête (avant `---`)

| Champ | Obligatoire | Valeurs | Description |
|-------|-------------|---------|-------------|
| `title:` | Non* | texte | Titre affiché dans le panneau |
| `type:` | Non | `markdown`, `table` | Sinon inféré (table si syntaxe `\|…\|` + séparateur) |

\* Si absent : titre depuis `artifact:Titre` ou `Artefact N`.

### Règles de parsing (`artifacts.ts`)

1. Regex : `` ```artifact(?::([^\n]+))?\n([\s\S]*?)``` ``
2. Corps optionnellement découpé par `\n---\n` (en-tête YAML-like + contenu).
3. Le message chat remplace chaque bloc par `[[ARTIFACT:msg-N-M]]`.
4. Pendant le streaming : `hasOpenArtifactFence()` affiche « Génération de l'artefact… ».

## Quand utiliser un artefact

| Cas | Artefact ? |
|-----|------------|
| Rapport, spec, plan, procédure longue | Oui |
| Tableau comparatif / inventaire | Oui (`type: table` ou inféré) |
| Réponse courte, FAQ, une liste de 3 points | Non |
| Modifier un fichier lié du projet | Non → `` ```diff `` / `` ```patch `` |
| Code exemple dans une explication | Non (fence ` ```lang ` classique) |

## Distinction patches

Les modifications de fichiers utilisent le parseur `unified-patch.ts` :

````markdown
```diff
# path: src/lib/foo.ts
--- a/src/lib/foo.ts
+++ b/src/lib/foo.ts
@@ -1,3 +1,3 @@
```
````

Le web affiche un panneau **Prévisualiser / Appliquer / Rejeter** (Host requis).

## Checklist modèle (résumé)

1. Intro courte **hors** du bloc.
2. Bloc ```artifact **complet** (fermeture ```).
3. Tout le livrable **dans** le bloc.
4. Pas de fences imbriquées dans l'artefact.
5. Suite conversationnelle **après** la fermeture.

## Tests

```bash
cd apps/web && npm test -- src/lib/__tests__/artifacts.test.ts
cd apps/runner/src-tauri && cargo test assistant_output
```

## Évolutions possibles

- Types `html`, `csv`, `code` dédiés
- Édition inline dans le panneau
- Sync vers fichier lié (omoa-inline-edit)
