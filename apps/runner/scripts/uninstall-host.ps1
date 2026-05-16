# Desinstalle OwnMyOwnAI Host, Ollama (si installe par l'app), donnees et identifiants.
$ErrorActionPreference = "SilentlyContinue"

Write-Host ""
Write-Host "=== OwnMyOwnAI Host - Desinstallation ===" -ForegroundColor Green
Write-Host ""

function Stop-AppProcesses {
    $names = @("ollama", "ownmyownai-runner", "OwnMyOwnAI Host")
    foreach ($name in $names) {
        Get-Process -Name $name -ErrorAction SilentlyContinue | Stop-Process -Force
    }
    Start-Sleep -Seconds 2
}

function Remove-HostCredentials {
    Write-Host "Suppression des identifiants de pairing..."
    $targets = @(
        "LegacyGeneric:target=app.ownmyownai.runner/default",
        "app.ownmyownai.runner/default",
        "app.ownmyownai.runner"
    )
    foreach ($t in $targets) {
        cmdkey /delete:$t 2>$null | Out-Null
    }
    cmdkey /list 2>$null | ForEach-Object {
        if ($_ -match "ownmyownai") {
            $parts = $_ -split " "
            $target = ($parts | Select-Object -Last 1) -replace "Target:", ""
            if ($target) { cmdkey /delete:$target 2>$null | Out-Null }
        }
    }
}

function Uninstall-Ollama {
    Write-Host "Desinstallation d'Ollama..."
    $winget = Get-Command winget -ErrorAction SilentlyContinue
    if ($winget) {
        & winget uninstall --id Ollama.Ollama -e --accept-source-agreements --silent 2>$null
    }

    $uninstallers = @(
        "$env:LOCALAPPDATA\Programs\Ollama\Uninstall Ollama.exe",
        "$env:LOCALAPPDATA\Programs\Ollama\unins000.exe",
        "${env:ProgramFiles}\Ollama\Uninstall Ollama.exe"
    )
    foreach ($path in $uninstallers) {
        if (Test-Path $path) {
            Start-Process -FilePath $path -ArgumentList "/SILENT", "/VERYSILENT", "/NORESTART" -Wait
            break
        }
    }

    Remove-Item -Recurse -Force "$env:LOCALAPPDATA\Programs\Ollama" -ErrorAction SilentlyContinue
    Remove-Item -Recurse -Force "$env:ProgramFiles\Ollama" -ErrorAction SilentlyContinue
}

function Remove-AppData {
    Write-Host "Suppression des donnees OwnMyOwnAI..."
    $paths = @(
        "$env:LOCALAPPDATA\OwnMyOwnAI",
        "$env:APPDATA\OwnMyOwnAI",
        "$env:LOCALAPPDATA\app.ownmyownai.runner",
        "$env:APPDATA\app.ownmyownai.runner",
        "$env:LOCALAPPDATA\com.ownmyownai.runner",
        "$env:APPDATA\com.ownmyownai.runner"
    )
    foreach ($p in $paths) {
        if (Test-Path $p) {
            Remove-Item -Recurse -Force $p
            Write-Host "  Supprime: $p"
        }
    }
}

Stop-AppProcesses
Remove-HostCredentials
Uninstall-Ollama
Remove-AppData

Write-Host ""
$removeModels = Read-Host "Supprimer aussi les modeles Ollama dans $env:USERPROFILE\.ollama ? (o/N)"
if ($removeModels -eq "o" -or $removeModels -eq "O") {
    Remove-Item -Recurse -Force "$env:USERPROFILE\.ollama"
    Write-Host "Modeles Ollama supprimes."
}

Write-Host ""
Write-Host "Desinstallation terminee." -ForegroundColor Green
Write-Host "Vous pouvez supprimer ce dossier (le ZIP extrait)." -ForegroundColor Gray
Write-Host ""
