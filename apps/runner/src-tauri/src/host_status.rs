use crate::credentials::get_credentials;
use crate::ollama::{check_ollama, default_model};
use serde::Serialize;
use std::sync::atomic::{AtomicBool, AtomicU32, AtomicU64, Ordering};
use std::sync::{Mutex, OnceLock};
use std::time::{SystemTime, UNIX_EPOCH};
use tauri::{AppHandle, Emitter};

static RELAY_CONNECTED: AtomicBool = AtomicBool::new(false);
static CLOUD_OK: AtomicBool = AtomicBool::new(false);
static ACTIVE_SESSIONS: AtomicU32 = AtomicU32::new(0);
static LAST_HEARTBEAT_MS: AtomicU64 = AtomicU64::new(0);
static APP_HANDLE: OnceLock<AppHandle> = OnceLock::new();

static LAST_HEARTBEAT_ERR: Mutex<Option<String>> = Mutex::new(None);
static LAST_RELAY_ERR: Mutex<Option<String>> = Mutex::new(None);

pub fn set_app_handle(app: AppHandle) {
    let _ = APP_HANDLE.set(app);
}

pub fn set_relay_connected(connected: bool) {
    RELAY_CONNECTED.store(connected, Ordering::SeqCst);
    if connected {
        if let Ok(mut err) = LAST_RELAY_ERR.lock() {
            *err = None;
        }
    }
    emit_status();
}

pub fn set_relay_error(msg: String) {
    if let Ok(mut err) = LAST_RELAY_ERR.lock() {
        *err = Some(msg);
    }
    emit_status();
}

pub fn set_heartbeat_ok() {
    CLOUD_OK.store(true, Ordering::SeqCst);
    let ms = SystemTime::now()
        .duration_since(UNIX_EPOCH)
        .map(|d| d.as_millis() as u64)
        .unwrap_or(0);
    LAST_HEARTBEAT_MS.store(ms, Ordering::SeqCst);
    if let Ok(mut err) = LAST_HEARTBEAT_ERR.lock() {
        *err = None;
    }
    emit_status();
}

pub fn set_heartbeat_error(msg: String) {
    CLOUD_OK.store(false, Ordering::SeqCst);
    if let Ok(mut err) = LAST_HEARTBEAT_ERR.lock() {
        *err = Some(msg);
    }
    emit_status();
}

pub fn is_session_active() -> bool {
    ACTIVE_SESSIONS.load(Ordering::SeqCst) > 0
}

/// Returns false if a chat session is already active (V1: one chat at a time).
pub fn session_started() -> bool {
    let prev = ACTIVE_SESSIONS.fetch_add(1, Ordering::SeqCst);
    if prev > 0 {
        ACTIVE_SESSIONS.fetch_sub(1, Ordering::SeqCst);
        return false;
    }
    emit_status();
    true
}

pub fn session_ended() {
    let prev = ACTIVE_SESSIONS.load(Ordering::SeqCst);
    if prev > 0 {
        ACTIVE_SESSIONS.fetch_sub(1, Ordering::SeqCst);
    }
    emit_status();
}

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct HostStatusSnapshot {
    pub host_id: Option<String>,
    pub ollama_installed: bool,
    pub ollama_running: bool,
    pub models: Vec<String>,
    pub default_model: String,
    pub relay_connected: bool,
    pub cloud_synced: bool,
    pub last_heartbeat_at: Option<String>,
    pub last_heartbeat_error: Option<String>,
    pub last_relay_error: Option<String>,
    pub active_sessions: u32,
    pub services_running: bool,
    pub disk_free_gb: Option<f64>,
}

pub fn build_snapshot() -> HostStatusSnapshot {
    let ollama = check_ollama().unwrap_or(crate::ollama::OllamaStatus {
        installed: false,
        running: false,
        models: vec![],
    });

    let host_id = get_credentials()
        .ok()
        .flatten()
        .map(|c| c.host_id);

    let last_hb_ms = LAST_HEARTBEAT_MS.load(Ordering::SeqCst);
    let last_heartbeat_at = if last_hb_ms > 0 {
        chrono::DateTime::from_timestamp_millis(last_hb_ms as i64).map(|dt| dt.to_rfc3339())
    } else {
        None
    };

    let last_heartbeat_error = LAST_HEARTBEAT_ERR.lock().ok().and_then(|g| g.clone());
    let last_relay_error = LAST_RELAY_ERR.lock().ok().and_then(|g| g.clone());

    HostStatusSnapshot {
        host_id,
        ollama_installed: ollama.installed,
        ollama_running: ollama.running,
        models: ollama.models,
        default_model: default_model().to_string(),
        relay_connected: RELAY_CONNECTED.load(Ordering::SeqCst),
        cloud_synced: CLOUD_OK.load(Ordering::SeqCst),
        last_heartbeat_at,
        last_heartbeat_error,
        last_relay_error,
        active_sessions: ACTIVE_SESSIONS.load(Ordering::SeqCst),
        services_running: crate::relay::services_running(),
        disk_free_gb: crate::ollama::disk_free_gb_for_models_dir(),
    }
}

pub fn tray_tooltip(snapshot: &HostStatusSnapshot) -> String {
    let status = if snapshot.active_sessions > 0 {
        format!("En ligne · {} chat(s)", snapshot.active_sessions)
    } else if snapshot.ollama_running && snapshot.relay_connected && snapshot.cloud_synced {
        "En ligne · en attente".to_string()
    } else if snapshot.services_running {
        "Connexion en cours…".to_string()
    } else {
        "Configuration".to_string()
    };
    format!("OwnMyOwnAI Host — {status}")
}

pub fn emit_status() {
    let snapshot = build_snapshot();
    if let Some(app) = APP_HANDLE.get() {
        crate::tray::set_tooltip(app, &tray_tooltip(&snapshot));
        let _ = app.emit("host-status", &snapshot);
    }
}
