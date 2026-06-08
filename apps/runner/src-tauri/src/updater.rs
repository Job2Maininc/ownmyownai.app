use std::time::Duration;
use tauri::AppHandle;
use tauri_plugin_updater::UpdaterExt;

const INITIAL_DELAY: Duration = Duration::from_secs(10);
const CHECK_INTERVAL: Duration = Duration::from_secs(4 * 60 * 60);

/// Vérifie les mises à jour en arrière-plan et installe automatiquement (installateur NSIS).
pub fn start_auto_updater(app: &AppHandle) {
    #[cfg(not(debug_assertions))]
    {
        let handle = app.clone();
        tauri::async_runtime::spawn(async move {
            tokio::time::sleep(INITIAL_DELAY).await;
            loop {
                if let Err(err) = check_and_install(&handle).await {
                    eprintln!("[updater] {err}");
                }
                tokio::time::sleep(CHECK_INTERVAL).await;
            }
        });
    }

    #[cfg(debug_assertions)]
    let _ = app;
}

async fn check_and_install(app: &AppHandle) -> Result<(), String> {
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
