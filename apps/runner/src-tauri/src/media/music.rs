use super::{MediaGenerateRequest, MediaGenerateResult};
use crate::hardware::advise_music_device;
use crate::process::command_hidden;
use crate::settings::{get_settings, resolved_cache_dir, MusicGenerationSettings};
use serde::{Deserialize, Serialize};
use std::path::PathBuf;
use std::process::Stdio;
use std::sync::atomic::{AtomicBool, Ordering};
use std::sync::Arc;
use tokio::io::{AsyncBufReadExt, BufReader};
use tokio::process::Command;

const MUSICGEN_SCRIPT: &str = include_str!("../../scripts/musicgen_generate.py");
const DEFAULT_MODEL: &str = "facebook/musicgen-small";
const DEFAULT_DURATION_SECS: u32 = 10;

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct MusicGenStatus {
    pub enabled: bool,
    pub python_available: bool,
    pub audiocraft_available: bool,
    pub script_ready: bool,
    pub model: String,
    pub device: String,
    pub gpu_name: Option<String>,
    pub vram_gb: Option<f64>,
    pub device_message: String,
    pub message: String,
}

fn music_settings() -> MusicGenerationSettings {
    get_settings()
        .map(|s| s.music)
        .unwrap_or_default()
}

fn resolved_python_command(settings: &MusicGenerationSettings) -> String {
    let cmd = settings.python_command.trim();
    if cmd.is_empty() {
        "python".to_string()
    } else {
        cmd.to_string()
    }
}

fn musicgen_script_path() -> Result<PathBuf, String> {
    let cache = resolved_cache_dir();
    std::fs::create_dir_all(&cache).map_err(|e| e.to_string())?;
    let path = cache.join("musicgen_generate.py");
    if !path.is_file() {
        std::fs::write(&path, MUSICGEN_SCRIPT).map_err(|e| e.to_string())?;
    }
    Ok(path)
}

fn python_probe(python: &str, code: &str) -> bool {
    command_hidden(python)
        .args(["-c", code])
        .stdout(Stdio::null())
        .stderr(Stdio::null())
        .status()
        .map(|s| s.success())
        .unwrap_or(false)
}

pub fn probe_musicgen_status() -> MusicGenStatus {
    let settings = music_settings();
    let python = resolved_python_command(&settings);
    let python_available = python_probe(&python, "import sys; sys.exit(0)");
    let audiocraft_available =
        python_available && python_probe(&python, "import audiocraft");
    let script_ready = musicgen_script_path().is_ok();
    let device = advise_music_device(settings.force_cpu.unwrap_or(false));
    let model = if settings.model.trim().is_empty() {
        DEFAULT_MODEL.to_string()
    } else {
        settings.model.trim().to_string()
    };

    let message = if !settings.enabled {
        "Génération musicale désactivée dans les paramètres.".to_string()
    } else if !python_available {
        format!("Python introuvable ({python}). Installez Python 3.10+ et AudioCraft.")
    } else if !audiocraft_available {
        "AudioCraft absent — pip install audiocraft torch torchaudio".to_string()
    } else if !script_ready {
        "Script MusicGen indisponible dans le cache Host.".to_string()
    } else {
        format!("Prêt — {model} ({})", device.device)
    };

    MusicGenStatus {
        enabled: settings.enabled,
        python_available,
        audiocraft_available,
        script_ready,
        model,
        device: device.device.clone(),
        gpu_name: device.gpu_name.clone(),
        vram_gb: device.vram_gb,
        device_message: device.message.clone(),
        message,
    }
}

fn duration_from_request(request: &MediaGenerateRequest, settings: &MusicGenerationSettings) -> u32 {
    request
        .options
        .get("durationSeconds")
        .or_else(|| request.options.get("duration"))
        .and_then(|v| v.as_u64())
        .map(|v| v.clamp(1, 30) as u32)
        .unwrap_or_else(|| {
            if settings.duration_seconds == 0 {
                DEFAULT_DURATION_SECS
            } else {
                settings.duration_seconds.clamp(1, 30)
            }
        })
}

pub async fn generate(
    request: &MediaGenerateRequest,
    cancel: &Arc<AtomicBool>,
    on_progress: impl Fn(u8, &str),
) -> Result<MediaGenerateResult, String> {
    if cancel.load(Ordering::SeqCst) {
        return Err("__cancelled__".into());
    }

    let prompt = request.prompt.trim();
    if prompt.is_empty() {
        return Err("Prompt musical requis.".into());
    }

    let settings = music_settings();
    if !settings.enabled {
        return Err("Génération musicale désactivée.".into());
    }

    let status = probe_musicgen_status();
    if !status.python_available || !status.audiocraft_available {
        return Err(status.message);
    }

    let python = resolved_python_command(&settings);
    let script = musicgen_script_path()?;
    let device = advise_music_device(settings.force_cpu.unwrap_or(false));
    let model = if settings.model.trim().is_empty() {
        DEFAULT_MODEL.to_string()
    } else {
        settings.model.trim().to_string()
    };
    let duration = duration_from_request(request, &settings);

    on_progress(2, &format!("Lancement MusicGen ({})…", device.device));

    let cache = resolved_cache_dir();
    std::fs::create_dir_all(&cache).map_err(|e| e.to_string())?;
    let temp_output = cache.join(format!("musicgen-{}.wav", uuid::Uuid::new_v4()));

    let mut child = Command::from(command_hidden(&python));
    child
        .arg(script)
        .arg("--prompt")
        .arg(prompt)
        .arg("--output")
        .arg(&temp_output)
        .arg("--model")
        .arg(&model)
        .arg("--device")
        .arg(&device.device)
        .arg("--duration")
        .arg(duration.to_string())
        .stdout(Stdio::piped())
        .stderr(Stdio::piped())
        .stdin(Stdio::null());

    let mut child = child
        .spawn()
        .map_err(|e| format!("Impossible de lancer MusicGen ({python}) : {e}"))?;

    let stdout = child
        .stdout
        .take()
        .ok_or_else(|| "stdout MusicGen indisponible".to_string())?;

    let mut reader = BufReader::new(stdout).lines();
    while let Some(line) = reader.next_line().await.map_err(|e| e.to_string())? {
        if cancel.load(Ordering::SeqCst) {
            let _ = child.kill().await;
            return Err("__cancelled__".into());
        }
        let line = line.trim();
        if line.is_empty() {
            continue;
        }
        let event: serde_json::Value =
            serde_json::from_str(line).map_err(|e| format!("Sortie MusicGen invalide : {e}"))?;
        match event.get("type").and_then(|v| v.as_str()) {
            Some("progress") => {
                let progress = event
                    .get("progress")
                    .and_then(|v| v.as_u64())
                    .unwrap_or(0)
                    .min(99) as u8;
                let message = event
                    .get("message")
                    .and_then(|v| v.as_str())
                    .unwrap_or("Génération…");
                on_progress(progress, message);
            }
            Some("error") => {
                let message = event
                    .get("message")
                    .and_then(|v| v.as_str())
                    .unwrap_or("Erreur MusicGen");
                return Err(message.to_string());
            }
            Some("done") => {}
            _ => {}
        }
    }

    let exit = child
        .wait()
        .await
        .map_err(|e| format!("Erreur d'attente MusicGen : {e}"))?;
    if !exit.success() {
        return Err("MusicGen s'est terminé avec une erreur.".into());
    }

    if !temp_output.is_file() {
        return Err("Fichier audio généré introuvable.".into());
    }

    let bytes = std::fs::read(&temp_output).map_err(|e| e.to_string())?;
    let _ = std::fs::remove_file(&temp_output);

    on_progress(100, "Musique générée.");

    Ok(MediaGenerateResult {
        bytes,
        extension: "wav".to_string(),
        mime_type: "audio/wav".to_string(),
        message: format!("Musique générée ({prompt})"),
    })
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn status_has_model_name() {
        let status = probe_musicgen_status();
        assert!(!status.model.is_empty());
    }
}
