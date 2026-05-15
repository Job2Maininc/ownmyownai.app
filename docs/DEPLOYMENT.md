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
npx.cmd wrangler secret put RELAY_JWT_SECRET
npm.cmd run deploy
```

Sur le **plan Workers gratuit**, `wrangler.toml` doit utiliser `new_sqlite_classes` (pas `new_classes`) pour les Durable Objects.

Utilisez le **même** `RELAY_JWT_SECRET` que dans Supabase.

---

## Runner Windows — téléchargement depuis le site (pas GitHub obligatoire)

Le ZIP portable est hébergé sur **Supabase Storage** (bucket public `host-releases`) :

```
https://jcknolulyrsvcwvttaed.supabase.co/storage/v1/object/public/host-releases/latest/OwnMyOwnAI-Host-portable-x64.zip
```

Le bouton **Télécharger** sur `/download` passe par `/api/download` → cette URL. Même lien à chaque version (le fichier `latest/...` est écrasé à chaque release).

### GitHub Actions — secret à ajouter

Dans le dépôt GitHub → **Settings → Secrets → Actions** :

| Secret | Valeur |
|--------|--------|
| `SUPABASE_SERVICE_ROLE_KEY` | Clé *service_role* (Supabase → Settings → API) |

Sans ce secret, la CI publie encore sur GitHub Releases en secours.

### Build plus rapide (~5–8 min au lieu de ~15)

- Cache Rust (`swatinem/rust-cache`)
- Un seul build portable (plus d’installateur MSI/NSIS en CI)

### Build local (instantané pour toi)

```bash
cd apps/runner
# .env : VITE_SUPABASE_URL=https://jcknolulyrsvcwvttaed.supabase.co
#        VITE_APP_URL=https://votre-app.vercel.app
npm run tauri build -- --bundles none
# ZIP manuel : voir apps/runner/portable-staging dans le workflow CI
```

Pour tester sans attendre la CI : uploade le ZIP dans Supabase → **Storage** → `host-releases` → `latest/`.
