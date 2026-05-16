mod credentials;
mod ollama;
mod relay;

use credentials::{get_credentials, save_credentials, StoredCredentials};
use ollama::{check_ollama, ensure_ollama_running, pull_model, OllamaStatus};
use relay::start_background_services;
use serde::Deserialize;

#[tauri::command(rename = "check_ollama")]
fn check_ollama_cmd() -> Result<OllamaStatus, String> {
    check_ollama()
}

#[tauri::command(rename = "ensure_ollama_running")]
async fn ensure_ollama_running_cmd(app: tauri::AppHandle) -> Result<(), String> {
    ensure_ollama_running(Some(&app)).await
}

#[tauri::command(rename = "pull_model")]
async fn pull_model_cmd(app: tauri::AppHandle, model: String) -> Result<(), String> {
    pull_model(&model, Some(&app)).await
}

#[tauri::command(rename = "get_credentials")]
fn get_credentials_cmd() -> Result<Option<StoredCredentials>, String> {
    get_credentials()
}

#[tauri::command(rename = "complete_pairing")]
async fn complete_pairing_cmd(
    code: String,
    name: String,
    #[serde(rename = "supabaseUrl")]
    supabase_url: String,
) -> Result<StoredCredentials, String> {
    let client = reqwest::Client::new();
    let url = format!(
        "{}/functions/v1/complete-pairing",
        supabase_url.trim_end_matches('/')
    );

    let body = serde_json::json!({
        "code": code.trim(),
        "name": name,
        "platform": "windows",
    });

    let res = client
        .post(&url)
        .header("Content-Type", "application/json")
        .json(&body)
        .send()
        .await
        .map_err(|e| e.to_string())?;

    if !res.status().is_success() {
        let text = res.text().await.unwrap_or_default();
        return Err(text);
    }

    #[derive(Deserialize)]
    struct PairingResponse {
        host_id: String,
        device_secret: String,
    }

    let data: PairingResponse = res.json().await.map_err(|e| e.to_string())?;
    let creds = StoredCredentials {
        host_id: data.host_id,
        device_secret: data.device_secret,
    };
    save_credentials(&creds)?;
    Ok(creds)
}

#[tauri::command(rename = "start_background_services")]
async fn start_background_services_cmd() -> Result<(), String> {
    start_background_services().await
}

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    tauri::Builder::default()
        .plugin(tauri_plugin_shell::init())
        .invoke_handler(tauri::generate_handler![
            check_ollama_cmd,
            ensure_ollama_running_cmd,
            pull_model_cmd,
            get_credentials_cmd,
            complete_pairing_cmd,
            start_background_services_cmd,
        ])
        .setup(|_app| {
            tauri::async_runtime::spawn(async move {
                if get_credentials().ok().flatten().is_some() {
                    let _ = start_background_services().await;
                }
            });
            Ok(())
        })
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}
