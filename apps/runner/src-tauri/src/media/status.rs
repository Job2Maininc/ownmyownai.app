use serde::Serialize;
use std::collections::HashMap;
use std::sync::{Mutex, OnceLock};

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct MediaJobSnapshot {
    pub id: String,
    pub kind: String,
    pub status: String,
    pub progress: u8,
    pub message: Option<String>,
}

struct MediaJobRecord {
    kind: String,
    status: String,
    progress: u8,
    message: Option<String>,
}

static MEDIA_JOBS: OnceLock<Mutex<HashMap<String, MediaJobRecord>>> = OnceLock::new();

fn jobs_map() -> &'static Mutex<HashMap<String, MediaJobRecord>> {
    MEDIA_JOBS.get_or_init(|| Mutex::new(HashMap::new()))
}

fn snapshot(id: &str, record: &MediaJobRecord) -> MediaJobSnapshot {
    MediaJobSnapshot {
        id: id.to_string(),
        kind: record.kind.clone(),
        status: record.status.clone(),
        progress: record.progress,
        message: record.message.clone(),
    }
}

/// Enregistre une génération média (file ou démarrage).
pub fn register_job(id: &str, kind: &str) {
    if let Ok(mut jobs) = jobs_map().lock() {
        jobs.insert(
            id.to_string(),
            MediaJobRecord {
                kind: kind.to_string(),
                status: "queued".to_string(),
                progress: 0,
                message: None,
            },
        );
    }
    crate::host_status::emit_status();
}

/// Met à jour la progression d'une génération média.
pub fn update_job(id: &str, status: &str, progress: u8, message: Option<String>) {
    if let Ok(mut jobs) = jobs_map().lock() {
        if let Some(record) = jobs.get_mut(id) {
            record.status = status.to_string();
            record.progress = progress.min(100);
            record.message = message;
        }
    }
    crate::host_status::emit_status();
}

/// Retire une génération terminée ou annulée.
pub fn remove_job(id: &str) {
    if let Ok(mut jobs) = jobs_map().lock() {
        jobs.remove(id);
    }
    crate::host_status::emit_status();
}

pub fn list_active_jobs() -> Vec<MediaJobSnapshot> {
    jobs_map()
        .lock()
        .ok()
        .map(|jobs| {
            jobs.iter()
                .filter(|(_, j)| j.status == "queued" || j.status == "running")
                .map(|(id, record)| snapshot(id, record))
                .collect()
        })
        .unwrap_or_default()
}

pub fn active_count() -> u32 {
    list_active_jobs().len() as u32
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

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn tracks_active_media_jobs() {
        register_job("job-1", "image");
        update_job("job-1", "running", 42, Some("Génération…".into()));
        assert_eq!(active_count(), 1);
        let jobs = list_active_jobs();
        assert_eq!(jobs[0].kind, "image");
        assert_eq!(jobs[0].progress, 42);
        remove_job("job-1");
        assert_eq!(active_count(), 0);
    }
}
