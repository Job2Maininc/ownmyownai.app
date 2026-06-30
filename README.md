# OwnMyOwnAI

Votre IA sur votre PC — host Windows + client web.

> **Démarrage en 5 minutes** → [docs/GETTING_STARTED.md](docs/GETTING_STARTED.md)

## Structure

- `apps/runner` — Tauri Windows host (Ollama + relay)
- `apps/web` — Next.js sur Vercel
- `apps/relay` — Cloudflare Worker WebSocket relay
- `packages/protocol` — Types WS partagés
- `supabase/` — Migrations + Edge Functions

## Prérequis

- Node.js 20+, npm 10+
- Rust (pour le runner Tauri)
- Compte Supabase
- Compte Cloudflare (relay)

## Déploiement Vercel (important)

Déployez **`apps/web`** sur Vercel, **pas** `apps/runner` (application desktop Tauri).

Dans les paramètres du projet Vercel : **Root Directory** = `apps/web`

Voir [docs/DEPLOYMENT.md](docs/DEPLOYMENT.md) pour les variables d'environnement.

## Setup

```bash
npm install
npm run build:protocol
```

### Supabase

```bash
supabase link --project-ref YOUR_REF
supabase db push
supabase secrets set RELAY_JWT_SECRET=your-secret
supabase secrets set RELAY_URL=wss://your-relay.workers.dev/v1/connect
supabase secrets set APP_URL=https://your-app.vercel.app
supabase functions deploy
```

### Relay (Cloudflare)

```bash
cd apps/relay
npx wrangler secret put RELAY_JWT_SECRET
npm run deploy
```

### Web (Vercel)

Copiez `.env.example` vers `apps/web/.env.local` et déployez sur Vercel.

### Runner (Windows)

```bash
cd apps/runner
# Configurez .env avec VITE_SUPABASE_URL et VITE_APP_URL
npm run tauri build
```

## Flux V1

1. Installer le host Windows
2. Se connecter sur le web (magic link)
3. Générer un code sur `/host/link`
4. Entrer le code dans le host
5. Chatter sur `/chat/[hostId]`

## Intégration Cursor

Connectez **Cursor IDE** à votre Host pour l'inférence locale (0 crédit cloud) avec RAG, mémoire et règles projet.

| Chemin | URL | RAG / règles OMOA |
|--------|-----|-------------------|
| Ollama direct | `http://127.0.0.1:11434/v1` | Non |
| Gateway Host (recommandé) | `http://127.0.0.1:8765/v1` | Oui |
| MCP serveur (P1) | stdio `packages/omoa-mcp-server` | Complément de contexte |

- **Host** : onglet **Cursor** (`CursorIntegration.tsx`) — activez le gateway, copiez l'URL et le token Bearer.
- **Web** : page `/cursor` (3 chemins d'intégration).
- **Guide** : [docs/CURSOR.md](docs/CURSOR.md) — configuration, snippet JSON, dépannage.

## Génération média

**V1 (disponible)** :

- **Artefacts** — documents markdown générés par l'assistant, panneau latéral web (copie / téléchargement `.md`). Voir [docs/ARTIFACTS.md](docs/ARTIFACTS.md).
- **Vision** — analyse d'images pour le RAG (`context/vision.rs`). Guide : [docs/MEDIA_GENERATION.md](docs/MEDIA_GENERATION.md).

**Post-V1 (feuille de route)** : image (Flux / ComfyUI / DALL-E), voix TTS/STT, musique, vidéo — protocole WS `media.generate`, galerie Host + web. Détails : [docs/ROADMAP.md](docs/ROADMAP.md#jalons--génération-média-post-v1).

## Documentation

- [docs/CURSOR.md](docs/CURSOR.md) — intégration Cursor IDE
- [docs/ARTIFACTS.md](docs/ARTIFACTS.md) — artefacts markdown
- [docs/MEDIA_GENERATION.md](docs/MEDIA_GENERATION.md) — génération média (prérequis, limites)
- [docs/ROADMAP.md](docs/ROADMAP.md) — Cursor, génération média, modèles cloud
- [docs/DEPLOYMENT.md](docs/DEPLOYMENT.md) — déploiement Vercel / variables d'environnement
- [docs/V1_CHECKLIST.md](docs/V1_CHECKLIST.md) — campagne de tests manuels V1
