# Mises à jour automatiques — OwnMyOwnAI Host

## Fonctionnement

1. L'utilisateur installe via **OwnMyOwnAI-Host-setup.exe** (NSIS).
2. Au démarrage (et toutes les 4 h), l'app interroge `latest.json` sur Supabase.
3. Si une version plus récente existe, elle est téléchargée, vérifiée (signature minisign) et installée en mode **passif** (sans interaction).
4. L'app redémarre automatiquement sur la nouvelle version.

La version **ZIP portable** ne reçoit pas les mises à jour automatiques.

## Secrets GitHub (workflow Release Windows Host)

Le workflow [`.github/workflows/release-windows.yml`](../.github/workflows/release-windows.yml) lit ces **secrets de dépôt** (pas des secrets d'environnement) :

| Secret | Description |
|--------|-------------|
| `TAURI_SIGNING_PRIVATE_KEY` | Clé privée minisign **encodée en base64 sur une seule ligne** |
| `TAURI_SIGNING_PRIVATE_KEY_PASSWORD` | Mot de passe de la clé |
| `SUPABASE_SERVICE_ROLE_KEY` | Upload installateur + `latest.json` |

### Configuration rapide (recommandée)

Depuis la racine du dépôt :

```powershell
pwsh apps/runner/scripts/setup-tauri-signing.ps1
```

Le script :

1. Génère une paire minisign (ou réutilise un fichier existant avec `-SkipGenerate`)
2. Met à jour `plugins.updater.pubkey` dans `tauri.conf.json` si nécessaire
3. Affiche la valeur base64 et les commandes `gh secret set`

Puis déposer les secrets :

```powershell
gh secret set TAURI_SIGNING_PRIVATE_KEY --body "<ligne base64 affichée>"
gh secret set TAURI_SIGNING_PRIVATE_KEY_PASSWORD --body "<mot de passe>"
gh secret list
```

`gh secret list` doit montrer au minimum :

- `SUPABASE_SERVICE_ROLE_KEY`
- `TAURI_SIGNING_PRIVATE_KEY`
- `TAURI_SIGNING_PRIVATE_KEY_PASSWORD`

### Génération manuelle

```powershell
cd apps/runner
$env:CI = "true"
npm run tauri -- signer generate -w "$env:USERPROFILE\.tauri\ownmyownai-host.key" -f -p "VOTRE_MOT_DE_PASSE"
```

Étapes suivantes :

1. Copier le contenu de `ownmyownai-host.key.pub` dans `tauri.conf.json` → `plugins.updater.pubkey`
2. Encoder la clé privée en base64 (une seule ligne) :

```powershell
$key = Get-Content "$env:USERPROFILE\.tauri\ownmyownai-host.key" -Raw
[Convert]::ToBase64String([Text.Encoding]::UTF8.GetBytes($key))
```

3. Coller cette ligne dans le secret `TAURI_SIGNING_PRIVATE_KEY`
4. Déposer le mot de passe dans `TAURI_SIGNING_PRIVATE_KEY_PASSWORD`

> **Important :** ne collez pas le fichier `.key` brut (3 lignes) dans GitHub Actions — Tauri attend du base64 ou un chemin fichier. Le workflow valide le format avant le build.

### Comportement CI sans secrets de signature

Si `TAURI_SIGNING_PRIVATE_KEY` est absent ou invalide, le workflow :

- émet un avertissement GitHub Actions ;
- désactive `createUpdaterArtifacts` et `plugins.updater.active` pour ce build ;
- publie quand même l'installateur NSIS et le ZIP portable (manifeste `latest.json` **sans** `platforms` → pas d'auto-update).

Pour activer l'auto-update en production, les deux secrets de signature sont **obligatoires**.

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

Le workflow **Release Windows Host** build l'installateur NSIS, signe les artefacts et publie sur Supabase + GitHub Releases.

**Important** : un simple `git push` sur `main` ne publie **pas** le Host. Seuls les tags `v*` déclenchent le workflow release.

## Vérifier une release signée

Après un tag `v*`, contrôler dans les logs du job :

- `Signature updater : activée` (et non `désactivée`)
- Étape **Publish signed updater + installer to Supabase** exécutée

Puis vérifier le manifeste public :

```text
https://jcknolulyrsvcwvttaed.supabase.co/storage/v1/object/public/host-releases/latest/latest.json
```

Une release avec auto-update contient une section `platforms.windows-x86_64` avec `signature` et `url`.

## Dépannage — « l'app ne se met pas à jour »

| Symptôme | Cause | Action |
|----------|-------|--------|
| Rien ne se passe | Secret `TAURI_SIGNING_PRIVATE_KEY` absent sur GitHub | Exécuter `setup-tauri-signing.ps1` puis `gh secret set` |
| Erreur « Invalid symbol » au build | Clé collée en texte brut au lieu de base64 | Réencoder avec le script ou PowerShell (voir ci-dessus) |
| `latest.json` sans `platforms` | Release « sans auto-update signé » | Republier avec les secrets de signature configurés |
| Version installée > version publiée | Build local / dev plus récent que Supabase | Créer un tag `v*` et laisser CI publier |
| Mode dev (`tauri dev`) | L'updater est désactivé en debug | Tester avec l'installateur NSIS release |

Dans l'app Host → onglet **État** → section **Mises à jour** : bouton **Vérifier** et lien vers la page Télécharger si l'auto-update n'est pas configuré.
