# Mises à jour automatiques — OwnMyOwnAI Host

## Fonctionnement

1. L&apos;utilisateur installe via **OwnMyOwnAI-Host-setup.exe** (NSIS).
2. Au démarrage (et toutes les 4 h), l&apos;app interroge `latest.json` sur Supabase.
3. Si une version plus récente existe, elle est téléchargée, vérifiée (signature minisign) et installée en mode **passif** (sans interaction).
4. L&apos;app redémarre automatiquement sur la nouvelle version.

La version **ZIP portable** ne reçoit pas les mises à jour automatiques.

## Secrets GitHub (workflow Release Windows Host)

| Secret | Description |
|--------|-------------|
| `TAURI_SIGNING_PRIVATE_KEY` | Contenu du fichier `.key` (minisign), une seule ligne |
| `TAURI_SIGNING_PRIVATE_KEY_PASSWORD` | Mot de passe de la clé |
| `SUPABASE_SERVICE_ROLE_KEY` | Upload installateur + `latest.json` |

### Générer une paire de clés

```powershell
cd apps/runner
$env:CI = "true"
npm run tauri -- signer generate -w "$env:USERPROFILE\.tauri\ownmyownai-host.key" -f -p "VOTRE_MOT_DE_PASSE"
```

- Coller le contenu de `ownmyownai-host.key.pub` dans `tauri.conf.json` → `plugins.updater.pubkey`
- Ajouter le contenu de `ownmyownai-host.key` dans le secret `TAURI_SIGNING_PRIVATE_KEY`

## Fichiers publiés (Supabase `host-releases/latest/`)

| Fichier | Rôle |
|---------|------|
| `latest.json` | Manifeste Tauri updater |
| `OwnMyOwnAI-Host-update.nsis.zip` | Bundle de mise à jour signé |
| `OwnMyOwnAI-Host-setup.exe` | Installateur première installation |
| `OwnMyOwnAI-Host-portable-x64.zip` | Fallback manuel |

## Release

```bash
git tag v0.2.0
git push origin v0.2.0
```

Le workflow **Release Windows Host** build l&apos;installateur NSIS, signe les artefacts et publie sur Supabase + GitHub Releases.

**Important** : un simple `git push` sur `main` ne publie **pas** le Host. Seuls les tags `v*` déclenchent le workflow release.

## Dépannage — « l&apos;app ne se met pas à jour »

| Symptôme | Cause | Action |
|----------|-------|--------|
| Rien ne se passe | Secret `TAURI_SIGNING_PRIVATE_KEY` absent sur GitHub | Générer la clé minisign et l&apos;ajouter aux secrets du dépôt |
| `latest.json` sans `platforms` | Release « sans auto-update signé » | Republier avec la clé de signature (artefact `.nsis.zip` + `.sig`) |
| Version installée > version publiée | Vous tournez en dev / build local (ex. 0.2.0) alors que Supabase est en 0.1.19 | Créer un tag `v0.2.0` et laisser CI publier |
| Mode dev (`tauri dev`) | L&apos;updater est désactivé en debug | Tester avec l&apos;installateur NSIS release |

Dans l&apos;app Host → onglet **État** → section **Mises à jour** : bouton **Vérifier** et lien vers la page Télécharger si l&apos;auto-update n&apos;est pas configuré.
