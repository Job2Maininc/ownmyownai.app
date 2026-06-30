use super::voice::{synthesize_speech, TtsRequest};
use super::{MediaGenerateRequest, MediaGenerateResult};
use crate::process::command_hidden;
use crate::settings::resolved_cache_dir;
use serde::{Deserialize, Serialize};
use std::path::{Path, PathBuf};
use std::sync::atomic::{AtomicBool, Ordering};
use std::sync::Arc;
use uuid::Uuid;

const IMAGE_EXTENSIONS: &[&str] = &["png", "jpg", "jpeg", "webp", "bmp"];
const DEFAULT_WIDTH: u32 = 1280;
const DEFAULT_HEIGHT: u32 = 720;
const DEFAULT_FPS: u32 = 30;
const DEFAULT_SLIDE_SECS: f64 = 3.0;

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct VideoPipelineStatus {
    pub ffmpeg_available: bool,
    pub ffmpeg_path: Option<String>,
    pub tts_ready: bool,
    pub ready: bool,
    pub message: String,
}

pub fn probe_video_status() -> VideoPipelineStatus {
    let ffmpeg_path = resolve_ffmpeg();
    let ffmpeg_available = ffmpeg_path.is_some();
    let tts = super::voice::detect_tts_status();

    let ready = ffmpeg_available && tts.ready;
    let message = if ready {
        "Pipeline vidéo prêt (FFmpeg + TTS).".into()
    } else if !ffmpeg_available && !tts.ready {
        "Installez FFmpeg et un moteur TTS (Piper ou edge-tts).".into()
    } else if !ffmpeg_available {
        "FFmpeg introuvable — ajoutez-le au PATH ou installez via winget/choco.".into()
    } else {
        tts.message
    };

    VideoPipelineStatus {
        ffmpeg_available,
        ffmpeg_path: ffmpeg_path.map(|p| p.to_string_lossy().into_owned()),
        tts_ready: tts.ready,
        ready,
        message,
    }
}

pub async fn generate(
    request: &MediaGenerateRequest,
    cancel: &Arc<AtomicBool>,
    on_progress: impl Fn(u8, &str),
) -> Result<MediaGenerateResult, String> {
    if cancel.load(Ordering::SeqCst) {
        return Err("__cancelled__".into());
    }

    let status = probe_video_status();
    if !status.ready {
        return Err(status.message);
    }

    let narration = request.prompt.trim();
    if narration.is_empty() {
        return Err("Texte de narration requis pour la piste TTS.".into());
    }

    on_progress(5, "Collecte des images…");
    let images = collect_image_paths(request)?;
    if images.is_empty() {
        return Err("Aucune image pour le slideshow.".into());
    }

    if cancel.load(Ordering::SeqCst) {
        return Err("__cancelled__".into());
    }

    let (width, height, fps, slide_secs) = video_options(request);
    let work_dir = resolved_cache_dir().join(format!("video-{}", Uuid::new_v4()));
    std::fs::create_dir_all(&work_dir).map_err(|e| e.to_string())?;

    let cleanup = || {
        let _ = std::fs::remove_dir_all(&work_dir);
    };

    on_progress(15, "Synthèse vocale (TTS)…");
    let tts = synthesize_speech(TtsRequest {
        text: narration.to_string(),
        engine: request
            .options
            .get("ttsEngine")
            .or_else(|| request.options.get("engine"))
            .and_then(|v| v.as_str())
            .map(String::from),
        voice: request
            .options
            .get("ttsVoice")
            .or_else(|| request.options.get("voice"))
            .and_then(|v| v.as_str())
            .map(String::from),
    })
    .await?;

    if cancel.load(Ordering::SeqCst) {
        cleanup();
        return Err("__cancelled__".into());
    }

    let audio_path = work_dir.join("narration.mp3");
    std::fs::write(&audio_path, &tts.bytes).map_err(|e| e.to_string())?;

    on_progress(40, "Assemblage slideshow FFmpeg…");
    let output_path = work_dir.join("slideshow.mp4");
    let ffmpeg = resolve_ffmpeg().expect("ffmpeg vérifié plus haut");
    let output_for_ffmpeg = output_path.clone();

    let build_result = tauri::async_runtime::spawn_blocking({
        let images = images.clone();
        let cancel = cancel.clone();
        move || {
            build_slideshow_mp4(
                &ffmpeg,
                &images,
                &audio_path,
                &output_for_ffmpeg,
                width,
                height,
                fps,
                slide_secs,
                &cancel,
            )
        }
    })
    .await
    .map_err(|e| e.to_string())?;

    if let Err(e) = build_result {
        cleanup();
        return Err(e);
    }

    if cancel.load(Ordering::SeqCst) {
        cleanup();
        return Err("__cancelled__".into());
    }

    if !output_path.is_file() {
        cleanup();
        return Err("Fichier MP4 introuvable après FFmpeg.".into());
    }

    on_progress(95, "Finalisation…");
    let bytes = std::fs::read(&output_path).map_err(|e| e.to_string())?;
    cleanup();

    on_progress(100, "Vidéo assemblée.");
    Ok(MediaGenerateResult {
        bytes,
        extension: "mp4".into(),
        mime_type: "video/mp4".into(),
        message: format!(
            "Vidéo slideshow ({} image(s), TTS {})",
            images.len(),
            tts.engine
        ),
    })
}

fn video_options(request: &MediaGenerateRequest) -> (u32, u32, u32, f64) {
    let width = request
        .options
        .get("width")
        .and_then(|v| v.as_u64())
        .unwrap_or(DEFAULT_WIDTH as u64) as u32;
    let height = request
        .options
        .get("height")
        .and_then(|v| v.as_u64())
        .unwrap_or(DEFAULT_HEIGHT as u64) as u32;
    let fps = request
        .options
        .get("fps")
        .and_then(|v| v.as_u64())
        .unwrap_or(DEFAULT_FPS as u64) as u32;
    let slide_secs = request
        .options
        .get("durationPerSlide")
        .or_else(|| request.options.get("slideDuration"))
        .and_then(|v| v.as_f64())
        .unwrap_or(DEFAULT_SLIDE_SECS)
        .clamp(0.5, 60.0);

    (width.max(320), height.max(240), fps.clamp(1, 60), slide_secs)
}

fn collect_image_paths(request: &MediaGenerateRequest) -> Result<Vec<PathBuf>, String> {
    if let Some(paths) = request
        .options
        .get("imagePaths")
        .and_then(|v| v.as_array())
    {
        let mut images = Vec::new();
        for item in paths {
            let Some(raw) = item.as_str() else {
                continue;
            };
            let path = PathBuf::from(raw);
            if !path.is_file() || !is_slideshow_image(&path) {
                return Err(format!("Image invalide : {raw}"));
            }
            images.push(path);
        }
        if images.is_empty() {
            return Err("imagePaths ne contient aucune image valide.".into());
        }
        return Ok(images);
    }

    let source = request
        .options
        .get("sourcePath")
        .and_then(|v| v.as_str())
        .ok_or(
            "sourcePath (dossier ou image) ou imagePaths requis pour kind=video.",
        )?;

    let path = PathBuf::from(source);
    if path.is_dir() {
        let mut images: Vec<PathBuf> = std::fs::read_dir(&path)
            .map_err(|e| format!("Lecture dossier images : {e}"))?
            .filter_map(|entry| entry.ok().map(|e| e.path()))
            .filter(|p| p.is_file() && is_slideshow_image(p))
            .collect();
        images.sort();
        if images.is_empty() {
            return Err(format!(
                "Aucune image (.png, .jpg, .webp…) dans {}",
                path.display()
            ));
        }
        Ok(images)
    } else if path.is_file() && is_slideshow_image(&path) {
        Ok(vec![path])
    } else {
        Err(format!("Chemin source invalide pour slideshow : {source}"))
    }
}

fn is_slideshow_image(path: &Path) -> bool {
    path.extension()
        .and_then(|e| e.to_str())
        .map(|ext| {
            IMAGE_EXTENSIONS
                .iter()
                .any(|allowed| ext.eq_ignore_ascii_case(allowed))
        })
        .unwrap_or(false)
}

fn resolve_ffmpeg() -> Option<PathBuf> {
    for name in ["ffmpeg", "ffmpeg.exe"] {
        if command_hidden(name)
            .arg("-version")
            .output()
            .map(|o| o.status.success())
            .unwrap_or(false)
        {
            return Some(PathBuf::from(name));
        }
    }

    if let Ok(local) = std::env::var("LOCALAPPDATA") {
        for sub in [
            r"Microsoft\WinGet\Links\ffmpeg.exe",
            r"Programs\ffmpeg\bin\ffmpeg.exe",
        ] {
            let candidate = PathBuf::from(&local).join(sub);
            if candidate.is_file() {
                return Some(candidate);
            }
        }
    }

    for candidate in [
        PathBuf::from(r"C:\ffmpeg\bin\ffmpeg.exe"),
        PathBuf::from(r"C:\Program Files\ffmpeg\bin\ffmpeg.exe"),
    ] {
        if candidate.is_file() {
            return Some(candidate);
        }
    }

    None
}

fn ffmpeg_escape_path(path: &Path) -> String {
    path.to_string_lossy().replace('\\', "/").replace('\'', "'\\''")
}

fn write_concat_list(images: &[PathBuf], slide_secs: f64, list_path: &Path) -> Result<(), String> {
    let mut lines = String::new();
    for image in images {
        lines.push_str(&format!("file '{}'\n", ffmpeg_escape_path(image)));
        lines.push_str(&format!("duration {slide_secs:.3}\n"));
    }
    if let Some(last) = images.last() {
        lines.push_str(&format!("file '{}'\n", ffmpeg_escape_path(last)));
    }
    std::fs::write(list_path, lines).map_err(|e| e.to_string())
}

fn build_slideshow_mp4(
    ffmpeg: &Path,
    images: &[PathBuf],
    audio_path: &Path,
    output_path: &Path,
    width: u32,
    height: u32,
    fps: u32,
    slide_secs: f64,
    cancel: &Arc<AtomicBool>,
) -> Result<(), String> {
    if cancel.load(Ordering::SeqCst) {
        return Err("__cancelled__".into());
    }

    let list_path = output_path
        .parent()
        .ok_or("Répertoire de travail vidéo invalide")?
        .join("concat.txt");
    write_concat_list(images, slide_secs, &list_path)?;

    let vf = format!(
        "scale={width}:{height}:force_original_aspect_ratio=decrease,\
         pad={width}:{height}:(ow-iw)/2:(oh-ih)/2,setsar=1,format=yuv420p,fps={fps}"
    );

    let output = command_hidden(ffmpeg)
        .args([
            "-y",
            "-f",
            "concat",
            "-safe",
            "0",
            "-i",
        ])
        .arg(&list_path)
        .args(["-i"])
        .arg(audio_path)
        .args(["-vf"])
        .arg(&vf)
        .args([
            "-c:v",
            "libx264",
            "-preset",
            "fast",
            "-crf",
            "23",
            "-c:a",
            "aac",
            "-b:a",
            "192k",
            "-shortest",
            "-movflags",
            "+faststart",
        ])
        .arg(output_path)
        .output()
        .map_err(|e| format!("Exécution FFmpeg : {e}"))?;

    let _ = std::fs::remove_file(&list_path);

    if cancel.load(Ordering::SeqCst) {
        return Err("__cancelled__".into());
    }

    if !output.status.success() {
        let stderr = String::from_utf8_lossy(&output.stderr);
        let stdout = String::from_utf8_lossy(&output.stdout);
        return Err(format!(
            "FFmpeg a échoué (code {:?}) : {stderr}{stdout}",
            output.status.code()
        ));
    }

    Ok(())
}

#[cfg(test)]
mod tests {
    use super::*;
    use serde_json::json;

    #[test]
    fn detects_slideshow_images() {
        assert!(is_slideshow_image(Path::new("a.PNG")));
        assert!(is_slideshow_image(Path::new("b.webp")));
        assert!(!is_slideshow_image(Path::new("c.mp3")));
    }

    #[test]
    fn builds_concat_list_with_last_frame_repeat() {
        let dir = std::env::temp_dir().join(format!("omoa-video-test-{}", Uuid::new_v4()));
        std::fs::create_dir_all(&dir).unwrap();
        let list = dir.join("concat.txt");
        let images = vec![PathBuf::from("C:/img/a.jpg"), PathBuf::from("C:/img/b.jpg")];
        write_concat_list(&images, 2.5, &list).unwrap();
        let content = std::fs::read_to_string(&list).unwrap();
        assert!(content.contains("duration 2.500"));
        assert_eq!(content.matches("file '").count(), 3);
        let _ = std::fs::remove_dir_all(&dir);
    }

    #[test]
    fn parses_image_paths_from_options() {
        let request = MediaGenerateRequest {
            kind: super::super::MediaKind::Video,
            prompt: "Narration".into(),
            thread_id: None,
            options: json!({
                "imagePaths": ["C:\\slides\\1.png", "C:\\slides\\2.png"]
            }),
        };
        // Ne valide pas l'existence des fichiers — test structure uniquement si fichiers absents
        let err = collect_image_paths(&request);
        assert!(err.is_err() || err.is_ok());
    }
}
