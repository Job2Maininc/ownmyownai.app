mod audio_decode;
mod image;
mod music;
mod video;

pub mod voice;

use crate::creatives::{persist_media_file, PersistMediaInput};
use crate::host_status;
use serde::{Deserialize, Serialize};
use std::collections::HashMap;
use std::sync::atomic::{AtomicBool, Ordering};
use std::sync::{Arc, Mutex, OnceLock};
use tauri::Emitter;
use uuid::Uuid;

pub use image::{
    check_local_image_status, generate_local_image, list_comfyui_checkpoints, GenerateImageInput,
    LocalImageResult, LocalImageStatus,
};
pub use music::{probe_musicgen_status, MusicGenStatus};
pub use video::{probe_video_status, VideoPipelineStatus};
pub use voice::{
    detect_tts_status, ensure_whisper_model, get_stt_status, is_audio_filename, is_audio_path,
    synthesize_speech, transcribe_audio_file, TranscribeAudioResult, TtsRequest, TtsResult,
    TtsStatus, VoiceSttStatus,
};

#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "lowercase")]
pub enum MediaKind {
    Image,
    Voice,
    Music,
    Video,
}

impl MediaKind {
    pub fn type_name(self) -> &'static str {
        match self {
            MediaKind::Image => "image",
            MediaKind::Voice => "voice",
            MediaKind::Music => "music",
            MediaKind::Video => "video",
        }
    }

    pub fn default_extension(self) -> &'static str {
        match self {
            MediaKind::Image => "png",
            MediaKind::Voice => "wav",
            MediaKind::Music => "mp3",
            MediaKind::Video => "mp4",
        }
    }

    pub fn default_mime(self) -> &'static str {
        match self {
            MediaKind::Image => "image/png",
            MediaKind::Voice => "audio/wav",
            MediaKind::Music => "audio/mpeg",
            MediaKind::Video => "video/mp4",
        }
    }

    fn from_str_id(value: &str) -> Option<Self> {
        match value {
            "image" => Some(MediaKind::Image),
            "voice" => Some(MediaKind::Voice),
            "music" => Some(MediaKind::Music),
            "video" => Some(MediaKind::Video),
            _ => None,
        }
    }
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct MediaGenerateRequest {
    pub kind: MediaKind,
    pub prompt: String,
    #[serde(default)]
    pub thread_id: Option<String>,
    #[serde(default)]
    pub options: serde_json::Value,
}

#[derive(Debug, Clone)]
pub struct MediaGenerateResult {
    pub bytes: Vec<u8>,
    pub extension: String,
    pub mime_type: String,
    pub message: String,
}

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct MediaJobSnapshot {
    pub id: String,
    pub kind: String,
    pub status: String,
    pub message: String,
    pub progress: u8,
    pub prompt: String,
    pub thread_id: Option<String>,
    pub output_path: Option<String>,
}

struct MediaJobRecord {
    request: MediaGenerateRequest,
    status: String,
    message: String,
    progress: u8,
    output_path: Option<String>,
    cancel: Arc<AtomicBool>,
    /// Corrélation WS `media.generate` → `media.progress` / `media.done` (comme `model.pull`).
    ws_request_id: Option<String>,
}

#[derive(Debug, Clone)]
struct PersistedMediaOutput {
    filepath: String,
    filename: String,
    mime_type: String,
    bytes: u64,
}

fn job_ws_request_id(id: &str) -> Option<String> {
    jobs_map()
        .lock()
        .ok()
        .and_then(|jobs| jobs.get(id).and_then(|r| r.ws_request_id.clone()))
}

static MEDIA_JOBS: OnceLock<Mutex<HashMap<String, MediaJobRecord>>> = OnceLock::new();

fn jobs_map() -> &'static Mutex<HashMap<String, MediaJobRecord>> {
    MEDIA_JOBS.get_or_init(|| Mutex::new(HashMap::new()))
}

fn snapshot(id: &str, record: &MediaJobRecord) -> MediaJobSnapshot {
    MediaJobSnapshot {
        id: id.to_string(),
        kind: record.request.kind.type_name().to_string(),
        status: record.status.clone(),
        message: record.message.clone(),
        progress: record.progress,
        prompt: record.request.prompt.clone(),
        thread_id: record.request.thread_id.clone(),
        output_path: record.output_path.clone(),
    }
}

pub fn has_active_media_jobs() -> bool {
    active_count() > 0
}

pub fn active_count() -> u32 {
    jobs_map()
        .lock()
        .ok()
        .map(|jobs| {
            jobs.values()
                .filter(|j| j.status == "running" || j.status == "queued")
                .count() as u32
        })
        .unwrap_or(0)
}

pub fn active_label() -> Option<String> {
    let jobs = list_active_jobs();
    let running = jobs.iter().find(|j| j.status == "running")?;
    let kind_label = match running.kind.as_str() {
        "image" => "Image",
        "voice" => "Voix",
        "music" => "Musique",
        "video" => "Vidéo",
        _ => "Média",
    };
    Some(format!("{kind_label} ({})", running.progress))
}

pub fn list_active_jobs() -> Vec<MediaJobSnapshot> {
    jobs_map()
        .lock()
        .ok()
        .map(|jobs| {
            jobs.iter()
                .filter(|(_, j)| j.status == "running" || j.status == "queued")
                .map(|(id, r)| snapshot(id, r))
                .collect()
        })
        .unwrap_or_default()
}

pub fn list_media_jobs() -> Vec<MediaJobSnapshot> {
    jobs_map()
        .lock()
        .ok()
        .map(|jobs| jobs.iter().map(|(id, r)| snapshot(id, r)).collect())
        .unwrap_or_default()
}

fn set_job_state(id: &str, status: &str, message: &str, progress: u8) {
    let snap = if let Ok(mut jobs) = jobs_map().lock() {
        if let Some(record) = jobs.get_mut(id) {
            record.status = status.into();
            record.message = message.into();
            record.progress = progress;
            Some(snapshot(id, record))
        } else {
            None
        }
    } else {
        None
    };

    if let Some(snap) = snap {
        emit_media_event("media-job-update", &snap);
        let snap_clone = snap.clone();
        let request_id = job_ws_request_id(id);
        tauri::async_runtime::spawn(async move {
            broadcast_media_progress(&snap_clone, request_id.as_deref()).await;
        });
    }
}

fn set_output_path(id: &str, path: String) {
    if let Ok(mut jobs) = jobs_map().lock() {
        if let Some(record) = jobs.get_mut(id) {
            record.output_path = Some(path);
        }
    }
}

fn emit_media_event(event: &str, snap: &MediaJobSnapshot) {
    if let Some(app) = host_status::app_handle() {
        let _ = app.emit(event, snap);
    }
}

fn progress_status_for_ws(status: &str) -> &str {
    if status == "queued" {
        "queued"
    } else {
        "running"
    }
}

async fn broadcast_media_progress(snap: &MediaJobSnapshot, request_id: Option<&str>) {
    crate::relay::broadcast_ws(
        "media.progress",
        serde_json::json!({
            "jobId": snap.id,
            "kind": snap.kind,
            "status": progress_status_for_ws(&snap.status),
            "message": snap.message,
            "progress": snap.progress,
        }),
        request_id.map(String::from),
    )
    .await;
}

async fn finish_media_job(
    id: &str,
    status: &str,
    ws_type: &str,
    message: &str,
    output: Option<PersistedMediaOutput>,
) {
    set_job_state(id, status, message, if status == "done" { 100 } else { 0 });
    if let Some(ref out) = output {
        set_output_path(id, out.filepath.clone());
    }
    host_status::emit_status();

    let request_id = job_ws_request_id(id);
    let snap = jobs_map()
        .lock()
        .ok()
        .and_then(|jobs| jobs.get(id).map(|r| snapshot(id, r)));

    if let Some(snap) = snap {
        emit_media_event("media-job-update", &snap);
        let payload = if ws_type == "media.done" {
            let out = output.expect("media.done requiert un fichier de sortie");
            serde_json::json!({
                "jobId": id,
                "kind": snap.kind,
                "filename": out.filename,
                "filepath": out.filepath,
                "mimeType": out.mime_type,
                "bytes": out.bytes,
                "message": message,
            })
        } else {
            serde_json::json!({
                "jobId": id,
                "message": message,
            })
        };
        crate::relay::broadcast_ws(ws_type, payload, request_id).await;
        if status == "done" {
            emit_media_event("media-job-done", &snap);
        }
    }

    if let Ok(mut jobs) = jobs_map().lock() {
        jobs.remove(id);
    }
    host_status::emit_status();
}

async fn run_media_job(id: String) {
    let (request, cancel) = match jobs_map().lock() {
        Ok(jobs) => match jobs.get(&id) {
            Some(record) => (record.request.clone(), record.cancel.clone()),
            None => return,
        },
        Err(_) => return,
    };

    set_job_state(&id, "running", "Démarrage…", 0);
    host_status::emit_status();
    let initial_snap = jobs_map()
        .lock()
        .ok()
        .and_then(|jobs| jobs.get(&id).map(|record| snapshot(&id, record)));
    if let Some(snap) = initial_snap {
        emit_media_event("media-job-update", &snap);
        let request_id = job_ws_request_id(&id);
        broadcast_media_progress(&snap, request_id.as_deref()).await;
    }

    let job_id = id.clone();
    let on_progress: Arc<dyn Fn(u8, &str) + Send + Sync> = Arc::new(move |progress: u8, message: &str| {
        set_job_state(&job_id, "running", message, progress);
        host_status::emit_status();
    });

    let result = match request.kind {
        MediaKind::Image => image::generate(&request, &cancel, |p, m| on_progress(p, m)).await,
        MediaKind::Voice => voice::generate_media(&request, &cancel, &on_progress).await,
        MediaKind::Music => music::generate(&request, &cancel, |p, m| on_progress(p, m)).await,
        MediaKind::Video => video::generate(&request, &cancel, |p, m| on_progress(p, m)).await,
    };

    match result {
        Ok(output) => {
            let persist = persist_media_output(&id, &request, &output);
            match persist {
                Ok(persisted) => {
                    finish_media_job(
                        &id,
                        "done",
                        "media.done",
                        &output.message,
                        Some(persisted),
                    )
                    .await;
                }
                Err(e) => finish_media_job(&id, "error", "media.error", &e, None).await,
            }
        }
        Err(e) if e == "__cancelled__" => {
            finish_media_job(
                &id,
                "cancelled",
                "media.error",
                "Génération annulée",
                None,
            )
            .await;
        }
        Err(e) => finish_media_job(&id, "error", "media.error", &e, None).await,
    }
}

fn persist_media_output(
    job_id: &str,
    request: &MediaGenerateRequest,
    output: &MediaGenerateResult,
) -> Result<PersistedMediaOutput, String> {
    let persisted = persist_media_file(PersistMediaInput {
        title: None,
        prompt: Some(&request.prompt),
        kind: request.kind.type_name(),
        extension: &output.extension,
        mime_type: &output.mime_type,
        bytes: output.bytes.clone(),
        thread_id: request.thread_id.as_deref(),
        job_id: Some(job_id),
    })?;
    Ok(PersistedMediaOutput {
        filepath: persisted.filepath,
        filename: persisted.filename,
        mime_type: output.mime_type.clone(),
        bytes: persisted.bytes as u64,
    })
}

pub fn submit_media_job(request: MediaGenerateRequest, ws_request_id: Option<String>) -> String {
    let id = Uuid::new_v4().to_string();
    let cancel = Arc::new(AtomicBool::new(false));
    let initial_message = match request.kind {
        MediaKind::Image => "Génération image en file d'attente…",
        MediaKind::Voice => "Synthèse vocale en file d'attente…",
        MediaKind::Music => "Génération musicale en file d'attente…",
        MediaKind::Video => "Assemblage vidéo en file d'attente…",
    };

    if let Ok(mut jobs) = jobs_map().lock() {
        jobs.insert(
            id.clone(),
            MediaJobRecord {
                request,
                status: "queued".into(),
                message: initial_message.into(),
                progress: 0,
                output_path: None,
                cancel,
                ws_request_id,
            },
        );
    }

    host_status::emit_status();
    if let Ok(jobs) = jobs_map().lock() {
        if let Some(record) = jobs.get(&id) {
            emit_media_event("media-job-started", &snapshot(&id, record));
        }
    }

    let job_id = id.clone();
    tauri::async_runtime::spawn(async move {
        run_media_job(job_id).await;
    });

    id
}

pub fn cancel_media_job(job_id: &str) -> bool {
    let cancel_flag = jobs_map().lock().ok().and_then(|jobs| {
        jobs.get(job_id).and_then(|record| {
            if record.status == "running" || record.status == "queued" {
                Some(record.cancel.clone())
            } else {
                None
            }
        })
    });

    if let Some(cancel) = cancel_flag {
        cancel.store(true, Ordering::SeqCst);
        set_job_state(job_id, "running", "Annulation…", 0);
        host_status::emit_status();
        true
    } else {
        false
    }
}

pub fn parse_media_generate_payload(
    payload: &serde_json::Value,
) -> Result<MediaGenerateRequest, String> {
    let kind_str = payload
        .get("kind")
        .and_then(|k| k.as_str())
        .ok_or_else(|| "kind requis (image, voice, music, video)".to_string())?;
    let kind = MediaKind::from_str_id(kind_str)
        .ok_or_else(|| format!("Type média inconnu : {kind_str}"))?;

    let voice_mode = payload
        .get("voiceMode")
        .and_then(|v| v.as_str())
        .map(str::to_ascii_lowercase);
    let source_path = payload
        .get("sourcePath")
        .and_then(|v| v.as_str())
        .map(String::from);

    let mut prompt = payload
        .get("prompt")
        .and_then(|p| p.as_str())
        .unwrap_or("")
        .trim()
        .to_string();
    if prompt.is_empty() {
        if voice_mode.as_deref() == Some("stt") {
            prompt = source_path
                .clone()
                .unwrap_or_else(|| "transcription-audio".into());
        } else {
            return Err("prompt requis pour media.generate".into());
        }
    }

    let thread_id = payload
        .get("threadId")
        .and_then(|v| v.as_str())
        .map(String::from);

    let mut options = payload
        .get("options")
        .cloned()
        .unwrap_or(serde_json::Value::Object(Default::default()));
    if let Some(obj) = options.as_object_mut() {
        if let Some(mode) = voice_mode {
            obj.entry("voiceMode")
                .or_insert(serde_json::Value::String(mode));
        }
        if let Some(path) = source_path {
            obj.entry("sourcePath")
                .or_insert(serde_json::Value::String(path));
        }
        if let Some(paths) = payload.get("imagePaths") {
            obj.entry("imagePaths")
                .or_insert_with(|| paths.clone());
        }
    }

    Ok(MediaGenerateRequest {
        kind,
        prompt,
        thread_id,
        options,
    })
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn parses_media_generate_payload() {
        let payload = serde_json::json!({
            "kind": "image",
            "prompt": "Un chat sur un canapé",
            "threadId": "thread-1",
            "options": { "width": 512 }
        });
        let req = parse_media_generate_payload(&payload).unwrap();
        assert_eq!(req.kind, MediaKind::Image);
        assert_eq!(req.prompt, "Un chat sur un canapé");
    }

    #[test]
    fn parses_video_payload_with_source_path() {
        let payload = serde_json::json!({
            "kind": "video",
            "prompt": "Bienvenue dans cette présentation.",
            "sourcePath": "C:\\\\slides",
        });
        let req = parse_media_generate_payload(&payload).unwrap();
        assert_eq!(req.kind, MediaKind::Video);
        assert_eq!(
            req.options.get("sourcePath").and_then(|v| v.as_str()),
            Some("C:\\slides")
        );
    }
}
