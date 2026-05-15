# Upload du ZIP portable vers Supabase Storage (sans attendre GitHub Actions)
param(
  [Parameter(Mandatory = $true)]
  [string]$ServiceRoleKey,
  [string]$ZipPath = "apps\runner\OwnMyOwnAI-Host-portable-x64.zip",
  [string]$SupabaseUrl = "https://jcknolulyrsvcwvttaed.supabase.co"
)

if (-not (Test-Path $ZipPath)) {
  Write-Error "Fichier introuvable: $ZipPath. Buildez d'abord: cd apps\runner; npm run tauri build -- --bundles none"
  exit 1
}

$object = "latest/OwnMyOwnAI-Host-portable-x64.zip"
$uri = "$SupabaseUrl/storage/v1/object/host-releases/$object"
$headers = @{
  Authorization = "Bearer $ServiceRoleKey"
  "x-upsert"    = "true"
  "Content-Type" = "application/zip"
}

Invoke-RestMethod -Method Put -Uri $uri -Headers $headers -InFile $ZipPath
$public = "$SupabaseUrl/storage/v1/object/public/host-releases/$object"
Write-Host "OK — disponible sur:"
Write-Host $public
Write-Host "Le site /download utilisera ce fichier automatiquement."
