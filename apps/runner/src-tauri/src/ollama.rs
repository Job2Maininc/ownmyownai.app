use serde::{Deserialize, Serialize};
use std::path::{Path, PathBuf};
use std::process::{Command, Output};
use tauri::{AppHandle, Emitter};

const OLLAMA_URL: &str = "http://127.0.0.1:11434";
const OLLAMA_SETUP_URL: &str = "https://ollama.com/download/OllamaSetup.exe";
const DEFAULT_MODEL: &str = "llama3.2:3b";

#[derive(Debug, Serialize, Deserialize, Clone)]
pub struct OllamaStatus {
    pub installed: bool,
    pub running: bool,
    pub models: Vec<String>,
}

fn emit_progress(app: Option<&AppHandle>, message: &str) {
    if let Some(handle) = app {
        let _ = handle.emit("ollama-setup-progress", message);
    }
}

pub fn resolve_ollama_exe() -> Option<PathBuf> {
    if Command::new("ollama")
        .arg("--version")
        .output()
        .map(|o| o.status.success())
        .unwrap_or(false)
    {
        return Some(PathBuf::from("ollama"));
    }

    let candidates = ollama_install_paths();
    candidates.into_iter().find(|p| p.is_file())
}

fn ollama_install_paths() -> Vec<PathBuf> {
    let mut paths = Vec::new();
    if let Ok(local) = std::env::var("LOCALAPPDATA") {
        paths.push(PathBuf::from(&local).join("Programs").join("Ollama").join("ollama.exe"));
    }
    paths.push(PathBuf::from(r"C:\Program Files\Ollama\ollama.exe"));
    paths
}

fn run_ollama(args: &[&str]) -> Result<Output, String> {
    let exe = resolve_ollama_exe().ok_or_else(|| "Binaire Ollama introuvable".to_string())?;
    Command::new(&exe)
        .args(args)
        .output()
        .map_err(|e| e.to_string())
}

pub fn check_ollama() -> Result<OllamaStatus, String> {
    let installed = resolve_ollama_exe().is_some();

    let client = reqwest::blocking::Client::builder()
        .timeout(std::time::Duration::from_secs(3))
        .build()
        .map_err(|e| e.to_string())?;

    let running = client
        .get(format!("{OLLAMA_URL}/api/tags"))
        .send()
        .map(|r| r.status().is_success())
        .unwrap_or(false);

    let models = if running {
        #[derive(Deserialize)]
        struct TagsResponse {
            models: Vec<ModelEntry>,
        }
        #[derive(Deserialize)]
        struct ModelEntry {
            name: String,
        }

        client
            .get(format!("{OLLAMA_URL}/api/tags"))
            .send()
            .ok()
            .and_then(|r| r.json::<TagsResponse>().ok())
            .map(|t| t.models.into_iter().map(|m| m.name).collect())
            .unwrap_or_default()
    } else {
        vec![]
    };

    Ok(OllamaStatus {
        installed,
        running,
        models,
    })
}

async fn download_ollama_installer(dest: &Path, app: Option<&AppHandle>) -> Result<(), String> {
    emit_progress(app, "Téléchargement d'Ollama (environ 150 Mo)…");

    let client = reqwest::Client::builder()
        .timeout(std::time::Duration::from_secs(600))
        .build()
        .map_err(|e| e.to_string())?;

    let response = client
        .get(OLLAMA_SETUP_URL)
        .send()
        .await
        .map_err(|e| format!("Téléchargement impossible : {e}"))?;

    if !response.status().is_success() {
        return Err(format!("Téléchargement refusé (HTTP {})", response.status()));
    }

    let bytes = response.bytes().await.map_err(|e| e.to_string())?;
    std::fs::write(dest, &bytes).map_err(|e| e.to_string())?;

    emit_progress(app, "Téléchargement terminé.");
    Ok(())
}

#[cfg(target_os = "windows")]
async fn install_ollama_via_setup(setup_path: &Path, app: Option<&AppHandle>) -> Result<(), String> {
    emit_progress(app, "Installation d'Ollama en cours…");

    let status = Command::new(setup_path)
        .args(["/SP-", "/VERYSILENT", "/NORESTART"])
        .status()
        .map_err(|e| e.to_string())?;

    if !status.success() {
        return Err("L'installateur Ollama a échoué".into());
    }

    for i in 0..45 {
        if resolve_ollama_exe().is_some() {
            emit_progress(app, "Ollama installé.");
            return Ok(());
        }
        if i % 5 == 0 {
            emit_progress(app, "Finalisation de l'installation…");
        }
        tokio::time::sleep(tokio::time::Duration::from_secs(1)).await;
    }

    Err("Ollama installé mais binaire introuvable".into())
}

#[cfg(target_os = "windows")]
async fn install_ollama_via_winget(app: Option<&AppHandle>) -> Result<(), String> {
    emit_progress(app, "Installation via winget…");

    let output = Command::new("winget")
        .args([
            "install",
            "--id",
            "Ollama.Ollama",
            "-e",
            "--accept-package-agreements",
            "--accept-source-agreements",
            "--silent",
        ])
        .output()
        .map_err(|e| format!("winget indisponible : {e}"))?;

    if !output.status.success() {
        let stderr = String::from_utf8_lossy(&output.stderr);
        let stdout = String::from_utf8_lossy(&output.stdout);
        return Err(format!("winget : {stdout} {stderr}"));
    }

    for _ in 0..60 {
        if resolve_ollama_exe().is_some() {
            return Ok(());
        }
        tokio::time::sleep(tokio::time::Duration::from_secs(2)).await;
    }

    Err("winget terminé mais Ollama introuvable".into())
}

async fn install_ollama(app: Option<&AppHandle>) -> Result<(), String> {
    if resolve_ollama_exe().is_some() {
        return Ok(());
    }

    #[cfg(target_os = "windows")]
    {
        if install_ollama_via_winget(app).await.is_ok() {
            return Ok(());
        }

        let cache_dir = dirs::data_local_dir()
            .ok_or_else(|| "Impossible d'accéder au dossier AppData".to_string())?
            .join("OwnMyOwnAI")
            .join("cache");

        std::fs::create_dir_all(&cache_dir).map_err(|e| e.to_string())?;
        let setup_path = cache_dir.join("OllamaSetup.exe");

        if !setup_path.is_file() {
            download_ollama_installer(&setup_path, app).await?;
        }

        return install_ollama_via_setup(&setup_path, app).await;
    }

    #[cfg(not(target_os = "windows"))]
    {
        let _ = app;
        Err("Installation automatique disponible uniquement sur Windows".into())
    }
}

async fn spawn_ollama_serve(app: Option<&AppHandle>) -> Result<(), String> {
    let exe = resolve_ollama_exe().ok_or_else(|| "Ollama non installé".to_string())?;

    emit_progress(app, "Démarrage d'Ollama…");

    Command::new(&exe)
        .arg("serve")
        .spawn()
        .map_err(|e| e.to_string())?;

    for i in 0..45 {
        if check_ollama()?.running {
            emit_progress(app, "Ollama est prêt.");
            return Ok(());
        }
        if i % 5 == 0 {
            emit_progress(app, "Attente du démarrage d'Ollama…");
        }
        tokio::time::sleep(tokio::time::Duration::from_secs(1)).await;
    }

    Err("Ollama n'a pas démarré à temps".into())
}

pub async fn ensure_ollama_running(app: Option<&AppHandle>) -> Result<(), String> {
    if check_ollama()?.running {
        return Ok(());
    }

    if resolve_ollama_exe().is_none() {
        install_ollama(app).await?;
    }

    spawn_ollama_serve(app).await
}

pub async fn pull_model(model: &str, app: Option<&AppHandle>) -> Result<(), String> {
    ensure_ollama_running(app).await?;

    emit_progress(
        app,
        &format!("Téléchargement du modèle {model} (peut prendre plusieurs minutes)…"),
    );

    let output = run_ollama(&["pull", model])?;

    if !output.status.success() {
        return Err(String::from_utf8_lossy(&output.stderr).to_string());
    }

    emit_progress(app, "Modèle prêt !");
    Ok(())
}

pub fn default_model() -> &'static str {
    DEFAULT_MODEL
}

pub async fn stream_chat(
    model: &str,
    messages: &[serde_json::Value],
) -> Result<reqwest::Response, String> {
    let client = reqwest::Client::new();
    let body = serde_json::json!({
        "model": model,
        "messages": messages,
        "stream": true,
    });

    client
        .post(format!("{OLLAMA_URL}/v1/chat/completions"))
        .json(&body)
        .send()
        .await
        .map_err(|e| e.to_string())
}
