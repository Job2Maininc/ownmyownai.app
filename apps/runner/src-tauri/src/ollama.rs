use crate::settings::{resolved_default_model, resolved_models_dir, FALLBACK_DEFAULT_MODEL};
use futures_util::StreamExt;
use serde::{Deserialize, Serialize};
use std::io::{BufRead, BufReader};
use std::path::{Path, PathBuf};
use std::process::{Command, Output, Stdio};
use tauri::{AppHandle, Emitter};

const OLLAMA_URL: &str = "http://127.0.0.1:11434";
const OLLAMA_SETUP_URL: &str = "https://ollama.com/download/OllamaSetup.exe";

#[derive(Debug, Serialize, Deserialize, Clone)]
pub struct OllamaStatus {
    pub installed: bool,
    pub running: bool,
    pub models: Vec<String>,
}

#[derive(Debug, Serialize, Clone)]
#[serde(rename_all = "camelCase")]
pub struct SetupProgress {
    pub phase: String,
    pub message: String,
    pub percent: Option<f64>,
    pub bytes_downloaded: Option<u64>,
    pub bytes_total: Option<u64>,
    pub current_model: Option<String>,
    pub model_index: Option<u32>,
    pub model_count: Option<u32>,
}

fn emit_progress(app: Option<&AppHandle>, progress: SetupProgress) {
    if let Some(handle) = app {
        let _ = handle.emit("ollama-progress", &progress);
    }
}

fn emit_message(app: Option<&AppHandle>, phase: &str, message: &str) {
    emit_progress(
        app,
        SetupProgress {
            phase: phase.into(),
            message: message.into(),
            percent: None,
            bytes_downloaded: None,
            bytes_total: None,
            current_model: None,
            model_index: None,
            model_count: None,
        },
    );
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
        paths.push(
            PathBuf::from(&local)
                .join("Programs")
                .join("Ollama")
                .join("ollama.exe"),
        );
    }
    paths.push(PathBuf::from(r"C:\Program Files\Ollama\ollama.exe"));
    paths
}

fn models_dir_env() -> String {
    resolved_models_dir().to_string_lossy().into_owned()
}

fn run_ollama(args: &[&str]) -> Result<Output, String> {
    let exe = resolve_ollama_exe().ok_or_else(|| "Binaire Ollama introuvable".to_string())?;
    Command::new(&exe)
        .args(args)
        .env("OLLAMA_MODELS", models_dir_env())
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

fn format_bytes(bytes: u64) -> String {
    const UNITS: [&str; 4] = ["o", "Ko", "Mo", "Go"];
    let mut value = bytes as f64;
    let mut unit = 0;
    while value >= 1024.0 && unit < UNITS.len() - 1 {
        value /= 1024.0;
        unit += 1;
    }
    if unit == 0 {
        format!("{bytes} {UNITS}", UNITS = UNITS[unit])
    } else {
        format!("{value:.1} {}", UNITS[unit])
    }
}

async fn download_ollama_installer(dest: &Path, app: Option<&AppHandle>) -> Result<(), String> {
    emit_message(
        app,
        "ollama_download",
        "Téléchargement d'Ollama (environ 150 Mo)…",
    );

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

    let total = response.content_length();
    let mut stream = response.bytes_stream();
    let mut downloaded: u64 = 0;
    let mut file = tokio::fs::File::create(dest)
        .await
        .map_err(|e| e.to_string())?;

    use tokio::io::AsyncWriteExt;

    while let Some(chunk) = stream.next().await {
        let chunk = chunk.map_err(|e| e.to_string())?;
        downloaded += chunk.len() as u64;
        file.write_all(&chunk).await.map_err(|e| e.to_string())?;

        let percent = total.map(|t| {
            if t == 0 {
                None
            } else {
                Some((downloaded as f64 / t as f64) * 100.0)
            }
        }).flatten();

        let message = match total {
            Some(t) => format!(
                "Téléchargement d'Ollama : {} / {} ({:.0} %)",
                format_bytes(downloaded),
                format_bytes(t),
                percent.unwrap_or(0.0)
            ),
            None => format!(
                "Téléchargement d'Ollama : {} téléchargés…",
                format_bytes(downloaded)
            ),
        };

        emit_progress(
            app,
            SetupProgress {
                phase: "ollama_download".into(),
                message,
                percent,
                bytes_downloaded: Some(downloaded),
                bytes_total: total,
                current_model: None,
                model_index: None,
                model_count: None,
            },
        );
    }

    file.flush().await.map_err(|e| e.to_string())?;

    emit_progress(
        app,
        SetupProgress {
            phase: "ollama_download".into(),
            message: "Téléchargement d'Ollama terminé.".into(),
            percent: Some(100.0),
            bytes_downloaded: total,
            bytes_total: total,
            current_model: None,
            model_index: None,
            model_count: None,
        },
    );
    Ok(())
}

#[cfg(target_os = "windows")]
async fn install_ollama_via_setup(setup_path: &Path, app: Option<&AppHandle>) -> Result<(), String> {
    emit_message(app, "ollama_install", "Installation d'Ollama en cours…");

    let status = Command::new(setup_path)
        .args(["/SP-", "/VERYSILENT", "/NORESTART"])
        .status()
        .map_err(|e| e.to_string())?;

    if !status.success() {
        return Err("L'installateur Ollama a échoué".into());
    }

    for i in 0..45 {
        if resolve_ollama_exe().is_some() {
            emit_message(app, "ollama_install", "Ollama installé.");
            return Ok(());
        }
        if i % 5 == 0 {
            emit_message(app, "ollama_install", "Finalisation de l'installation…");
        }
        tokio::time::sleep(tokio::time::Duration::from_secs(1)).await;
    }

    Err("Ollama installé mais binaire introuvable".into())
}

#[cfg(target_os = "windows")]
async fn install_ollama_via_winget(app: Option<&AppHandle>) -> Result<(), String> {
    emit_message(app, "ollama_install", "Installation via winget…");

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
    let models_dir = models_dir_env();

    std::fs::create_dir_all(&models_dir).map_err(|e| e.to_string())?;

    emit_message(app, "ollama_start", "Démarrage d'Ollama…");

    Command::new(&exe)
        .arg("serve")
        .env("OLLAMA_MODELS", &models_dir)
        .spawn()
        .map_err(|e| e.to_string())?;

    for i in 0..45 {
        if check_ollama()?.running {
            emit_message(app, "ollama_start", "Ollama est prêt.");
            return Ok(());
        }
        if i % 5 == 0 {
            emit_message(app, "ollama_start", "Attente du démarrage d'Ollama…");
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

#[derive(Deserialize)]
struct PullProgressLine {
    status: Option<String>,
    digest: Option<String>,
    total: Option<u64>,
    completed: Option<u64>,
}

struct PullLineProgress {
    percent: f64,
    message: String,
    bytes_downloaded: Option<u64>,
    bytes_total: Option<u64>,
}

fn parse_pull_progress_line(line: &str) -> Option<PullLineProgress> {
    let json: PullProgressLine = serde_json::from_str(line).ok()?;
    let status = json.status.as_deref()?;

    match status {
        "pulling manifest" => Some(PullLineProgress {
            percent: 0.0,
            message: "Récupération du manifeste…".into(),
            bytes_downloaded: None,
            bytes_total: None,
        }),
        "downloading" | "downloading digest" => {
            let total = json.total?;
            let completed = json.completed.unwrap_or(0);
            let percent = if total == 0 {
                0.0
            } else {
                (completed as f64 / total as f64) * 100.0
            };
            let message = format!(
                "Téléchargement : {} / {} ({percent:.0} %)",
                format_bytes(completed),
                format_bytes(total)
            );
            Some(PullLineProgress {
                percent,
                message,
                bytes_downloaded: Some(completed),
                bytes_total: Some(total),
            })
        }
        "verifying sha256 digest" => Some(PullLineProgress {
            percent: 95.0,
            message: "Vérification de l'intégrité…".into(),
            bytes_downloaded: None,
            bytes_total: None,
        }),
        "writing manifest" => Some(PullLineProgress {
            percent: 98.0,
            message: "Écriture du manifeste…".into(),
            bytes_downloaded: None,
            bytes_total: None,
        }),
        "success" => Some(PullLineProgress {
            percent: 100.0,
            message: "Modèle prêt !".into(),
            bytes_downloaded: None,
            bytes_total: None,
        }),
        other => Some(PullLineProgress {
            percent: 0.0,
            message: other.to_string(),
            bytes_downloaded: None,
            bytes_total: None,
        }),
    }
}

pub async fn pull_model(model: &str, app: Option<&AppHandle>) -> Result<(), String> {
    ensure_ollama_running(app).await?;

    let exe = resolve_ollama_exe().ok_or_else(|| "Binaire Ollama introuvable".to_string())?;
    let models_dir = models_dir_env();

    emit_progress(
        app,
        SetupProgress {
            phase: "model_pull".into(),
            message: format!("Préparation du modèle {model}…"),
            percent: Some(0.0),
            bytes_downloaded: None,
            bytes_total: None,
            current_model: Some(model.to_string()),
            model_index: None,
            model_count: None,
        },
    );

    let mut child = Command::new(&exe)
        .args(["pull", model])
        .env("OLLAMA_MODELS", &models_dir)
        .stdout(Stdio::piped())
        .stderr(Stdio::piped())
        .spawn()
        .map_err(|e| e.to_string())?;

    let stdout = child.stdout.take();
    let stderr = child.stderr.take();
    let model_name = model.to_string();

    let read_progress = |stream: std::process::ChildStdout| {
        let app_handle = app.cloned();
        let name = model_name.clone();
        std::thread::spawn(move || {
            let reader = BufReader::new(stream);
            for line in reader.lines().flatten() {
                let trimmed = line.trim();
                if trimmed.is_empty() {
                    continue;
                }
                if let Some(parsed) = parse_pull_progress_line(trimmed) {
                    emit_progress(
                        app_handle.as_ref(),
                        SetupProgress {
                            phase: "model_pull".into(),
                            message: parsed.message,
                            percent: Some(parsed.percent),
                            bytes_downloaded: parsed.bytes_downloaded,
                            bytes_total: parsed.bytes_total,
                            current_model: Some(name.clone()),
                            model_index: None,
                            model_count: None,
                        },
                    );
                }
            }
        })
    };

    let read_progress_stderr = |stream: std::process::ChildStderr| {
        let app_handle = app.cloned();
        let name = model_name.clone();
        std::thread::spawn(move || {
            let reader = BufReader::new(stream);
            for line in reader.lines().flatten() {
                let trimmed = line.trim();
                if trimmed.is_empty() {
                    continue;
                }
                if let Some(parsed) = parse_pull_progress_line(trimmed) {
                    emit_progress(
                        app_handle.as_ref(),
                        SetupProgress {
                            phase: "model_pull".into(),
                            message: parsed.message,
                            percent: Some(parsed.percent),
                            bytes_downloaded: parsed.bytes_downloaded,
                            bytes_total: parsed.bytes_total,
                            current_model: Some(name.clone()),
                            model_index: None,
                            model_count: None,
                        },
                    );
                }
            }
        })
    };

    let stdout_handle = stdout.map(read_progress);
    let stderr_handle = stderr.map(read_progress_stderr);

    let status = child.wait().map_err(|e| e.to_string())?;

    if let Some(handle) = stdout_handle {
        let _ = handle.join();
    }
    if let Some(handle) = stderr_handle {
        let _ = handle.join();
    }
    if !status.success() {
        return Err(format!("Échec du téléchargement du modèle {model}"));
    }

    emit_progress(
        app,
        SetupProgress {
            phase: "model_pull".into(),
            message: format!("Modèle {model} prêt !"),
            percent: Some(100.0),
            bytes_downloaded: None,
            bytes_total: None,
            current_model: Some(model.to_string()),
            model_index: None,
            model_count: None,
        },
    );
    Ok(())
}

pub async fn pull_models(models: &[String], app: Option<&AppHandle>) -> Result<(), String> {
    let total = models.len() as u32;
    for (index, model) in models.iter().enumerate() {
        emit_progress(
            app,
            SetupProgress {
                phase: "model_pull".into(),
                message: format!("Modèle {} sur {total} : {model}", index + 1),
                percent: Some(0.0),
                bytes_downloaded: None,
                bytes_total: None,
                current_model: Some(model.clone()),
                model_index: Some(index as u32 + 1),
                model_count: Some(total),
            },
        );
        pull_model(model, app).await?;
    }
    Ok(())
}

pub fn default_model() -> String {
    resolved_default_model()
}

pub fn fallback_default_model() -> &'static str {
    FALLBACK_DEFAULT_MODEL
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
