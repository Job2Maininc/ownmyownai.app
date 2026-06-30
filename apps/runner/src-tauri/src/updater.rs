use serde::Serialize;
use std::time::Duration;
use tauri::AppHandle;
use tauri_plugin_notification::NotificationExt;
use tauri_plugin_updater::UpdaterExt;

const MANIFEST_URL: &str =
    "https://jcknolulyrsvcwvttaed.supabase.co/storage/v1/object/public/host-releases/latest/latest.json";
const INITIAL_DELAY: Duration = Duration::from_secs(15);
const CHECK_INTERVAL: Duration = Duration::from_secs(60 * 60);

#[derive(Debug, Clone, Copy, Serialize, PartialEq, Eq)]
#[serde(rename_all = "camelCase")]
pub enum UpdateStatus {
    UpToDate,
    Ahead,
    UpdateAuto,
    UpdateManual,
    CheckFailed,
}

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct UpdateCheckResult {
    pub current_version: String,
    pub remote_version: Option<String>,
    pub update_available: bool,
    pub auto_update_ready: bool,
    pub status: UpdateStatus,
    pub message: String,
}

/// Vérifie les mises à jour en arrière-plan et installe automatiquement (installateur NSIS).
pub fn start_auto_updater(app: &AppHandle) {
    #[cfg(not(debug_assertions))]
    {
        let handle = app.clone();
        tauri::async_runtime::spawn(async move {
            tokio::time::sleep(INITIAL_DELAY).await;
            loop {
                let status = check_for_updates(&handle).await;
                if status.update_available && status.auto_update_ready {
                    if let Err(err) = check_and_install(&handle).await {
                        eprintln!("[updater] {err}");
                    }
                } else if status.update_available {
                    if let Some(version) = status.remote_version.as_deref() {
                        notify_manual_update(version);
                    }
                }
                tokio::time::sleep(CHECK_INTERVAL).await;
            }
        });
    }

    #[cfg(debug_assertions)]
    let _ = app;
}

pub async fn check_for_updates(app: &AppHandle) -> UpdateCheckResult {
    let current_version = app.package_info().version.to_string();
    let remote_version = fetch_remote_version().await.ok().flatten();

    match app.updater() {
        Ok(updater) => match updater.check().await {
            Ok(Some(update)) => UpdateCheckResult {
                current_version: current_version.clone(),
                remote_version: Some(update.version.clone()),
                update_available: true,
                auto_update_ready: true,
                status: UpdateStatus::UpdateAuto,
                message: format!(
                    "Version {} disponible — vous pouvez l'installer en un clic.",
                    update.version
                ),
            },
            Ok(None) => up_to_date_message(&current_version, remote_version.as_deref()),
            Err(err) => manifest_fallback(&current_version, remote_version.as_deref(), &err.to_string()),
        },
        Err(err) => manifest_fallback(&current_version, remote_version.as_deref(), &err.to_string()),
    }
}

pub async fn check_and_install(app: &AppHandle) -> Result<(), String> {
    let updater = app.updater().map_err(|e| e.to_string())?;
    let Some(update) = updater.check().await.map_err(|e| e.to_string())? else {
        return Ok(());
    };

    eprintln!(
        "[updater] Mise à jour {} → installation…",
        update.version
    );

    update
        .download_and_install(|_chunk, _total| {}, || {})
        .await
        .map_err(|e| e.to_string())?;

    app.restart();
}

fn up_to_date_message(current: &str, remote: Option<&str>) -> UpdateCheckResult {
    let (status, message) = match remote {
        Some(remote) if remote == current => (
            UpdateStatus::UpToDate,
            "Vous avez la dernière version publiée.".to_string(),
        ),
        Some(remote) if is_version_newer(current, remote) => (
            UpdateStatus::Ahead,
            format!(
                "Version installée {current} — plus récente que la version publiée ({remote}). Build local ou pré-release."
            ),
        ),
        Some(remote) => (
            UpdateStatus::UpToDate,
            format!("Version installée {current} (manifeste distant : {remote})."),
        ),
        None => (
            UpdateStatus::CheckFailed,
            "Impossible de lire la version publiée sur le serveur.".to_string(),
        ),
    };
    UpdateCheckResult {
        current_version: current.to_string(),
        remote_version: remote.map(str::to_string),
        update_available: false,
        auto_update_ready: false,
        status,
        message,
    }
}

fn manifest_fallback(current: &str, remote: Option<&str>, updater_error: &str) -> UpdateCheckResult {
    let Some(remote) = remote.filter(|v| is_version_newer(v, current)) else {
        let status = if updater_error.is_empty() {
            UpdateStatus::UpToDate
        } else {
            UpdateStatus::CheckFailed
        };
        return UpdateCheckResult {
            current_version: current.to_string(),
            remote_version: remote.map(str::to_string),
            update_available: false,
            auto_update_ready: false,
            status,
            message: if updater_error.is_empty() {
                "Vous avez la dernière version publiée.".to_string()
            } else {
                format!("Vérification automatique indisponible : {updater_error}")
            },
        };
    };

    UpdateCheckResult {
        current_version: current.to_string(),
        remote_version: Some(remote.to_string()),
        update_available: true,
        auto_update_ready: false,
        status: UpdateStatus::UpdateManual,
        message: format!(
            "Version {remote} disponible — téléchargez l'installateur NSIS depuis le site. L'installation automatique sera activée dès que la release sera signée côté serveur."
        ),
    }
}

async fn fetch_remote_version() -> Result<Option<String>, String> {
    let client = reqwest::Client::builder()
        .timeout(Duration::from_secs(20))
        .build()
        .map_err(|e| e.to_string())?;
    let response = client
        .get(MANIFEST_URL)
        .send()
        .await
        .map_err(|e| e.to_string())?;
    if !response.status().is_success() {
        return Err(format!("Manifeste HTTP {}", response.status()));
    }
    let json: serde_json::Value = response.json().await.map_err(|e| e.to_string())?;
    Ok(json
        .get("version")
        .and_then(|v| v.as_str())
        .map(|v| v.trim().trim_start_matches('v').to_string())
        .filter(|v| !v.is_empty()))
}

fn parse_version_parts(version: &str) -> Vec<u32> {
    version
        .trim()
        .trim_start_matches('v')
        .split('.')
        .filter_map(|part| part.parse().ok())
        .collect()
}

fn is_version_newer(remote: &str, current: &str) -> bool {
    let remote_parts = parse_version_parts(remote);
    let current_parts = parse_version_parts(current);
    let len = remote_parts.len().max(current_parts.len());
    for index in 0..len {
        let remote_part = *remote_parts.get(index).unwrap_or(&0);
        let current_part = *current_parts.get(index).unwrap_or(&0);
        if remote_part > current_part {
            return true;
        }
        if remote_part < current_part {
            return false;
        }
    }
    false
}

fn notify_manual_update(version: &str) {
    if !crate::settings::desktop_notifications_enabled() {
        return;
    }
    let Some(app) = crate::host_status::app_handle() else {
        return;
    };
    let _ = app
        .notification()
        .builder()
        .title("Mise à jour Host disponible")
        .body(format!(
            "Version {version} — ouvrez la page Télécharger pour installer."
        ))
        .auto_cancel()
        .show();
}
