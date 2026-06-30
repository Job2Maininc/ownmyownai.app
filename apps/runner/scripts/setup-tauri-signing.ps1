# Génère (ou réutilise) une paire minisign Tauri et affiche les commandes
# pour déposer les secrets GitHub requis par l'auto-update Host.
#
# Usage :
#   pwsh apps/runner/scripts/setup-tauri-signing.ps1
#   pwsh apps/runner/scripts/setup-tauri-signing.ps1 -Password "mon-mot-de-passe"
#   pwsh apps/runner/scripts/setup-tauri-signing.ps1 -KeyPath "$env:USERPROFILE\.tauri\ownmyownai-host.key" -SkipGenerate

param(
    [string]$KeyPath = (Join-Path $env:USERPROFILE ".tauri\ownmyownai-host.key"),
    [string]$Password = "",
    [switch]$SkipGenerate
)

$ErrorActionPreference = "Stop"
$repoRoot = Resolve-Path (Join-Path $PSScriptRoot "..\..\..")
$confPath = Join-Path $repoRoot "apps\runner\src-tauri\tauri.conf.json"

function Get-DecodedSigningKey([string]$SecretValue) {
    if ($SecretValue -match "untrusted comment:") {
        return $SecretValue
    }
    $bytes = [Convert]::FromBase64String($SecretValue.Trim())
    return [Text.Encoding]::UTF8.GetString($bytes)
}

if (-not $SkipGenerate) {
    if (-not $Password) {
        $secure = Read-Host "Mot de passe de la clé minisign" -AsSecureString
        $Password = [Runtime.InteropServices.Marshal]::PtrToStringAuto(
            [Runtime.InteropServices.Marshal]::SecureStringToBSTR($secure)
        )
    }

    $keyDir = Split-Path $KeyPath -Parent
    if (-not (Test-Path $keyDir)) {
        New-Item -ItemType Directory -Path $keyDir | Out-Null
    }

    Push-Location (Join-Path $repoRoot "apps\runner")
    try {
        $env:CI = "true"
        npm run tauri -- signer generate -w $KeyPath -f -p $Password
    } finally {
        Pop-Location
    }
}

if (-not (Test-Path $KeyPath)) {
    throw "Clé introuvable : $KeyPath"
}

$pubPath = "$KeyPath.pub"
if (-not (Test-Path $pubPath)) {
    throw "Clé publique introuvable : $pubPath"
}

$keyRaw = Get-Content $KeyPath -Raw
$pubRaw = (Get-Content $pubPath -Raw).Trim()
$keyB64 = [Convert]::ToBase64String([Text.Encoding]::UTF8.GetBytes($keyRaw))

$conf = Get-Content $confPath -Raw | ConvertFrom-Json
$currentPub = $conf.plugins.updater.pubkey
if ($currentPub -ne $pubRaw) {
    Write-Host ""
    Write-Host "Mise à jour de plugins.updater.pubkey dans tauri.conf.json"
    $conf.plugins.updater.pubkey = $pubRaw
    $conf | ConvertTo-Json -Depth 20 | Set-Content $confPath -Encoding UTF8
}

Write-Host ""
Write-Host "=== Secrets GitHub (Settings → Secrets and variables → Actions) ==="
Write-Host ""
Write-Host "TAURI_SIGNING_PRIVATE_KEY"
Write-Host "  Coller la ligne base64 ci-dessous (recommandé pour GitHub Actions) :"
Write-Host ""
Write-Host $keyB64
Write-Host ""
Write-Host "TAURI_SIGNING_PRIVATE_KEY_PASSWORD"
Write-Host "  Valeur : (le mot de passe choisi à la génération)"
Write-Host ""
Write-Host "=== Commandes gh (depuis la racine du dépôt) ==="
Write-Host ""
Write-Host "gh secret set TAURI_SIGNING_PRIVATE_KEY --body `"$keyB64`""
Write-Host "gh secret set TAURI_SIGNING_PRIVATE_KEY_PASSWORD --body `"<VOTRE_MOT_DE_PASSE>`""
Write-Host ""
Write-Host "Vérification locale du format :"
$decoded = Get-DecodedSigningKey $keyB64
if ($decoded -notmatch "untrusted comment:") {
    throw "La clé décodée n'est pas au format minisign attendu."
}
Write-Host "  Format minisign : OK"
Write-Host "  Pubkey alignée avec tauri.conf.json : OK"
Write-Host ""
Write-Host "Après dépôt des secrets, publier une release :"
Write-Host "  git tag v0.2.7"
Write-Host "  git push origin v0.2.7"
Write-Host ""
Write-Host "Voir docs/AUTO_UPDATE.md pour le dépannage."
