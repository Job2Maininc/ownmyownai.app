# V1 — Checklist d'acceptation

## Prérequis cloud

- [ ] Projet Supabase créé, migrations appliquées (`supabase db push`)
- [ ] Secrets : `RELAY_JWT_SECRET`, `RELAY_URL`, `APP_URL`
- [ ] Edge Functions déployées (5 fonctions)
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

## Build local

```bash
npm install
npm run build --workspace=@ownmyownai/protocol
npm run build --workspace=@ownmyownai/web
cd apps/runner && npm run tauri build
```
