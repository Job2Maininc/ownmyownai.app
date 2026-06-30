use super::audio_decode;
use super::{MediaGenerateRequest, MediaGenerateResult};
use crate::process::command_hidden;
use crate::settings::{get_settings, resolved_cache_dir, resolved_models_dir, VoiceTtsSettings};
use futures_util::StreamExt;
use serde::{Deserialize, Serialize};
use std::io::Write;
use std::path::{Path, PathBuf};
use std::sync::atomic::{AtomicBool, Ordering};
use std::sync::{Arc, Mutex};
use std::time::Duration;
use uuid::Uuid;

pub const AUDIO_EXTENSIONS: &[&str] = &["wav", "mp3", "m4a", "ogg", "flac", "webm"];

const WHISPER_MODEL_BASE_URL: &str =
    "https://huggingface.co/ggerganov/whisper.cpp/resolve/main";

static WHISPER_CLI_CACHE: Mutex<Option<Option<PathBuf>>> = Mutex::new(None);

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct VoiceSttStatus {
    pub cli_found: bool,
    pub cli_path: Option<String>,
    pub model_installed: bool,
    pub model_path: Option<String>,
    pub model_name: String,
    pub language: Option<String>,
    pub ready: bool,
    pub message: String,
}

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct TranscribeAudioResult {
    pub text: String,
    pub model: String,
    pub language: String,
    pub source_path: String,
}

pub fn is_audio_filename(filename: &str) -> bool {
    let lower = filename.to_lowercase();
    AUDIO_EXTENSIONS
        .iter()
        .any(|ext| lower.ends_with(&format!(".{ext}")))
}

pub fn is_audio_path(path: &Path) -> bool {
    path.file_name()
        .and_then(|n| n.to_str())
        .map(is_audio_filename)
        .unwrap_or(false)
}

pub fn resolved_whisper_model_name() -> String {
    get_settings()
        .ok()
        .map(|s| s.voice.whisper_model.clone())
        .unwrap_or_else(default_whisper_model)
}

pub fn resolved_stt_language() -> Option<String> {
    get_settings()
        .ok()
        .and_then(|s| s.voice.stt_language.clone())
        .filter(|l| !l.trim().is_empty())
}

pub fn whisper_models_dir() -> PathBuf {
    resolved_models_dir().join("whisper")
}

pub fn whisper_tools_dir() -> PathBuf {
    resolved_models_dir()
        .parent()
        .map(|p| p.join("tools").join("whisper"))
        .unwrap_or_else(|| resolved_models_dir().join("whisper-tools"))
}

pub fn model_filename(model_name: &str) -> String {
    let normalized = model_name.trim().to_lowercase();
    format!("ggml-{normalized}.bin")
}

pub fn resolve_whisper_model_path(model_name: &str) -> PathBuf {
    whisper_models_dir().join(model_filename(model_name))
}

pub fn invalidate_whisper_cli_cache() {
    *WHISPER_CLI_CACHE.lock().unwrap() = None;
}

pub fn resolve_whisper_cli() -> Option<PathBuf> {
    let mut cache = WHISPER_CLI_CACHE.lock().unwrap();
    if cache.is_none() {
        *cache = Some(resolve_whisper_cli_uncached());
    }
    cache.as_ref().unwrap().clone()
}

fn resolve_whisper_cli_uncached() -> Option<PathBuf> {
    if let Ok(settings) = get_settings() {
        if let Some(custom) = settings.voice.whisper_cli_path.as_ref() {
            let path = PathBuf::from(custom.trim());
            if path.is_file() {
                return Some(path);
            }
        }
    }

    for candidate in whisper_cli_candidates() {
        if candidate.is_file() {
            return Some(candidate);
        }
    }

    for name in ["whisper-cli", "whisper-cli.exe", "main", "main.exe", "whisper"] {
        if command_hidden(name)
            .arg("--help")
            .output()
            .map(|o| o.status.success() || !o.stdout.is_empty() || !o.stderr.is_empty())
            .unwrap_or(false)
        {
            return Some(PathBuf::from(name));
        }
    }

    None
}

fn whisper_cli_candidates() -> Vec<PathBuf> {
    let tools = whisper_tools_dir();
    [
        "whisper-cli.exe",
        "main.exe",
        "whisper-cli",
        "main",
        "Release/whisper-cli.exe",
        "Release/main.exe",
    ]
    .into_iter()
    .map(|name| tools.join(name))
    .collect()
}

pub fn get_stt_status() -> VoiceSttStatus {
    let model_name = resolved_whisper_model_name();
    let model_path = resolve_whisper_model_path(&model_name);
    let cli_path = resolve_whisper_cli();
    let model_installed = model_path.is_file();
    let cli_found = cli_path.is_some();
    let language = resolved_stt_language();

    let ready = cli_found && model_installed;
    let message = if ready {
        "Whisper.cpp prêt pour la transcription locale.".into()
    } else if !cli_found && !model_installed {
        "Installez whisper-cli (whisper.cpp) et téléchargez un modèle GGML.".into()
    } else if !cli_found {
        "Binaire whisper-cli introuvable — placez-le dans tools/whisper ou PATH.".into()
    } else {
        format!("Modèle GGML « {model_name} » absent — utilisez ensure_whisper_model.")
    };

    VoiceSttStatus {
        cli_found,
        cli_path: cli_path.map(|p| p.to_string_lossy().into_owned()),
        model_installed,
        model_path: if model_installed {
            Some(model_path.to_string_lossy().into_owned())
        } else {
            None
        },
        model_name,
        language,
        ready,
        message,
    }
}

pub async fn ensure_whisper_model(model: Option<String>) -> Result<PathBuf, String> {
    let model_name = model.unwrap_or_else(resolved_whisper_model_name);
    let dest = resolve_whisper_model_path(&model_name);
    if dest.is_file() {
        return Ok(dest);
    }

    std::fs::create_dir_all(dest.parent().unwrap_or(Path::new(".")))
        .map_err(|e| e.to_string())?;

    let url = format!(
        "{WHISPER_MODEL_BASE_URL}/{}",
        model_filename(&model_name)
    );
    let client = reqwest::Client::builder()
        .timeout(Duration::from_secs(600))
        .build()
        .map_err(|e| e.to_string())?;

    let response = client
        .get(&url)
        .send()
        .await
        .map_err(|e| format!("Téléchargement modèle Whisper : {e}"))?;

    if !response.status().is_success() {
        return Err(format!(
            "Modèle Whisper introuvable ({}) : {url}",
            response.status()
        ));
    }

    let mut file = std::fs::File::create(&dest).map_err(|e| e.to_string())?;
    let mut stream = response.bytes_stream();

    while let Some(chunk) = stream.next().await {
        let chunk = chunk.map_err(|e| format!("Téléchargement interrompu : {e}"))?;
        file.write_all(&chunk).map_err(|e| e.to_string())?;
    }

    Ok(dest)
}

pub async fn transcribe_audio_file(path: &Path) -> Result<TranscribeAudioResult, String> {
    if !path.is_file() {
        return Err(format!("Fichier audio introuvable : {}", path.display()));
    }
    if !is_audio_path(path) {
        return Err(format!(
            "Extension non supportée. Formats : {}",
            AUDIO_EXTENSIONS.join(", ")
        ));
    }

    let cli = resolve_whisper_cli().ok_or_else(|| {
        String::from(
            "whisper-cli introuvable. Téléchargez whisper.cpp et placez whisper-cli.exe dans tools/whisper, ou définissez whisperCliPath.",
        )
    })?;

    let model_name = resolved_whisper_model_name();
    let model_path = resolve_whisper_model_path(&model_name);
    if !model_path.is_file() {
        ensure_whisper_model(Some(model_name.clone())).await?;
    }

    let cache_dir = resolved_cache_dir().join("whisper");
    std::fs::create_dir_all(&cache_dir).map_err(|e| e.to_string())?;
    let job_id = Uuid::new_v4();
    let wav_path = cache_dir.join(format!("{job_id}.wav"));
    let out_prefix = cache_dir.join(format!("{job_id}-out"));

    audio_decode::convert_to_whisper_wav(path, &wav_path)?;

    let language = resolved_stt_language().unwrap_or_else(|| "auto".into());
    let output = command_hidden(&cli)
        .arg("-m")
        .arg(&model_path)
        .arg("-f")
        .arg(&wav_path)
        .arg("-l")
        .arg(&language)
        .args(["--no-timestamps", "-otxt", "-of"])
        .arg(&out_prefix)
        .output()
        .map_err(|e| format!("Exécution whisper-cli : {e}"))?;

    let _ = std::fs::remove_file(&wav_path);

    if !output.status.success() {
        let stderr = String::from_utf8_lossy(&output.stderr);
        let stdout = String::from_utf8_lossy(&output.stdout);
        return Err(format!(
            "whisper-cli a échoué (code {:?}) : {stderr}{stdout}",
            output.status.code()
        ));
    }

    let txt_path = PathBuf::from(format!("{}.txt", out_prefix.to_string_lossy()));
    let text = if txt_path.is_file() {
        let content = std::fs::read_to_string(&txt_path).map_err(|e| e.to_string())?;
        let _ = std::fs::remove_file(&txt_path);
        content.trim().to_string()
    } else {
        String::from_utf8_lossy(&output.stdout).trim().to_string()
    };

    if text.is_empty() {
        return Err("Transcription vide — vérifiez le fichier audio et le modèle Whisper.".into());
    }

    Ok(TranscribeAudioResult {
        text,
        model: model_name,
        language,
        source_path: path.to_string_lossy().into_owned(),
    })
}

pub fn default_whisper_model() -> String {
    "base".to_string()
}

// --- TTS (Piper / edge-tts / OpenAI) ---

const MAX_TTS_CHARS: usize = 8_000;

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct TtsStatus {
    pub engine: String,
    pub piper_available: bool,
    pub piper_model: Option<String>,
    pub edge_tts_available: bool,
    pub openai_available: bool,
    pub air_gapped: bool,
    pub ready: bool,
    pub message: String,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct TtsRequest {
    pub text: String,
    #[serde(default)]
    pub engine: Option<String>,
    #[serde(default)]
    pub voice: Option<String>,
}

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct TtsResult {
    pub bytes: Vec<u8>,
    pub mime_type: String,
    pub engine: String,
    pub filepath: Option<String>,
    pub extension: String,
}

fn voice_tts_settings() -> VoiceTtsSettings {
    get_settings()
        .map(|s| s.voice_tts)
        .unwrap_or_default()
}

fn piper_search_paths() -> Vec<PathBuf> {
    let mut paths = Vec::new();
    if let Ok(local) = std::env::var("LOCALAPPDATA") {
        paths.push(
            PathBuf::from(&local)
                .join("Programs")
                .join("piper")
                .join("piper.exe"),
        );
    }
    paths.push(PathBuf::from(r"C:\Program Files\piper\piper.exe"));
    paths
}

fn resolve_piper_exe() -> Option<PathBuf> {
    let settings = voice_tts_settings();
    if let Some(custom) = settings.piper_exe.as_ref() {
        let path = PathBuf::from(custom.trim());
        if path.is_file() {
            return Some(path);
        }
    }
    for name in ["piper", "piper.exe"] {
        if command_hidden(name)
            .arg("--help")
            .output()
            .map(|o| o.status.success())
            .unwrap_or(false)
        {
            return Some(PathBuf::from(name));
        }
    }
    piper_search_paths().into_iter().find(|p| p.is_file())
}

fn resolve_piper_model() -> Option<PathBuf> {
    let settings = voice_tts_settings();
    if let Some(custom) = settings.piper_model.as_ref() {
        let path = PathBuf::from(custom.trim());
        if path.is_file() {
            return Some(path);
        }
    }
    let models_dir = resolved_models_dir().join("piper");
    for name in [
        "fr_FR-siwis-medium.onnx",
        "fr-fr-siwis-medium.onnx",
        "en_US-lessac-medium.onnx",
    ] {
        let path = models_dir.join(name);
        if path.is_file() {
            return Some(path);
        }
    }
    std::fs::read_dir(&models_dir)
        .ok()
        .and_then(|entries| {
            entries
                .filter_map(|e| e.ok())
                .map(|e| e.path())
                .find(|p| p.extension().is_some_and(|ext| ext == "onnx"))
        })
}

fn edge_tts_on_path() -> bool {
    command_hidden("edge-tts")
        .arg("--version")
        .output()
        .map(|o| o.status.success())
        .unwrap_or(false)
        || command_hidden("python")
            .args(["-m", "edge_tts", "--version"])
            .output()
            .map(|o| o.status.success())
            .unwrap_or(false)
        || command_hidden("py")
            .args(["-m", "edge_tts", "--version"])
            .output()
            .map(|o| o.status.success())
            .unwrap_or(false)
}

fn openai_tts_available() -> bool {
    if crate::settings::air_gapped_enabled() {
        return false;
    }
    let enabled = get_settings()
        .map(|s| s.cloud_providers.openai.enabled)
        .unwrap_or(false);
    enabled
        && crate::cloud_keys::get_provider_api_key(crate::cloud_keys::CloudProviderId::OpenAi)
            .ok()
            .flatten()
            .is_some()
}

pub fn detect_tts_status() -> TtsStatus {
    let settings = voice_tts_settings();
    let piper_exe = resolve_piper_exe();
    let piper_model = resolve_piper_model();
    let piper_available = piper_exe.is_some() && piper_model.is_some();
    let edge_tts_available = edge_tts_on_path() && !crate::settings::air_gapped_enabled();
    let openai_available = openai_tts_available();
    let air_gapped = crate::settings::air_gapped_enabled();
    let engine = settings.engine.clone();

    let ready = match engine.as_str() {
        "piper" => piper_available,
        "edge-tts" => edge_tts_available,
        "openai" => openai_available,
        "auto" => piper_available || edge_tts_available || openai_available,
        _ => false,
    };

    let message = if ready {
        format!("TTS prêt ({engine}).")
    } else if air_gapped && !piper_available {
        "Mode air-gapped : installez Piper + un modèle .onnx dans models/piper/.".into()
    } else {
        "Installez Piper (offline) ou edge-tts (`pip install edge-tts`), ou activez OpenAI TTS.".into()
    };

    TtsStatus {
        engine,
        piper_available,
        piper_model: piper_model.map(|p| p.to_string_lossy().into_owned()),
        edge_tts_available,
        openai_available,
        air_gapped,
        ready,
        message,
    }
}

fn validate_tts_text(text: &str) -> Result<&str, String> {
    let trimmed = text.trim();
    if trimmed.is_empty() {
        return Err("Texte requis pour la synthèse vocale.".into());
    }
    if trimmed.chars().count() > MAX_TTS_CHARS {
        return Err(format!(
            "Texte trop long ({MAX_TTS_CHARS} caractères max pour la synthèse vocale)."
        ));
    }
    Ok(trimmed)
}

fn pick_tts_engine(requested: &str, piper_ok: bool, edge_ok: bool, openai_ok: bool) -> Result<&'static str, String> {
    match requested {
        "piper" => {
            if piper_ok {
                Ok("piper")
            } else {
                Err("Piper indisponible — installez piper.exe et un modèle .onnx.".into())
            }
        }
        "edge-tts" => {
            if edge_ok {
                Ok("edge-tts")
            } else {
                Err("edge-tts indisponible — `pip install edge-tts` ou mode air-gapped actif.".into())
            }
        }
        "openai" => {
            if openai_ok {
                Ok("openai")
            } else {
                Err("OpenAI TTS indisponible — clé API ou fournisseur désactivé.".into())
            }
        }
        "auto" => {
            if piper_ok {
                Ok("piper")
            } else if edge_ok {
                Ok("edge-tts")
            } else if openai_ok {
                Ok("openai")
            } else {
                Err(
                    "Aucun moteur TTS disponible. Installez Piper ou edge-tts, ou configurez OpenAI."
                        .into(),
                )
            }
        }
        other => Err(format!("Moteur TTS inconnu : {other}")),
    }
}

pub async fn synthesize_speech(request: TtsRequest) -> Result<TtsResult, String> {
    let text = validate_tts_text(&request.text)?;
    let settings = voice_tts_settings();
    let piper_ok = resolve_piper_exe().is_some() && resolve_piper_model().is_some();
    let edge_ok = edge_tts_on_path() && !crate::settings::air_gapped_enabled();
    let openai_ok = openai_tts_available();
    let requested = request
        .engine
        .as_deref()
        .unwrap_or(settings.engine.as_str());
    let used_engine = pick_tts_engine(requested, piper_ok, edge_ok, openai_ok)?;

    let cache = resolved_cache_dir().join("tts");
    std::fs::create_dir_all(&cache).map_err(|e| e.to_string())?;

    match used_engine {
        "piper" => {
            let out_path = cache.join(format!("tts-{}.wav", Uuid::new_v4()));
            synthesize_piper(text, &out_path, &settings)?;
            let bytes = std::fs::read(&out_path).map_err(|e| e.to_string())?;
            Ok(TtsResult {
                bytes,
                mime_type: "audio/wav".into(),
                engine: "piper".into(),
                filepath: Some(out_path.to_string_lossy().into_owned()),
                extension: "wav".into(),
            })
        }
        "edge-tts" => {
            let voice = request
                .voice
                .as_deref()
                .unwrap_or(settings.edge_tts_voice.as_str());
            let out_path = cache.join(format!("tts-{}.mp3", Uuid::new_v4()));
            synthesize_edge_tts(text, voice, &out_path).await?;
            let bytes = std::fs::read(&out_path).map_err(|e| e.to_string())?;
            Ok(TtsResult {
                bytes,
                mime_type: "audio/mpeg".into(),
                engine: "edge-tts".into(),
                filepath: Some(out_path.to_string_lossy().into_owned()),
                extension: "mp3".into(),
            })
        }
        "openai" => {
            let voice = request
                .voice
                .as_deref()
                .unwrap_or(
                    settings
                        .openai_voice
                        .as_deref()
                        .unwrap_or("nova"),
                );
            let out_path = cache.join(format!("tts-{}.mp3", Uuid::new_v4()));
            synthesize_openai_tts(text, voice, &out_path).await?;
            let bytes = std::fs::read(&out_path).map_err(|e| e.to_string())?;
            Ok(TtsResult {
                bytes,
                mime_type: "audio/mpeg".into(),
                engine: "openai".into(),
                filepath: Some(out_path.to_string_lossy().into_owned()),
                extension: "mp3".into(),
            })
        }
        _ => unreachable!(),
    }
}

fn synthesize_piper(text: &str, out_path: &Path, _settings: &VoiceTtsSettings) -> Result<(), String> {
    let piper = resolve_piper_exe().ok_or("piper introuvable")?;
    let model = resolve_piper_model()
        .ok_or("Modèle Piper .onnx requis — placez-le dans models/piper/ ou voiceTts.piperModel.")?;

    let status = command_hidden(&piper)
        .args(["--model", &model.to_string_lossy(), "--output_file"])
        .arg(out_path)
        .stdin(std::process::Stdio::piped())
        .stdout(std::process::Stdio::null())
        .stderr(std::process::Stdio::piped())
        .spawn()
        .and_then(|mut child| {
            if let Some(mut stdin) = child.stdin.take() {
                use std::io::Write;
                let _ = stdin.write_all(text.as_bytes());
                let _ = stdin.write_all(b"\n");
            }
            child.wait()
        })
        .map_err(|e| format!("Piper : {e}"))?;

    if !status.success() {
        return Err("Piper a échoué.".into());
    }
    if !out_path.is_file() {
        return Err("Piper n'a pas produit de fichier audio.".into());
    }
    Ok(())
}

async fn synthesize_edge_tts(text: &str, voice: &str, out_path: &Path) -> Result<(), String> {
    let text_file = out_path.with_extension("txt");
    std::fs::write(&text_file, text).map_err(|e| e.to_string())?;
    let voice_owned = voice.to_string();
    let out = out_path.to_path_buf();
    let text_path = text_file.clone();

    let result = tauri::async_runtime::spawn_blocking(move || {
        let runners: [(&str, &[&str]); 3] = [
            ("edge-tts", &[]),
            ("python", &["-m", "edge_tts"]),
            ("py", &["-m", "edge_tts"]),
        ];
        for (program, prefix) in runners {
            let mut cmd = command_hidden(program);
            for arg in prefix {
                cmd.arg(*arg);
            }
            let status = cmd
                .args([
                    "--voice",
                    &voice_owned,
                    "--file",
                    &text_path.to_string_lossy(),
                    "--write-media",
                ])
                .arg(&out)
                .status()
                .map_err(|e| format!("edge-tts ({program}) : {e}"))?;
            if status.success() && out.is_file() {
                return Ok(());
            }
        }
        Err("edge-tts indisponible — installez : pip install edge-tts".into())
    })
    .await
    .map_err(|e| e.to_string())?;

    let _ = std::fs::remove_file(&text_file);
    result
}

async fn synthesize_openai_tts(text: &str, voice: &str, out_path: &Path) -> Result<(), String> {
    let api_key = crate::cloud_keys::get_provider_api_key(crate::cloud_keys::CloudProviderId::OpenAi)?
        .ok_or("Clé API OpenAI introuvable.")?;

    let client = reqwest::Client::builder()
        .timeout(Duration::from_secs(120))
        .build()
        .map_err(|e| e.to_string())?;

    let body = serde_json::json!({
        "model": "tts-1",
        "input": text,
        "voice": voice,
        "response_format": "mp3",
    });

    let response = client
        .post("https://api.openai.com/v1/audio/speech")
        .header("Authorization", format!("Bearer {api_key}"))
        .json(&body)
        .send()
        .await
        .map_err(|e| format!("OpenAI TTS : {e}"))?;

    if !response.status().is_success() {
        let status = response.status();
        let detail = response.text().await.unwrap_or_default();
        return Err(format!("OpenAI TTS erreur ({status}) : {detail}"));
    }

    let bytes = response.bytes().await.map_err(|e| e.to_string())?;
    std::fs::write(out_path, &bytes).map_err(|e| e.to_string())?;
    Ok(())
}

/// Génération média `kind=voice` : TTS (défaut) ou STT Whisper.cpp (`voiceMode=stt`).
pub async fn generate_media(
    request: &MediaGenerateRequest,
    cancel: &Arc<AtomicBool>,
    on_progress: &Arc<dyn Fn(u8, &str) + Send + Sync>,
) -> Result<MediaGenerateResult, String> {
    if cancel.load(Ordering::SeqCst) {
        return Err("__cancelled__".into());
    }

    let voice_mode = request
        .options
        .get("voiceMode")
        .and_then(|v| v.as_str())
        .unwrap_or("tts")
        .to_ascii_lowercase();

    if voice_mode == "stt" {
        let source = request
            .options
            .get("sourcePath")
            .and_then(|v| v.as_str())
            .ok_or("sourcePath requis pour la transcription STT")?;

        on_progress(10, "Transcription Whisper.cpp…");
        if cancel.load(Ordering::SeqCst) {
            return Err("__cancelled__".into());
        }

        let result = transcribe_audio_file(Path::new(source)).await?;
        on_progress(100, "Transcription terminée.");

        return Ok(MediaGenerateResult {
            bytes: result.text.into_bytes(),
            extension: "txt".into(),
            mime_type: "text/plain".into(),
            message: format!("Transcription Whisper ({})", result.model),
        });
    }

    on_progress(5, "Synthèse vocale…");
    let tts = synthesize_speech(TtsRequest {
        text: request.prompt.clone(),
        engine: request
            .options
            .get("engine")
            .and_then(|v| v.as_str())
            .map(String::from),
        voice: request
            .options
            .get("voice")
            .and_then(|v| v.as_str())
            .map(String::from),
    })
    .await?;

    if cancel.load(Ordering::SeqCst) {
        return Err("__cancelled__".into());
    }

    on_progress(100, "Synthèse vocale terminée.");
    Ok(MediaGenerateResult {
        bytes: tts.bytes,
        extension: tts.extension,
        mime_type: tts.mime_type,
        message: format!("Synthèse vocale ({})", tts.engine),
    })
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn detects_audio_extensions() {
        assert!(is_audio_filename("note.mp3"));
        assert!(is_audio_filename("voice.WAV"));
        assert!(!is_audio_filename("doc.pdf"));
    }

    #[test]
    fn builds_model_filename() {
        assert_eq!(model_filename("base"), "ggml-base.bin");
        assert_eq!(model_filename("large-v3"), "ggml-large-v3.bin");
    }

    #[test]
    fn rejects_empty_tts_text() {
        assert!(validate_tts_text("  ").is_err());
        assert!(validate_tts_text("Bonjour").is_ok());
    }

    #[test]
    fn pick_engine_auto_prefers_piper() {
        assert_eq!(
            pick_tts_engine("auto", true, true, true).unwrap(),
            "piper"
        );
        assert_eq!(
            pick_tts_engine("auto", false, true, false).unwrap(),
            "edge-tts"
        );
    }
}
