@echo off
chcp 65001 >nul
title OwnMyOwnAI Host - Desinstallation
powershell -NoProfile -ExecutionPolicy Bypass -File "%~dp0uninstall-host.ps1"
pause
