# Déploiement OwnMyOwnAI V1

## Projet Supabase

| Paramètre | Valeur |
|-----------|--------|
| **Project ref** | `jcknolulyrsvcwvttaed` |
| **URL** | `https://jcknolulyrsvcwvttaed.supabase.co` |
| **MCP** | `user-supabase-ownmyownai.app` |

Tables déployées : `profiles`, `hosts`, `host_credentials`, `pairing_requests`

Voir aussi [SECURITY.md](./SECURITY.md) pour RLS, `host_credentials` et leaked password protection.

Edge Functions déployées :
- `create-pairing-code` (JWT requis)
- `complete-pairing`
- `runner-heartbeat`
- `mint-relay-token` (JWT requis)
- `runner-mint-relay-token`
- `create-conversation-share` (JWT requis — partage lecture seule)
- `get-conversation-share` (public, token dans le body)

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

## Runner Windows — téléchargement et mises à jour auto

Sur `/download`, le bouton principal appelle **`/api/download-installer`** (installateur NSIS avec mises à jour automatiques). Le ZIP portable reste disponible en lien secondaire.

Voir [AUTO_UPDATE.md](./AUTO_UPDATE.md) pour les secrets `TAURI_SIGNING_PRIVATE_KEY` et le manifeste `latest.json`.

La CI publie `OwnMyOwnAI-Host-portable-x64.zip` sur **GitHub Releases** (tag `v*`).


### Sources du ZIP (site web)

Le serveur `/api/download` choisit la source la plus récente entre Supabase (`host-releases/latest/...`) et la dernière GitHub Release avec un ZIP portable. Un déploiement Vercel du web **ne rebuild pas** le runner : sans workflow **Release Windows Host**, les utilisateurs gardent l'ancien binaire.

### Publier une nouvelle version Host

Le workflow `.github/workflows/release-windows.yml` ne s'exécute **pas** sur un simple `push` vers `main`. Déclenchement :

- Manuel : GitHub Actions → *Release Windows Host* → *Run workflow*, ou `gh workflow run "Release Windows Host"`
- Tag : `git tag v0.2.0` puis `git push origin v0.2.0` (pattern `v*`)

Le job build Windows upload le ZIP sur Supabase (secret `SUPABASE_SERVICE_ROLE_KEY`) et crée une GitHub Release.

### Build local

```bash
cd apps/runner
npm run tauri build -- --no-bundle
# puis zipper le contenu de src-tauri/target/release/ (exe + dll + resources)
```
