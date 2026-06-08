use crate::settings::{resolved_default_model, resolved_models_dir, FALLBACK_DEFAULT_MODEL};
use futures_util::StreamExt;
use serde::{Deserialize, Serialize};
use std::io::{BufRead, BufReader};
use std::path::{Path, PathBuf};
use std::process::{Command, Output, Stdio};
use std::sync::Arc;
use tauri::{AppHandle, Emitter};

pub type PullProgressCallback = Arc<dyn Fn(SetupProgress) + Send + Sync>;

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

fn emit_progress(
    app: Option<&AppHandle>,
    progress: SetupProgress,
    extra: Option<&PullProgressCallback>,
) {
    if let Some(handle) = app {
        let _ = handle.emit("ollama-progress", &progress);
    }
    if let Some(cb) = extra {
        cb(progress);
    }
}

fn emit_message(app: Option<&AppHandle>, phase: &str, message: &str) {
    emit_progress_local(
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

fn emit_progress_local(app: Option<&AppHandle>, progress: SetupProgress) {
    emit_progress(app, progress, None);
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

fn command_hidden(program: impl AsRef<std::ffi::OsStr>) -> Command {
    let mut cmd = Command::new(program);
    #[cfg(windows)]
    {
        use std::os::windows::process::CommandExt;
        const CREATE_NO_WINDOW: u32 = 0x0800_0000;
        cmd.creation_flags(CREATE_NO_WINDOW);
    }
    cmd
}

fn run_ollama(args: &[&str]) -> Result<Output, String> {
    let exe = resolve_ollama_exe().ok_or_else(|| "Binaire Ollama introuvable".to_string())?;
    command_hidden(&exe)
        .args(args)
        .env("OLLAMA_MODELS", models_dir_env())
        .output()
        .map_err(|e| e.to_string())
}

fn strip_ansi(line: &str) -> String {
    let mut out = String::with_capacity(line.len());
    let mut chars = line.chars().peekable();
    while let Some(c) = chars.next() {
        if c == '\x1b' {
            if chars.next_if_eq(&'[').is_some() {
                for ch in chars.by_ref() {
                    if ch.is_ascii_alphabetic() {
                        break;
                    }
                }
            }
            continue;
        }
        out.push(c);
    }
    out.trim().to_string()
}

/// Parse winget / installer progress lines (e.g. "512 MB / 1.2 GB" or "45%").
fn parse_size_progress_line(line: &str) -> Option<(u64, u64, f64)> {
    let clean = strip_ansi(line);
    if clean.is_empty() {
        return None;
    }

    if let Some(idx) = clean.find('%') {
        let before = &clean[..idx];
        if let Ok(pct) = before
            .chars()
            .rev()
            .take_while(|c| c.is_ascii_digit() || *c == '.')
            .collect::<String>()
            .chars()
            .rev()
            .collect::<String>()
            .parse::<f64>()
        {
            return Some((0, 0, pct.clamp(0.0, 100.0)));
        }
    }

    let lower = clean.to_lowercase();
    let parts: Vec<&str> = lower.split('/').collect();
    if parts.len() != 2 {
        return None;
    }

    let done = parse_byte_size(parts[0])?;
    let total = parse_byte_size(parts[1])?;
    if total == 0 {
        return None;
    }
    let percent = (done as f64 / total as f64) * 100.0;
    Some((done, total, percent))
}

fn parse_byte_size(s: &str) -> Option<u64> {
    let s = s.trim();
    let mut num_str = String::new();
    let mut unit = String::new();
    for ch in s.chars() {
        if ch.is_ascii_digit() || ch == '.' {
            num_str.push(ch);
        } else if !ch.is_whitespace() {
            unit.push(ch);
        }
    }
    let value: f64 = num_str.parse().ok()?;
    let mult = match unit.as_str() {
        "b" | "o" => 1.0,
        "kb" | "ko" => 1024.0,
        "mb" | "mo" => 1024.0 * 1024.0,
        "gb" | "go" => 1024.0 * 1024.0 * 1024.0,
        _ => return None,
    };
    Some((value * mult) as u64)
}

fn emit_stream_line(app: Option<&AppHandle>, phase: &str, line: &str) {
    let clean = strip_ansi(line);
    if clean.is_empty() {
        return;
    }

    if let Some((done, total, percent)) = parse_size_progress_line(&clean) {
        let remaining = total.saturating_sub(done);
        let message = if total > 0 {
            format!(
                "{} / {} · reste {} ({percent:.0} %)",
                format_bytes(done),
                format_bytes(total),
                format_bytes(remaining)
            )
        } else {
            format!("Progression : {percent:.0} %")
        };
        emit_progress_local(
            app,
            SetupProgress {
                phase: phase.into(),
                message,
                percent: Some(percent),
                bytes_downloaded: if total > 0 { Some(done) } else { None },
                bytes_total: if total > 0 { Some(total) } else { None },
                current_model: None,
                model_index: None,
                model_count: None,
            },
        );
        return;
    }

    emit_progress_local(
        app,
        SetupProgress {
            phase: phase.into(),
            message: clean,
            percent: None,
            bytes_downloaded: None,
            bytes_total: None,
            current_model: None,
            model_index: None,
            model_count: None,
        },
    );
}

fn spawn_stream_reader(
    stream: impl std::io::Read + Send + 'static,
    app: Option<AppHandle>,
    phase: &'static str,
) -> std::thread::JoinHandle<()> {
    std::thread::spawn(move || {
        let reader = BufReader::new(stream);
        for line in reader.lines().flatten() {
            emit_stream_line(app.as_ref(), phase, &line);
        }
    })
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
                "Téléchargement d'Ollama : {} / {} · reste {} ({:.0} %)",
                format_bytes(downloaded),
                format_bytes(t),
                format_bytes(t.saturating_sub(downloaded)),
                percent.unwrap_or(0.0)
            ),
            None => format!(
                "Téléchargement d'Ollama : {} téléchargés…",
                format_bytes(downloaded)
            ),
        };

        emit_progress_local(
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

    emit_progress_local(
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
    emit_message(
        app,
        "ollama_install",
        "Lancement de l'installateur Ollama (fenêtre masquée)…",
    );

    let status = command_hidden(setup_path)
        .args(["/SP-", "/VERYSILENT", "/NORESTART"])
        .status()
        .map_err(|e| e.to_string())?;

    if !status.success() {
        return Err("L'installateur Ollama a échoué".into());
    }

    for i in 0..45 {
        if resolve_ollama_exe().is_some() {
            emit_progress_local(
                app,
                SetupProgress {
                    phase: "ollama_install".into(),
                    message: "Ollama installé.".into(),
                    percent: Some(100.0),
                    bytes_downloaded: None,
                    bytes_total: None,
                    current_model: None,
                    model_index: None,
                    model_count: None,
                },
            );
            return Ok(());
        }
        let percent = Some((i as f64 / 45.0) * 100.0);
        emit_progress_local(
            app,
            SetupProgress {
                phase: "ollama_install".into(),
                message: format!("Finalisation de l'installation… ({i}/45 s)"),
                percent,
                bytes_downloaded: None,
                bytes_total: None,
                current_model: None,
                model_index: None,
                model_count: None,
            },
        );
        tokio::time::sleep(tokio::time::Duration::from_secs(1)).await;
    }

    Err("Ollama installé mais binaire introuvable".into())
}

#[cfg(target_os = "windows")]
async fn install_ollama_via_winget(app: Option<&AppHandle>) -> Result<(), String> {
    emit_message(
        app,
        "ollama_install",
        "Installation via winget (progression ci-dessous)…",
    );

    let mut child = command_hidden("winget")
        .args([
            "install",
            "--id",
            "Ollama.Ollama",
            "-e",
            "--accept-package-agreements",
            "--accept-source-agreements",
            "--disable-interactivity",
        ])
        .stdout(Stdio::piped())
        .stderr(Stdio::piped())
        .spawn()
        .map_err(|e| format!("winget indisponible : {e}"))?;

    let stdout = child.stdout.take();
    let stderr = child.stderr.take();
    let app_stdout = app.cloned();
    let app_stderr = app.cloned();

    let stdout_handle = stdout.map(|s| spawn_stream_reader(s, app_stdout, "ollama_install"));
    let stderr_handle = stderr.map(|s| spawn_stream_reader(s, app_stderr, "ollama_install"));

    let status = child.wait().map_err(|e| e.to_string())?;

    if let Some(h) = stdout_handle {
        let _ = h.join();
    }
    if let Some(h) = stderr_handle {
        let _ = h.join();
    }

    if !status.success() {
        return Err("winget n'a pas pu installer Ollama".into());
    }

    for i in 0..30 {
        if resolve_ollama_exe().is_some() {
            emit_message(app, "ollama_install", "Ollama installé via winget.");
            return Ok(());
        }
        emit_progress_local(
            app,
            SetupProgress {
                phase: "ollama_install".into(),
                message: format!("Vérification de l'installation winget… ({i}/30)"),
                percent: Some((i as f64 / 30.0) * 100.0),
                bytes_downloaded: None,
                bytes_total: None,
                current_model: None,
                model_index: None,
                model_count: None,
            },
        );
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
        let cache_dir = dirs::data_local_dir()
            .ok_or_else(|| "Impossible d'accéder au dossier AppData".to_string())?
            .join("OwnMyOwnAI")
            .join("cache");

        std::fs::create_dir_all(&cache_dir).map_err(|e| e.to_string())?;
        let setup_path = cache_dir.join("OllamaSetup.exe");

        // Téléchargement direct en priorité : progression Go/Mo visible dans l'app.
        if !setup_path.is_file() {
            download_ollama_installer(&setup_path, app).await?;
        }

        if install_ollama_via_setup(&setup_path, app).await.is_ok() {
            return Ok(());
        }

        emit_message(
            app,
            "ollama_install",
            "Installateur direct échoué — nouvel essai via winget…",
        );
        return install_ollama_via_winget(app).await;
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

    command_hidden(&exe)
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

pub async fn pull_model(
    model: &str,
    app: Option<&AppHandle>,
    extra: Option<PullProgressCallback>,
) -> Result<(), String> {
    ensure_ollama_running(app).await?;

    let exe = resolve_ollama_exe().ok_or_else(|| "Binaire Ollama introuvable".to_string())?;
    let models_dir = models_dir_env();
    let extra_ref = extra.as_ref();

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
        extra_ref,
    );

    let mut child = command_hidden(&exe)
        .args(["pull", model])
        .env("OLLAMA_MODELS", &models_dir)
        .stdout(Stdio::piped())
        .stderr(Stdio::piped())
        .spawn()
        .map_err(|e| e.to_string())?;

    let stdout = child.stdout.take();
    let stderr = child.stderr.take();
    let model_name = model.to_string();
    let extra_stdout = extra.clone();
    let extra_stderr = extra.clone();

    let read_progress = |stream: std::process::ChildStdout, cb: Option<PullProgressCallback>| {
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
                        cb.as_ref(),
                    );
                }
            }
        })
    };

    let read_progress_stderr = |stream: std::process::ChildStderr, cb: Option<PullProgressCallback>| {
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
                        cb.as_ref(),
                    );
                }
            }
        })
    };

    let stdout_handle = stdout.map(|s| read_progress(s, extra_stdout));
    let stderr_handle = stderr.map(|s| read_progress_stderr(s, extra_stderr));

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
        extra_ref,
    );
    Ok(())
}

pub async fn pull_models(models: &[String], app: Option<&AppHandle>) -> Result<(), String> {
    let total = models.len() as u32;
    for (index, model) in models.iter().enumerate() {
        emit_progress_local(
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
        pull_model(model, app, None).await?;
    }
    Ok(())
}

pub const EMBEDDING_MODEL: &str = "nomic-embed-text";

pub fn list_installed_models() -> Vec<String> {
    check_ollama()
        .map(|s| s.models)
        .unwrap_or_default()
}

pub fn model_exists(model: &str) -> bool {
    let models = list_installed_models();
    models.iter().any(|m| m == model || m.starts_with(&format!("{model}:")))
}

pub fn delete_model(model: &str) -> Result<(), String> {
    let output = run_ollama(&["rm", model])?;
    if output.status.success() {
        Ok(())
    } else {
        Err(String::from_utf8_lossy(&output.stderr).into_owned())
    }
}

pub fn disk_free_gb_for_models_dir() -> Option<f64> {
    crate::hardware::disk_free_gb_for_path(&resolved_models_dir())
}

pub async fn create_embedding(model: &str, text: &str) -> Result<Vec<f32>, String> {
    let client = reqwest::Client::new();
    let body = serde_json::json!({
        "model": model,
        "prompt": text,
    });
    let res = client
        .post(format!("{OLLAMA_URL}/api/embeddings"))
        .json(&body)
        .send()
        .await
        .map_err(|e| e.to_string())?;
    if !res.status().is_success() {
        return Err(format!("Échec embedding : {}", res.text().await.unwrap_or_default()));
    }
    #[derive(Deserialize)]
    struct EmbedResponse {
        embedding: Vec<f32>,
    }
    let data: EmbedResponse = res.json().await.map_err(|e| e.to_string())?;
    Ok(data.embedding)
}

pub async fn ensure_embedding_model(app: Option<&AppHandle>) -> Result<(), String> {
    if model_exists(EMBEDDING_MODEL) {
        return Ok(());
    }
    pull_model(EMBEDDING_MODEL, app, None).await
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
    if !model_exists(model) {
        return Err(format!(
            "Le modèle « {model} » n'est pas installé sur ce PC. Téléchargez-le depuis le gestionnaire de modèles."
        ));
    }
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
