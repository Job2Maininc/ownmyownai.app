# OwnMyOwnAI

Votre IA sur votre PC — host Windows + client web.

## Structure

- `apps/runner` — Tauri Windows host (Ollama + relay)
- `apps/web` — Next.js sur Vercel
- `apps/relay` — Cloudflare Worker WebSocket relay
- `packages/protocol` — Types WS partagés
- `supabase/` — Migrations + Edge Functions

## Prérequis

- Node.js 20+, pnpm 9+
- Rust (pour le runner Tauri)
- Compte Supabase
- Compte Cloudflare (relay)

## Setup

```bash
pnpm install
pnpm build:protocol
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
pnpm wrangler secret put RELAY_JWT_SECRET
pnpm deploy
```

### Web (Vercel)

Copiez `.env.example` vers `apps/web/.env.local` et déployez sur Vercel.

### Runner (Windows)

```bash
cd apps/runner
# Configurez .env avec VITE_SUPABASE_URL et VITE_APP_URL
pnpm tauri build
```

## Flux V1

1. Installer le host Windows
2. Se connecter sur le web (magic link)
3. Générer un code sur `/host/link`
4. Entrer le code dans le host
5. Chatter sur `/chat/[hostId]`
