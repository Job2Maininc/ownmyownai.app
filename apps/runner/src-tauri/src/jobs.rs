use crate::context::{init_context_db, sync_link_with_cancel};
use crate::host_status;
use crate::ollama::ensure_embedding_model;
use serde::Serialize;
use std::collections::HashMap;
use std::sync::atomic::{AtomicBool, Ordering};
use std::sync::{Arc, Mutex, OnceLock};
use tauri::Emitter;
use uuid::Uuid;

#[derive(Debug, Clone)]
pub enum JobKind {
    ContextSync { link_id: Option<String> },
    ContextSyncAll,
    AgentRun {
        prompt: String,
        context_ids: Vec<String>,
    },
}

impl JobKind {
    fn type_name(&self) -> &'static str {
        match self {
            JobKind::ContextSync { .. } => "context.sync",
            JobKind::ContextSyncAll => "context.syncAll",
            JobKind::AgentRun { .. } => "agent.run",
        }
    }
}

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct JobSnapshot {
    pub id: String,
    pub kind: String,
    pub status: String,
    pub message: String,
    pub progress: u8,
    pub link_id: Option<String>,
}

struct JobRecord {
    kind: JobKind,
    status: String,
    message: String,
    progress: u8,
    cancel: Arc<AtomicBool>,
}

static JOBS: OnceLock<Mutex<HashMap<String, JobRecord>>> = OnceLock::new();

fn jobs_map() -> &'static Mutex<HashMap<String, JobRecord>> {
    JOBS.get_or_init(|| Mutex::new(HashMap::new()))
}

fn snapshot(id: &str, record: &JobRecord) -> JobSnapshot {
    let link_id = match &record.kind {
        JobKind::ContextSync { link_id } => link_id.clone(),
        _ => None,
    };
    JobSnapshot {
        id: id.to_string(),
        kind: record.kind.type_name().to_string(),
        status: record.status.clone(),
        message: record.message.clone(),
        progress: record.progress,
        link_id,
    }
}

pub fn has_active_jobs() -> bool {
    jobs_map()
        .lock()
        .ok()
        .map(|jobs| {
            jobs.values()
                .any(|j| j.status == "running" || j.status == "queued")
        })
        .unwrap_or(false)
}

/// Seuls les jobs agent bloquent la disponibilité « chat » côté cloud — pas l'indexation.
pub fn host_availability_busy() -> bool {
    jobs_map()
        .lock()
        .ok()
        .map(|jobs| {
            jobs.values().any(|j| {
                matches!(j.kind, JobKind::AgentRun { .. })
                    && (j.status == "running" || j.status == "queued")
            })
        })
        .unwrap_or(false)
}

fn is_indexing_kind(kind: &JobKind) -> bool {
    matches!(
        kind,
        JobKind::ContextSync { .. } | JobKind::ContextSyncAll
    )
}

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct IndexingProgressSnapshot {
    pub active: bool,
    pub progress: u8,
    pub message: String,
    pub kind: Option<String>,
}

pub fn indexing_progress_snapshot() -> IndexingProgressSnapshot {
    let active_job = jobs_map().lock().ok().and_then(|jobs| {
        jobs.iter()
            .filter(|(_, j)| {
                is_indexing_kind(&j.kind)
                    && (j.status == "running" || j.status == "queued")
            })
            .max_by_key(|(_, j)| j.progress)
            .map(|(id, j)| snapshot(id, j))
    });

    match active_job {
        Some(job) => IndexingProgressSnapshot {
            active: true,
            progress: job.progress,
            message: job.message,
            kind: Some(job.kind),
        },
        None => IndexingProgressSnapshot {
            active: false,
            progress: 0,
            message: String::new(),
            kind: None,
        },
    }
}

pub fn active_job_label() -> Option<String> {
    jobs_map().lock().ok().and_then(|jobs| {
        jobs.iter()
            .find(|(_, j)| j.status == "running")
            .map(|(_, j)| j.message.clone())
    })
}

pub fn list_jobs() -> Vec<JobSnapshot> {
    jobs_map()
        .lock()
        .ok()
        .map(|jobs| jobs.iter().map(|(id, r)| snapshot(id, r)).collect())
        .unwrap_or_default()
}

fn find_duplicate_sync(link_id: Option<&str>) -> Option<String> {
    jobs_map().lock().ok().and_then(|jobs| {
        for (id, record) in jobs.iter() {
            if record.status != "running" && record.status != "queued" {
                continue;
            }
            match (&record.kind, link_id) {
                (JobKind::ContextSyncAll, None) => return Some(id.clone()),
                (JobKind::ContextSync { link_id: existing }, Some(wanted))
                    if existing.as_deref() == Some(wanted) =>
                {
                    return Some(id.clone());
                }
                _ => {}
            }
        }
        None
    })
}

fn set_job_state(id: &str, status: &str, message: &str, progress: u8) {
    let indexing_snap = if let Ok(mut jobs) = jobs_map().lock() {
        if let Some(record) = jobs.get_mut(id) {
            record.status = status.into();
            record.message = message.into();
            record.progress = progress;
            if is_indexing_kind(&record.kind)
                && (status == "running" || status == "queued")
            {
                Some(snapshot(id, record))
            } else {
                None
            }
        } else {
            None
        }
    } else {
        None
    };

    if let Some(snap) = indexing_snap {
        emit_job_event("background-job-update", &snap);
        tauri::async_runtime::spawn(async move {
            broadcast_job_progress(&snap, None).await;
            crate::relay::maybe_push_indexing_heartbeat().await;
        });
    }
}

fn emit_job_event(event: &str, snap: &JobSnapshot) {
    if let Some(app) = host_status::app_handle() {
        let _ = app.emit(event, snap);
    }
}

async fn broadcast_job_progress(snap: &JobSnapshot, request_id: Option<&str>) {
    crate::relay::broadcast_ws(
        "job.progress",
        serde_json::json!({
            "jobId": snap.id,
            "kind": snap.kind,
            "status": snap.status,
            "message": snap.message,
            "progress": snap.progress,
            "linkId": snap.link_id,
        }),
        request_id.map(String::from),
    )
    .await;
}

async fn finish_job(id: &str, status: &str, ws_type: &str, message: &str) {
    set_job_state(id, status, message, if status == "done" { 100 } else { 0 });
    host_status::emit_status();

    let snap = jobs_map()
        .lock()
        .ok()
        .and_then(|jobs| jobs.get(id).map(|r| snapshot(id, r)));

    let was_indexing = snap
        .as_ref()
        .map(|s| s.kind.starts_with("context."))
        .unwrap_or(false);

    if let Some(snap) = snap {
        emit_job_event("background-job-update", &snap);
        crate::relay::broadcast_ws(
            ws_type,
            serde_json::json!({ "jobId": id, "message": message }),
            None,
        )
        .await;
        if status == "done" {
            emit_job_event("background-job-done", &snap);
            let kind = match snap.kind.as_str() {
                "context.sync" => crate::notifications::TaskDoneKind::SyncLink,
                "context.syncAll" => crate::notifications::TaskDoneKind::SyncAll,
                "agent.run" => crate::notifications::TaskDoneKind::Agent,
                _ => crate::notifications::TaskDoneKind::SyncAll,
            };
            crate::notifications::notify_task_done(kind, message);
        }
    }

    if let Ok(mut jobs) = jobs_map().lock() {
        jobs.remove(id);
    }
    host_status::emit_status();

    if was_indexing {
        tauri::async_runtime::spawn(async {
            crate::relay::push_cloud_heartbeat_now().await;
        });
    }
}

async fn run_job(id: String) {
    let (kind, cancel) = match jobs_map().lock() {
        Ok(jobs) => match jobs.get(&id) {
            Some(record) => (record.kind.clone(), record.cancel.clone()),
            None => return,
        },
        Err(_) => return,
    };

    set_job_state(&id, "running", "Démarrage…", 0);
    host_status::emit_status();
    let snap = jobs_map()
        .lock()
        .ok()
        .and_then(|jobs| jobs.get(&id).map(|record| snapshot(&id, record)));
    if let Some(snap) = snap {
        emit_job_event("background-job-update", &snap);
        broadcast_job_progress(&snap, None).await;
    }

    let result = match kind {
        JobKind::ContextSync { link_id } => run_context_sync(&id, link_id, &cancel).await,
        JobKind::ContextSyncAll => run_context_sync_all(id.clone(), &cancel).await,
        JobKind::AgentRun {
            prompt,
            context_ids,
        } => run_agent_job(&id, &prompt, &context_ids, &cancel).await,
    };

    match result {
        Ok(msg) => finish_job(&id, "done", "job.done", &msg).await,
        Err(e) if e == "__cancelled__" => {
            finish_job(&id, "cancelled", "job.cancelled", "Tâche annulée").await;
        }
        Err(e) => finish_job(&id, "error", "job.error", &e).await,
    }
}

async fn run_context_sync(
    id: &str,
    link_id: Option<String>,
    cancel: &Arc<AtomicBool>,
) -> Result<String, String> {
    let job_id = id.to_string();
    let _ = init_context_db();
    let _ = ensure_embedding_model(None).await;

    if let Some(link_id) = link_id {
        set_job_state(&job_id, "running", "Indexation du lien…", 10);
        host_status::emit_status();
        sync_link_with_cancel(&link_id, Some(cancel.clone()), move |progress, msg| {
            set_job_state(&job_id, "running", msg, progress);
            host_status::emit_status();
        })
        .await?;
        Ok("Indexation terminée".into())
    } else {
        run_context_sync_all(job_id, cancel).await
    }
}

async fn run_context_sync_all(job_id: String, cancel: &Arc<AtomicBool>) -> Result<String, String> {
    let _ = init_context_db();
    let _ = ensure_embedding_model(None).await;
    set_job_state(&job_id, "running", "Synchronisation des sources liées…", 5);
    host_status::emit_status();

    sync_all_links_with_cancel(job_id, cancel.clone()).await;

    if cancel.load(Ordering::SeqCst) {
        return Err("__cancelled__".into());
    }
    Ok("Synchronisation terminée".into())
}

async fn run_agent_job(
    id: &str,
    prompt: &str,
    context_ids: &[String],
    cancel: &Arc<AtomicBool>,
) -> Result<String, String> {
    use crate::agent::{run_agent, JobAgentConfig};
    use crate::ollama::ensure_ollama_running;
    use crate::settings::resolved_default_model;

    let _ = ensure_ollama_running(None).await;
    set_job_state(id, "running", "Agent en cours…", 10);
    host_status::emit_status();

    let job_id = id.to_string();
    let result = run_agent(
        JobAgentConfig {
            model: resolved_default_model(),
            context_ids: context_ids.to_vec(),
            max_steps: 10,
            system_prompt: "Tu es un assistant local OwnMyOwnAI avec accès aux outils fichiers.".into(),
            user_task: prompt.to_string(),
        },
        cancel.clone(),
        move |msg| {
            let pct = msg
                .split('/')
                .nth(1)
                .and_then(|s| s.chars().take(2).collect::<String>().parse::<u8>().ok())
                .unwrap_or(50);
            set_job_state(&job_id, "running", msg.trim(), pct.min(99));
            host_status::emit_status();
        },
    )
    .await;

    match result {
        Err(e) if e == "Annulé" => Err("__cancelled__".into()),
        other => other,
    }
}

async fn sync_all_links_with_cancel(job_id: String, cancel: Arc<AtomicBool>) {
    use crate::context::list_all_context_links;

    let links = list_all_context_links().unwrap_or_default();
    let enabled: Vec<_> = links.into_iter().filter(|l| l.enabled).collect();
    let total = enabled.len().max(1);

    for (idx, link) in enabled.into_iter().enumerate() {
        if cancel.load(Ordering::SeqCst) {
            return;
        }
        let base = ((idx as u32 * 100) / total as u32) as u8;
        let msg = format!("Indexation : {}", link.path);
        set_job_state(&job_id, "running", &msg, base);
        host_status::emit_status();
        let progress_job = job_id.clone();
        let _ = sync_link_with_cancel(
            &link.id,
            Some(cancel.clone()),
            move |p, detail| {
                let blended = base + (p / total as u8).min(99 - base);
                set_job_state(&progress_job, "running", detail, blended);
                host_status::emit_status();
            },
        )
        .await;
    }
}

pub fn submit_job(kind: JobKind) -> String {
    let dedupe_link = match &kind {
        JobKind::ContextSync { link_id } => link_id.as_deref(),
        JobKind::ContextSyncAll => None,
        JobKind::AgentRun { .. } => None,
    };

    if matches!(kind, JobKind::ContextSync { .. } | JobKind::ContextSyncAll) {
        if let Some(existing) = find_duplicate_sync(dedupe_link) {
            return existing;
        }
    }

    let id = Uuid::new_v4().to_string();
    let cancel = Arc::new(AtomicBool::new(false));
    let initial_message = match &kind {
        JobKind::ContextSync { .. } => "Indexation en file d'attente…",
        JobKind::ContextSyncAll => "Synchronisation en file d'attente…",
        JobKind::AgentRun { .. } => "Agent en file d'attente…",
    };

    if let Ok(mut jobs) = jobs_map().lock() {
        jobs.insert(
            id.clone(),
            JobRecord {
                kind,
                status: "queued".into(),
                message: initial_message.into(),
                progress: 0,
                cancel,
            },
        );
    }

    host_status::emit_status();
    if let Ok(jobs) = jobs_map().lock() {
        if let Some(record) = jobs.get(&id) {
            emit_job_event("background-job-started", &snapshot(&id, record));
        }
    }

    let job_id = id.clone();
    tauri::async_runtime::spawn(async move {
        run_job(job_id).await;
    });

    id
}

pub fn cancel_job(job_id: &str) -> bool {
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

pub fn parse_job_start_payload(payload: &serde_json::Value) -> Result<JobKind, String> {
    let kind = payload
        .get("kind")
        .and_then(|k| k.as_str())
        .unwrap_or("");
    match kind {
        "context.sync" => {
            let link_id = payload
                .get("linkId")
                .and_then(|v| v.as_str())
                .map(String::from);
            Ok(JobKind::ContextSync { link_id })
        }
        "context.syncAll" => Ok(JobKind::ContextSyncAll),
        "agent.run" => {
            let prompt = payload
                .get("prompt")
                .and_then(|p| p.as_str())
                .unwrap_or("")
                .to_string();
            if prompt.is_empty() {
                return Err("prompt requis pour agent.run".into());
            }
            let context_ids = payload
                .get("contextIds")
                .and_then(|v| v.as_array())
                .map(|arr| {
                    arr.iter()
                        .filter_map(|v| v.as_str().map(String::from))
                        .collect()
                })
                .unwrap_or_default();
            Ok(JobKind::AgentRun {
                prompt,
                context_ids,
            })
        }
        _ => Err(format!("Type de tâche inconnu : {kind}")),
    }
}
