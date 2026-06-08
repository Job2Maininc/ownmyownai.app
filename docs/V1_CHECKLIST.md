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
| 5 | 2 onglets : second onglet reçoit erreur ou partage session | UX message « autre onglet actif » |
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

## Contexte lié (Host v0.2.0)

- [x] Table `context_links` + colonnes `documents` (source lié / upload)
- [x] Ingestion depuis chemin (`ingest_from_path`, `reindex_document`)
- [x] Sync au lancement + watcher `notify` avec debounce
- [x] UI Host : lier fichier / dossier / disque, sync manuel
- [x] Web : statut liens, suppression document, progression upload

## Fallback modèle (Host)

- [x] `fallbackModel` dans `settings.json` + chaîne auto (défaut → sélection → `llama3.2:3b`)
- [x] Chat relay : bascule si modèle absent ou premier token &gt; 45 s (`chat.modelFallback` WS)
- [x] UI Host : sélecteur modèle secours dans le gestionnaire de modèles

## Build local

```bash
npm install
npm run build --workspace=@ownmyownai/protocol
npm run build --workspace=@ownmyownai/web
cd apps/runner && npm run tauri build
```
