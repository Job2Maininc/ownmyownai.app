# Déploiement OwnMyOwnAI V1

## Projet Supabase

| Paramètre | Valeur |
|-----------|--------|
| **Project ref** | `jcknolulyrsvcwvttaed` |
| **URL** | `https://jcknolulyrsvcwvttaed.supabase.co` |
| **MCP** | `user-supabase-ownmyownai.app` |

Tables déployées : `profiles`, `hosts`, `host_credentials`, `pairing_requests`

Edge Functions déployées :
- `create-pairing-code` (JWT requis)
- `complete-pairing`
- `runner-heartbeat`
- `mint-relay-token` (JWT requis)
- `runner-mint-relay-token`

### Secrets Supabase à configurer (Dashboard → Edge Functions → Secrets)

```
RELAY_JWT_SECRET=<chaîne aléatoire 32+ caractères>
RELAY_URL=wss://<votre-relay>.workers.dev/v1/connect
APP_URL=https://<votre-app-vercel>.vercel.app
```

`SUPABASE_URL`, `SUPABASE_SERVICE_ROLE_KEY`, `SUPABASE_ANON_KEY` sont injectés automatiquement.

### Auth — URLs de redirection

Dans **Authentication → URL Configuration** :
- Site URL : votre URL Vercel
- Redirect URLs : `https://votre-app.vercel.app/**`

---

## Vercel — client web uniquement

| Paramètre | Valeur |
|-----------|--------|
| **Root Directory** | `apps/web` |
| **Framework** | Next.js |

### Variables d'environnement Vercel

```
NEXT_PUBLIC_SUPABASE_URL=https://jcknolulyrsvcwvttaed.supabase.co
NEXT_PUBLIC_SUPABASE_ANON_KEY=<clé anon — Supabase Dashboard → Settings → API>
NEXT_PUBLIC_RELAY_URL=wss://<relay>/v1/connect
NEXT_PUBLIC_APP_URL=https://<votre-domaine-vercel>.vercel.app
```

**Ne pas déployer `apps/runner` sur Vercel** — c'est l'application desktop Tauri (build local : `npm run tauri build`).

---

## Cloudflare Relay

```bash
cd apps/relay
npx wrangler secret put RELAY_JWT_SECRET
npm run deploy
```

Utilisez le **même** `RELAY_JWT_SECRET` que dans Supabase.

---

## Runner Windows

```bash
cd apps/runner
# .env : VITE_SUPABASE_URL=https://jcknolulyrsvcwvttaed.supabase.co
#        VITE_APP_URL=https://votre-app.vercel.app
npm run tauri build
```
