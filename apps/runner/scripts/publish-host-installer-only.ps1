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

$setupExe = Get-ChildItem $BundleRoot -Filter "*-setup.exe" |
    Where-Object { $_.Name -notmatch "nsis" } |
    Select-Object -First 1
if (-not $setupExe) {
    throw "Installateur *-setup.exe introuvable sous $BundleRoot"
}

$staging = Join-Path $env:TEMP "ownmyownai-installer-staging"
if (Test-Path $staging) { Remove-Item -Recurse -Force $staging }
New-Item -ItemType Directory -Path $staging | Out-Null

$setupObject = "OwnMyOwnAI-Host-setup.exe"
Copy-Item $setupExe.FullName (Join-Path $staging $setupObject)
Upload-File (Join-Path $staging $setupObject) $setupObject "application/octet-stream"

$releaseNotes = if ($Notes) { $Notes } else { "OwnMyOwnAI Host $Version" }
$manifest = @{
    version  = $Version
    notes    = $releaseNotes
    pub_date = (Get-Date).ToUniversalTime().ToString("yyyy-MM-ddTHH:mm:ssZ")
} | ConvertTo-Json -Depth 4

$manifestPath = Join-Path $staging "latest.json"
Set-Content -Path $manifestPath -Value $manifest -Encoding UTF8
Upload-File $manifestPath "latest.json" "application/octet-stream"

Write-Host "Installateur : $basePublic/$setupObject"
Write-Host "Manifeste : $basePublic/latest.json"
