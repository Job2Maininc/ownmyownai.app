param(
    [Parameter(Mandatory = $true)]
    [string]$Version,
    [Parameter(Mandatory = $true)]
    [string]$SupabaseUrl,
    [Parameter(Mandatory = $true)]
    [string]$ServiceRoleKey,
    [string]$BundleRoot = "apps/runner/src-tauri/target/release/bundle/nsis",
    [string]$Notes = ""
)

$ErrorActionPreference = "Stop"
$basePublic = "$SupabaseUrl/storage/v1/object/public/host-releases/latest"
$uploadUri = "$SupabaseUrl/storage/v1/object/host-releases/latest"
$headers = @{
    Authorization = "Bearer $ServiceRoleKey"
    "x-upsert"    = "true"
}

function Upload-File($localPath, $objectName, $contentType) {
    $uri = "$uploadUri/$objectName"
    $h = $headers.Clone()
    $h["Content-Type"] = $contentType
    Invoke-RestMethod -Method Put -Uri $uri -Headers $h -InFile $localPath
    Write-Host "Uploaded $objectName"
}

$nsisZip = Get-ChildItem $BundleRoot -Recurse -Filter "*.nsis.zip" | Select-Object -First 1
if (-not $nsisZip) {
    throw "Fichier *.nsis.zip introuvable sous $BundleRoot"
}

$sigPath = "$($nsisZip.FullName).sig"
if (-not (Test-Path $sigPath)) {
    throw "Signature introuvable : $sigPath"
}

$setupExe = Get-ChildItem $BundleRoot -Filter "*-setup.exe" |
    Where-Object { $_.Name -notmatch "nsis" } |
    Select-Object -First 1

$updateObject = "OwnMyOwnAI-Host-update.nsis.zip"
$staging = Join-Path $env:TEMP "ownmyownai-release-staging"
if (Test-Path $staging) { Remove-Item -Recurse -Force $staging }
New-Item -ItemType Directory -Path $staging | Out-Null

Copy-Item $nsisZip.FullName (Join-Path $staging $updateObject)
Upload-File (Join-Path $staging $updateObject) $updateObject "application/zip"

if ($setupExe) {
    $setupObject = "OwnMyOwnAI-Host-setup.exe"
    Copy-Item $setupExe.FullName (Join-Path $staging $setupObject)
    Upload-File (Join-Path $staging $setupObject) $setupObject "application/octet-stream"
}

$signature = (Get-Content $sigPath -Raw).Trim()
$releaseNotes = if ($Notes) { $Notes } else { "OwnMyOwnAI Host $Version" }
$manifest = @{
    version   = $Version
    notes     = $releaseNotes
    pub_date  = (Get-Date).ToUniversalTime().ToString("yyyy-MM-ddTHH:mm:ssZ")
    platforms = @{
        "windows-x86_64" = @{
            signature = $signature
            url       = "$basePublic/$updateObject"
        }
    }
} | ConvertTo-Json -Depth 6

$manifestPath = Join-Path $staging "latest.json"
Set-Content -Path $manifestPath -Value $manifest -Encoding UTF8
Upload-File $manifestPath "latest.json" "application/octet-stream"

Write-Host "Manifeste : $basePublic/latest.json"
Write-Host "Installateur : $basePublic/OwnMyOwnAI-Host-setup.exe"
