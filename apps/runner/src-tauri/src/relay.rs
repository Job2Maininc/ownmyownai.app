use crate::context::{
    apply_inline_edit, build_codebase_context, build_rag_context_scoped, create_knowledge_base,
    delete_document,
    delete_knowledge_base, extract_mentions_from_chat, find_relevant_image_paths, get_context_summary,
    ingest_document,
    list_chunks, list_context_links, list_documents, list_knowledge_bases, load_project_rules,
    log_audit, preview_inline_edit, resolve_rag_kb_ids, start_context_watcher, strip_mentions,
    AuditAction, ContextLimits, init_context_db, RagScope,
};
use crate::projects::{
    get_active_project_id, get_project, list_projects, open_project, resolve_project_context_ids,
};
use crate::history::{
    delete_thread, fork_thread, get_thread, init_history_db, list_thread_branches, list_threads,
    save_thread,
};
use crate::credentials::{get_credentials, resolve_supabase_url, StoredCredentials};
use crate::host_status::{
    self, session_ended, session_started, set_heartbeat_error, set_heartbeat_ok,
    set_relay_connected, set_relay_error,
};
use crate::agent::{review_git_diff, run_agent_loop, AgentConfig, PrReviewInput};
use crate::model_routing::{resolve_chat_model, ChatTaskIntent};
use crate::ollama::{
    default_model, disk_free_gb_for_models_dir, ensure_embedding_model, ensure_ollama_running,
    attach_images_to_last_user_message, is_vision_model, model_exists, pull_model,
    resolve_thinking_model, stream_chat, stream_chat_thinking,
    PullProgressCallback, SetupProgress,
};
use crate::providers::{
    is_available_model, is_cloud_model, list_available_models, relay_chat_stream,
};
use crate::mcp::{call_tool as call_mcp_tool, list_all_tools, list_servers};
use crate::playbooks::{self, PlaybookRunParams};
use crate::settings::set_user_memory_enabled;
use crate::user_memory::{add_fact, build_memory_context, delete_fact, memory_state};
use crate::process::{
    clamp_timeout_secs, run_allowlisted_command, AllowlistedCommand, OutputStream,
};
use crate::settings::{resolved_context_limits, resolved_default_model};
use futures_util::{SinkExt, StreamExt};
use serde::{Deserialize, Serialize};
use std::sync::atomic::{AtomicBool, Ordering};
use std::sync::{Arc, Mutex, OnceLock};
use tokio::time::{sleep, Duration, Interval};
use tokio_tungstenite::{connect_async, tungstenite::Message};

type RelayWrite = futures_util::stream::SplitSink<
    tokio_tungstenite::WebSocketStream<tokio_tungstenite::MaybeTlsStream<tokio::net::TcpStream>>,
    Message,
>;

type SharedRelayWrite = Arc<tokio::sync::Mutex<RelayWrite>>;

static SERVICES_RUNNING: AtomicBool = AtomicBool::new(false);
static SERVICES_STOP: AtomicBool = AtomicBool::new(false);
static CHAT_CANCEL: AtomicBool = AtomicBool::new(false);
static ACTIVE_CHAT_REQUEST: Mutex<Option<String>> = Mutex::new(None);
static RELAY_WRITE: OnceLock<Mutex<Option<SharedRelayWrite>>> = OnceLock::new();

fn relay_write_slot() -> &'static Mutex<Option<SharedRelayWrite>> {
    RELAY_WRITE.get_or_init(|| Mutex::new(None))
}

pub fn set_relay_write(write: Option<SharedRelayWrite>) {
    if let Ok(mut slot) = relay_write_slot().lock() {
        *slot = write;
    }
}

pub async fn broadcast_ws(
    msg_type: &str,
    payload: serde_json::Value,
    request_id: Option<String>,
) {
    let write = relay_write_slot()
        .lock()
        .ok()
        .and_then(|slot| slot.as_ref().cloned());
    if let Some(write) = write {
        let _ = send_ws_response(&write, msg_type, payload, &request_id).await;
    }
}

const ARTIFACTS_SYSTEM_HINT: &str = "When producing standalone documents (reports, markdown, tables) for the user to copy or download locally, wrap them in a fenced block:\n\n```artifact\ntitle: Short title\n---\n(full markdown content)\n```\n\nKeep conversational text outside the block.";

pub fn services_running() -> bool {
    SERVICES_RUNNING.load(Ordering::SeqCst)
}

pub fn stop_background_services() {
    SERVICES_STOP.store(true, Ordering::SeqCst);
    SERVICES_RUNNING.store(false, Ordering::SeqCst);
    set_relay_connected(false);
    host_status::emit_status();
}

#[derive(Debug, Deserialize)]
struct RelayTokenResponse {
    token: String,
    relay_url: String,
}

#[derive(Debug, Deserialize, Serialize, Clone)]
struct WsEnvelope {
    #[serde(rename = "type")]
    msg_type: String,
    payload: serde_json::Value,
    requestId: Option<String>,
}

pub async fn start_background_services(
    creds_override: Option<StoredCredentials>,
) -> Result<(), String> {
    SERVICES_STOP.store(false, Ordering::SeqCst);

    let creds = match creds_override {
        Some(creds) => creds,
        None => get_credentials()?.ok_or("Pas de credentials — pairing requis")?,
    };
    let supabase_url = resolve_supabase_url(&creds)?;

    if SERVICES_RUNNING.swap(true, Ordering::SeqCst) {
        match send_heartbeat(&creds, &supabase_url).await {
            Ok(()) => set_heartbeat_ok(),
            Err(e) => set_heartbeat_error(e),
        }
        host_status::emit_status();
        return Ok(());
    }

    let creds_relay = creds.clone();
    let supabase_url_relay = supabase_url.clone();

    match send_heartbeat(&creds, &supabase_url).await {
        Ok(()) => set_heartbeat_ok(),
        Err(e) => set_heartbeat_error(e),
    }
    host_status::emit_status();

    let _ = init_context_db();
    let _ = init_history_db();
    start_context_watcher();

    tauri::async_runtime::spawn(async {
        if let Err(e) = ensure_ollama_running(None).await {
            eprintln!("Ollama auto-start au lancement : {e}");
        }
        host_status::emit_status();
    });

    tauri::async_runtime::spawn(async move {
        loop {
            if SERVICES_STOP.load(Ordering::SeqCst) {
                break;
            }
            if get_credentials().ok().flatten().is_none() {
                break;
            }
            if let Err(e) = run_relay_loop(&creds_relay, &supabase_url_relay).await {
                eprintln!("Relay error: {e}");
                set_relay_error(e);
            }
            if SERVICES_STOP.load(Ordering::SeqCst) {
                break;
            }
            sleep(Duration::from_secs(5)).await;
        }
    });

    tauri::async_runtime::spawn(async move {
        loop {
            if SERVICES_STOP.load(Ordering::SeqCst) {
                break;
            }
            if let Some(creds) = get_credentials().ok().flatten() {
                if let Ok(url) = resolve_supabase_url(&creds) {
                    match send_heartbeat(&creds, &url).await {
                        Ok(()) => set_heartbeat_ok(),
                        Err(e) => {
                            eprintln!("Heartbeat error: {e}");
                            set_heartbeat_error(e);
                        }
                    }
                }
            } else {
                break;
            }
            sleep(Duration::from_secs(15)).await;
        }
    });

    Ok(())
}

async fn mint_relay_token(
    creds: &StoredCredentials,
    supabase_url: &str,
) -> Result<RelayTokenResponse, String> {
    let client = reqwest::Client::new();
    let url = format!(
        "{}/functions/v1/runner-mint-relay-token",
        supabase_url.trim_end_matches('/')
    );

    let res = client
        .post(&url)
        .header("X-Device-Secret", &creds.device_secret)
        .header("X-Host-Id", &creds.host_id)
        .send()
        .await
        .map_err(|e| e.to_string())?;

    if !res.status().is_success() {
        return Err(res.text().await.unwrap_or_default());
    }

    res.json().await.map_err(|e| e.to_string())
}

async fn send_heartbeat(
    creds: &StoredCredentials,
    supabase_url: &str,
) -> Result<(), String> {
    let client = reqwest::Client::new();
    let url = format!(
        "{}/functions/v1/runner-heartbeat",
        supabase_url.trim_end_matches('/')
    );

    let status = if host_status::is_session_active() || crate::jobs::has_active_jobs() {
        "busy"
    } else {
        "online"
    };

    let res = client
        .post(&url)
        .header("X-Device-Secret", &creds.device_secret)
        .header("X-Host-Id", &creds.host_id)
        .header("Content-Type", "application/json")
        .json(&serde_json::json!({
            "status": status,
            "default_model": resolved_default_model(),
            "installed_models": list_available_models(),
            "disk_free_gb": disk_free_gb_for_models_dir(),
            "context_summary": get_context_summary(),
            "last_metrics": crate::local_metrics::heartbeat_payload(),
        }))
        .send()
        .await
        .map_err(|e| e.to_string())?;

    if !res.status().is_success() {
        return Err(res.text().await.unwrap_or_default());
    }

    Ok(())
}

fn relay_host_status() -> &'static str {
    if host_status::is_session_active() || crate::jobs::has_active_jobs() {
        "busy"
    } else {
        "online"
    }
}

async fn send_relay_host_status(write: &SharedRelayWrite) -> Result<(), String> {
    let envelope = WsEnvelope {
        msg_type: "host.status".into(),
        payload: serde_json::json!({ "status": relay_host_status() }),
        requestId: None,
    };
    write
        .lock()
        .await
        .send(Message::Text(serde_json::to_string(&envelope).map_err(|e| e.to_string())?))
        .await
        .map_err(|e| e.to_string())
}

async fn run_relay_loop(
    creds: &StoredCredentials,
    supabase_url: &str,
) -> Result<(), String> {
    let token_resp = mint_relay_token(creds, supabase_url).await?;
    let ws_url = format!(
        "{}?token={}",
        token_resp
            .relay_url
            .replace("https://", "wss://")
            .replace("http://", "ws://"),
        urlencoding::encode(&token_resp.token)
    );

    let (ws, _) = connect_async(&ws_url).await.map_err(|e| e.to_string())?;
    let (write, mut read) = ws.split();
    let write: SharedRelayWrite = Arc::new(tokio::sync::Mutex::new(write));
    set_relay_write(Some(write.clone()));
    set_relay_connected(true);
    let _ = send_relay_host_status(&write).await;

    let mut status_tick: Interval = tokio::time::interval(Duration::from_secs(8));

    loop {
        tokio::select! {
            msg = read.next() => {
                let Some(msg) = msg else { break };
                if SERVICES_STOP.load(Ordering::SeqCst) {
                    break;
                }
                let msg = msg.map_err(|e| e.to_string())?;
                match msg {
                    Message::Close(_) => break,
                    Message::Ping(payload) => {
                        let mut w = write.lock().await;
                        if w.send(Message::Pong(payload)).await.is_err() {
                            break;
                        }
                    }
                    Message::Text(text) => {
                    if let Ok(envelope) = serde_json::from_str::<WsEnvelope>(&text) {
                        match envelope.msg_type.as_str() {
                            "chat.start" => {
                                let write_task = write.clone();
                                let envelope = envelope.clone();
                                tokio::spawn(async move {
                                    let _ = handle_chat_start(&envelope, &write_task).await;
                                    let _ = send_relay_host_status(&write_task).await;
                                });
                            }
                            "chat.cancel" => {
                                handle_chat_cancel(&envelope);
                            }
                            "relay.web_clients" => {
                                let count = envelope
                                    .payload
                                    .get("count")
                                    .and_then(|c| c.as_u64())
                                    .unwrap_or(0) as u32;
                                host_status::set_web_viewers(count);
                            }
                            "model.pull" => {
                                let write_task = write.clone();
                                let envelope = envelope.clone();
                                tokio::spawn(async move {
                                    let _ = handle_model_pull(&envelope, &write_task).await;
                                });
                            }
                            "context.list" => {
                                let write_task = write.clone();
                                let envelope = envelope.clone();
                                tokio::spawn(async move {
                                    let _ = handle_context_list(&envelope, &write_task).await;
                                });
                            }
                            "context.create" => {
                                let write_task = write.clone();
                                let envelope = envelope.clone();
                                tokio::spawn(async move {
                                    let _ = handle_context_create(&envelope, &write_task).await;
                                });
                            }
                            "context.delete" => {
                                let write_task = write.clone();
                                let envelope = envelope.clone();
                                tokio::spawn(async move {
                                    let _ = handle_context_delete(&envelope, &write_task).await;
                                });
                            }
                            "context.status" => {
                                let write_task = write.clone();
                                let envelope = envelope.clone();
                                tokio::spawn(async move {
                                    let _ = handle_context_status(&envelope, &write_task).await;
                                });
                            }
                            "context.upload" => {
                                let write_task = write.clone();
                                let envelope = envelope.clone();
                                tokio::spawn(async move {
                                    let _ = handle_context_upload(&envelope, &write_task).await;
                                });
                            }
                            "context.chunks" => {
                                let write_task = write.clone();
                                let envelope = envelope.clone();
                                tokio::spawn(async move {
                                    let _ = handle_context_chunks(&envelope, &write_task).await;
                                });
                            }
                            "terminal.exec" => {
                                let write_task = write.clone();
                                let envelope = envelope.clone();
                                tokio::spawn(async move {
                                    let _ = handle_terminal_exec(&envelope, &write_task).await;
                                });
                            }
                            "pr.review" => {
                                let write_task = write.clone();
                                let envelope = envelope.clone();
                                tokio::spawn(async move {
                                    let _ = handle_pr_review(&envelope, &write_task).await;
                                });
                            }
                            "project.list" => {
                                let write_task = write.clone();
                                let envelope = envelope.clone();
                                tokio::spawn(async move {
                                    let _ = handle_project_list(&envelope, &write_task).await;
                                });
                            }
                            "project.open" => {
                                let write_task = write.clone();
                                let envelope = envelope.clone();
                                tokio::spawn(async move {
                                    let _ = handle_project_open(&envelope, &write_task).await;
                                });
                            }
                            "inline_edit.preview" => {
                                let write_task = write.clone();
                                let envelope = envelope.clone();
                                tokio::spawn(async move {
                                    let _ = handle_inline_edit_preview(&envelope, &write_task).await;
                                });
                            }
                            "inline_edit.apply" => {
                                let write_task = write.clone();
                                let envelope = envelope.clone();
                                tokio::spawn(async move {
                                    let _ = handle_inline_edit_apply(&envelope, &write_task).await;
                                });
                            }
                            "history.list" => {
                                let write_task = write.clone();
                                let envelope = envelope.clone();
                                tokio::spawn(async move {
                                    let _ = handle_history_list(&envelope, &write_task).await;
                                });
                            }
                            "history.get" => {
                                let write_task = write.clone();
                                let envelope = envelope.clone();
                                tokio::spawn(async move {
                                    let _ = handle_history_get(&envelope, &write_task).await;
                                });
                            }
                            "history.save" => {
                                let write_task = write.clone();
                                let envelope = envelope.clone();
                                tokio::spawn(async move {
                                    let _ = handle_history_save(&envelope, &write_task).await;
                                });
                            }
                            "history.delete" => {
                                let write_task = write.clone();
                                let envelope = envelope.clone();
                                tokio::spawn(async move {
                                    let _ = handle_history_delete(&envelope, &write_task).await;
                                });
                            }
                            "history.fork" => {
                                let write_task = write.clone();
                                let envelope = envelope.clone();
                                tokio::spawn(async move {
                                    let _ = handle_history_fork(&envelope, &write_task).await;
                                });
                            }
                            "history.branches" => {
                                let write_task = write.clone();
                                let envelope = envelope.clone();
                                tokio::spawn(async move {
                                    let _ = handle_history_branches(&envelope, &write_task).await;
                                });
                            }
                            "memory.list" => {
                                let write_task = write.clone();
                                let envelope = envelope.clone();
                                tokio::spawn(async move {
                                    let _ = handle_memory_list(&envelope, &write_task).await;
                                });
                            }
                            "memory.add" => {
                                let write_task = write.clone();
                                let envelope = envelope.clone();
                                tokio::spawn(async move {
                                    let _ = handle_memory_add(&envelope, &write_task).await;
                                });
                            }
                            "memory.delete" => {
                                let write_task = write.clone();
                                let envelope = envelope.clone();
                                tokio::spawn(async move {
                                    let _ = handle_memory_delete(&envelope, &write_task).await;
                                });
                            }
                            "memory.setEnabled" => {
                                let write_task = write.clone();
                                let envelope = envelope.clone();
                                tokio::spawn(async move {
                                    let _ = handle_memory_set_enabled(&envelope, &write_task).await;
                                });
                            }
                            "playbook.list" => {
                                let write_task = write.clone();
                                let envelope = envelope.clone();
                                tokio::spawn(async move {
                                    let _ = handle_playbook_list(&envelope, &write_task).await;
                                });
                            }
                            "playbook.run" => {
                                let write_task = write.clone();
                                let envelope = envelope.clone();
                                tokio::spawn(async move {
                                    let _ = handle_playbook_run(&envelope, &write_task).await;
                                    let _ = send_relay_host_status(&write_task).await;
                                });
                            }
                            "job.start" => {
                                let write_task = write.clone();
                                let envelope = envelope.clone();
                                tokio::spawn(async move {
                                    let _ = handle_job_start(&envelope, &write_task).await;
                                });
                            }
                            "job.cancel" => {
                                handle_job_cancel(&envelope);
                            }
                            "job.list" => {
                                let write_task = write.clone();
                                let envelope = envelope.clone();
                                tokio::spawn(async move {
                                    let _ = handle_job_list(&envelope, &write_task).await;
                                });
                            }
                            "mcp.list" => {
                                let write_task = write.clone();
                                let envelope = envelope.clone();
                                tokio::spawn(async move {
                                    let _ = handle_mcp_list(&envelope, &write_task).await;
                                });
                            }
                            "mcp.tools" => {
                                let write_task = write.clone();
                                let envelope = envelope.clone();
                                tokio::spawn(async move {
                                    let _ = handle_mcp_tools(&envelope, &write_task).await;
                                });
                            }
                            "mcp.call" => {
                                let write_task = write.clone();
                                let envelope = envelope.clone();
                                tokio::spawn(async move {
                                    let _ = handle_mcp_call(&envelope, &write_task).await;
                                });
                            }
                            _ => {}
                        }
                    }
                    }
                    _ => {}
                }
            }
            _ = status_tick.tick() => {
                if send_relay_host_status(&write).await.is_err() {
                    break;
                }
            }
        }
    }

    host_status::set_web_viewers(0);
    set_relay_write(None);
    set_relay_connected(false);
    Ok(())
}

fn handle_chat_cancel(envelope: &WsEnvelope) {
    let active = ACTIVE_CHAT_REQUEST
        .lock()
        .ok()
        .and_then(|g| g.clone());
    let matches = match (&envelope.requestId, active) {
        (Some(cancel_id), Some(active_id)) => cancel_id == &active_id,
        (None, Some(_)) => true,
        _ => false,
    };
    if matches {
        CHAT_CANCEL.store(true, Ordering::SeqCst);
    }
}

async fn send_chat_error(
    write: &SharedRelayWrite,
    envelope: &WsEnvelope,
    message: &str,
) -> Result<(), String> {
    let err = WsEnvelope {
        msg_type: "chat.error".into(),
        payload: serde_json::json!({ "message": message }),
        requestId: envelope.requestId.clone(),
    };
    write
        .lock()
        .await
        .send(Message::Text(serde_json::to_string(&err).unwrap()))
        .await
        .map_err(|e| e.to_string())
}

async fn send_chat_agent_step(
    write: &SharedRelayWrite,
    request_id: &Option<String>,
    step: u32,
    max_steps: u32,
    tool: &str,
    status: &str,
) -> Result<(), String> {
    let msg = WsEnvelope {
        msg_type: "chat.agent.step".into(),
        payload: serde_json::json!({
            "step": step,
            "maxSteps": max_steps,
            "tool": tool,
            "status": status,
        }),
        requestId: request_id.clone(),
    };
    write
        .lock()
        .await
        .send(Message::Text(serde_json::to_string(&msg).unwrap()))
        .await
        .map_err(|e| e.to_string())
}

async fn send_chat_delta(
    write: &SharedRelayWrite,
    request_id: &Option<String>,
    content: &str,
) -> Result<(), String> {
    let delta = WsEnvelope {
        msg_type: "chat.delta".into(),
        payload: serde_json::json!({ "content": content }),
        requestId: request_id.clone(),
    };
    write
        .lock()
        .await
        .send(Message::Text(serde_json::to_string(&delta).unwrap()))
        .await
        .map_err(|e| e.to_string())
}

async fn send_chat_citations(
    write: &SharedRelayWrite,
    request_id: &Option<String>,
    citations: &[serde_json::Value],
) -> Result<(), String> {
    let msg = WsEnvelope {
        msg_type: "chat.citations".into(),
        payload: serde_json::json!({ "citations": citations }),
        requestId: request_id.clone(),
    };
    write
        .lock()
        .await
        .send(Message::Text(serde_json::to_string(&msg).unwrap()))
        .await
        .map_err(|e| e.to_string())
}

async fn send_chat_thinking_delta(
    write: &SharedRelayWrite,
    request_id: &Option<String>,
    thinking: &str,
) -> Result<(), String> {
    let delta = WsEnvelope {
        msg_type: "chat.thinking_delta".into(),
        payload: serde_json::json!({ "thinking": thinking }),
        requestId: request_id.clone(),
    };
    write
        .lock()
        .await
        .send(Message::Text(serde_json::to_string(&delta).unwrap()))
        .await
        .map_err(|e| e.to_string())
}

async fn send_chat_done(
    write: &SharedRelayWrite,
    request_id: &Option<String>,
) -> Result<(), String> {
    let done = WsEnvelope {
        msg_type: "chat.done".into(),
        payload: serde_json::json!({}),
        requestId: request_id.clone(),
    };
    write
        .lock()
        .await
        .send(Message::Text(serde_json::to_string(&done).unwrap()))
        .await
        .map_err(|e| e.to_string())
}

async fn handle_chat_start(
    envelope: &WsEnvelope,
    write: &SharedRelayWrite,
) -> Result<(), String> {
    if !session_started() {
        return send_chat_error(
            write,
            envelope,
            "Ce PC est déjà utilisé par un autre onglet ou une autre session de chat.",
        )
        .await;
    }

    let _ = send_relay_host_status(write).await;

    CHAT_CANCEL.store(false, Ordering::SeqCst);
    if let Ok(mut active) = ACTIVE_CHAT_REQUEST.lock() {
        *active = envelope.requestId.clone();
    }

    let result = handle_chat_start_inner(envelope, write).await;
    if let Err(ref message) = result {
        let _ = send_chat_error(write, envelope, message).await;
    }

    if let Ok(mut active) = ACTIVE_CHAT_REQUEST.lock() {
        *active = None;
    }
    CHAT_CANCEL.store(false, Ordering::SeqCst);
    session_ended();
    Ok(())
}

async fn handle_chat_start_inner(
    envelope: &WsEnvelope,
    write: &SharedRelayWrite,
) -> Result<(), String> {
    let payload = &envelope.payload;
    let messages = payload
        .get("messages")
        .and_then(|m| m.as_array())
        .cloned()
        .unwrap_or_default();

    let mut messages: Vec<serde_json::Value> = messages.into_iter().take(20).collect();

    let last_user = messages
        .iter()
        .rev()
        .find(|m| m.get("role").and_then(|r| r.as_str()) == Some("user"))
        .and_then(|m| m.get("content").and_then(|c| c.as_str()))
        .unwrap_or("");

    let explicit_model = payload
        .get("model")
        .and_then(|m| m.as_str())
        .filter(|m| !m.is_empty());

    let task_intent = payload
        .get("taskIntent")
        .and_then(|v| v.as_str())
        .and_then(ChatTaskIntent::from_str);

    let thinking_mode = payload
        .get("thinkingMode")
        .and_then(|v| v.as_bool())
        .unwrap_or(false);

    let resolved = resolve_chat_model(explicit_model, task_intent, last_user);
    let model = if thinking_mode && !is_cloud_model(&resolved.model) {
        resolve_thinking_model(&resolved.model)?
    } else {
        resolved.model.clone()
    };

    let is_cloud = is_cloud_model(&model);
    if thinking_mode && is_cloud {
        return send_chat_error(
            write,
            envelope,
            "Le mode réflexion n'est pas disponible avec les modèles cloud.",
        )
        .await;
    }

    if !is_cloud {
        ensure_ollama_running(None).await?;
    }

    let loading_msg = if is_cloud {
        format!("Modèle cloud → {model}\nConnexion au fournisseur…\n\n")
    } else if thinking_mode {
        format!("Mode réflexion → {model}\nChargement du modèle sur votre PC…\n\n")
    } else {
        match resolved.intent {
            Some(intent) => {
                let fallback_note = if resolved.fallback_used {
                    " (modèle secours)"
                } else {
                    ""
                };
                format!(
                    "Routage tâche « {} » → {}{fallback_note}\nChargement du modèle sur votre PC…\n\n",
                    intent.label_fr(),
                    model
                )
            }
            None => "Chargement du modèle sur votre PC…\n\n".to_string(),
        }
    };
    let _ = send_chat_delta(write, &envelope.requestId, &loading_msg).await;

    if !is_available_model(&model) {
        let hint = if is_cloud {
            "Configurez la clé API et activez le fournisseur dans l'app Host."
        } else {
            "Téléchargez-le depuis le gestionnaire de modèles."
        };
        return send_chat_error(
            write,
            envelope,
            &format!("Le modèle « {model} » n'est pas disponible. {hint}"),
        )
        .await;
    }

    let mut context_ids: Vec<String> = payload
        .get("contextIds")
        .and_then(|v| v.as_array())
        .map(|arr| {
            arr.iter()
                .filter_map(|v| v.as_str().map(String::from))
                .collect()
        })
        .unwrap_or_default();

    let project_id = payload
        .get("projectId")
        .and_then(|v| v.as_str())
        .map(String::from)
        .or_else(get_active_project_id);

    if context_ids.is_empty() {
        if let Some(ref pid) = project_id {
            if let Ok(ids) = resolve_project_context_ids(pid) {
                context_ids = ids;
            }
        }
    }

    let enable_tools = payload
        .get("enableTools")
        .and_then(|v| v.as_bool())
        .unwrap_or(false);

    if enable_tools {
        return handle_chat_with_local_tools(
            envelope,
            write,
            &model,
            &context_ids,
            &messages,
            project_id.as_deref(),
        )
        .await;
    }

    let mut prepend_system: Vec<serde_json::Value> = Vec::new();
    if let Some(ref pid) = project_id {
        if let Ok(project) = get_project(pid, project_id.as_deref()) {
            let instr = project.system_instruction.trim();
            if !instr.is_empty() {
                prepend_system.push(serde_json::json!({ "role": "system", "content": instr }));
            }
        }
    }
    let mentions = extract_mentions_from_chat(payload, last_user);
    let rag_kb_ids = resolve_rag_kb_ids(&mentions, &context_ids).unwrap_or_default();
    let rag_query = if mentions.has_any() {
        strip_mentions(last_user)
    } else {
        last_user.to_string()
    };

    if mentions.has_any() {
        if let Some(idx) = messages.iter().rposition(|m| {
            m.get("role").and_then(|r| r.as_str()) == Some("user")
        }) {
            messages[idx] = serde_json::json!({ "role": "user", "content": rag_query });
        }
    }

    let mut rag_injected = false;
    let mut codebase_injected = false;
    if !rag_kb_ids.is_empty() {
        if let Ok(kb_instrs) = crate::context::collect_kb_system_instructions(&rag_kb_ids) {
            for instr in kb_instrs {
                prepend_system.push(serde_json::json!({ "role": "system", "content": instr }));
            }
        }
        if let Ok(Some(rules)) = load_project_rules(&rag_kb_ids) {
            prepend_system.push(serde_json::json!({ "role": "system", "content": rules }));
        }
        let scope = RagScope {
            kb_ids: rag_kb_ids.clone(),
            file_hints: mentions.file_hints.clone(),
            folder_hints: mentions.folder_hints.clone(),
        };
        if let Ok(Some(rag)) = build_rag_context_scoped(&scope, &rag_query).await {
            prepend_system.push(serde_json::json!({ "role": "system", "content": rag }));
            rag_injected = true;
        }
        if let Ok(Some(code_ctx)) = build_codebase_context(&rag_kb_ids, &rag_query).await {
            prepend_system.push(serde_json::json!({ "role": "system", "content": code_ctx }));
            codebase_injected = true;
        }
        log_audit(
            AuditAction::AgentAccess,
            Some("chat"),
            envelope.requestId.as_deref(),
            Some(serde_json::json!({
                "contextIds": rag_kb_ids,
                "model": model,
                "projectId": project_id,
                "ragInjected": rag_injected,
                "codebaseInjected": codebase_injected,
                "mentionScope": {
                    "baseNames": mentions.base_names,
                    "fileHints": mentions.file_hints,
                    "folderHints": mentions.folder_hints,
                },
            })),
        );
    }

    for (i, sys) in prepend_system.into_iter().enumerate() {
        messages.insert(i, sys);
    }

    if is_vision_model(model) && !rag_kb_ids.is_empty() {
        if let Ok(paths) = find_relevant_image_paths(&rag_kb_ids, &rag_query, 3).await {
            let _ = attach_images_to_last_user_message(&mut messages, &paths);
        }
    }

    if is_cloud {
        stream_cloud_chat(envelope, write, &model, &messages).await
    } else {
        crate::local_metrics::begin_request(&model);
        if thinking_mode {
            let response = stream_chat_thinking(&model, &messages).await?;
            stream_thinking_chat(envelope, write, response, &mut String::new()).await
        } else {
            let response = stream_chat(&model, &messages).await?;
            stream_openai_chat(envelope, write, response, &mut String::new()).await
        }
    }
}

async fn stream_cloud_chat(
    envelope: &WsEnvelope,
    write: &SharedRelayWrite,
    model: &str,
    messages: &[serde_json::Value],
) -> Result<(), String> {
    let (tx, mut rx) = tokio::sync::mpsc::unbounded_channel::<String>();
    let model_owned = model.to_string();
    let messages_owned = messages.to_vec();
    let stream_task = tokio::spawn(async move {
        relay_chat_stream(&model_owned, &messages_owned, &CHAT_CANCEL, |delta| {
            let _ = tx.send(delta.to_string());
            Ok(())
        })
        .await
    });

    let mut assistant_content = String::new();
    while let Some(delta) = rx.recv().await {
        if CHAT_CANCEL.load(Ordering::SeqCst) {
            break;
        }
        assistant_content.push_str(&delta);
        let _ = send_chat_delta(write, &envelope.requestId, &delta).await;
    }

    stream_task
        .await
        .map_err(|e| e.to_string())?
        .map_err(|e| {
            let _ = send_chat_error(write, envelope, &e);
            e
        })?;

    finish_chat_with_persist(envelope, write, &assistant_content).await
}

async fn handle_chat_with_local_tools(
    envelope: &WsEnvelope,
    write: &SharedRelayWrite,
    model: &str,
    context_ids: &[String],
    messages: &[serde_json::Value],
    project_id: Option<&str>,
) -> Result<(), String> {
    let mut agent_messages = messages.to_vec();
    let mut offset = 0usize;
    if let Some(pid) = project_id {
        if let Ok(project) = get_project(pid, project_id) {
            let instr = project.system_instruction.trim();
            if !instr.is_empty() {
                agent_messages.insert(
                    offset,
                    serde_json::json!({ "role": "system", "content": instr }),
                );
                offset += 1;
            }
        }
    }
    if let Ok(kb_instrs) = crate::context::collect_kb_system_instructions(context_ids) {
        for instr in kb_instrs {
            agent_messages.insert(
                offset,
                serde_json::json!({ "role": "system", "content": instr }),
            );
            offset += 1;
        }
    }
    if !context_ids.is_empty() {
        if let Ok(Some(rules)) = load_project_rules(context_ids) {
            agent_messages.insert(
                offset,
                serde_json::json!({ "role": "system", "content": rules }),
            );
        }
    }

    let (tx, mut rx) = tokio::sync::mpsc::unbounded_channel::<String>();
    let write_fwd = write.clone();
    let request_id = envelope.requestId.clone();
    let forward = tokio::spawn(async move {
        while let Some(delta) = rx.recv().await {
            if CHAT_CANCEL.load(Ordering::SeqCst) {
                break;
            }
            let _ = send_chat_delta(&write_fwd, &request_id, &delta).await;
        }
    });

    let tx_step = tx.clone();
    let write_step = write.clone();
    let request_step = envelope.requestId.clone();
    let on_step = Arc::new(move |step: u32, tool: &str, status: &str| {
        let _ = tx_step.send(format!("Étape {step} — `{tool}` ({status})…\n"));
        let w = write_step.clone();
        let rid = request_step.clone();
        let tool_owned = tool.to_string();
        let status_owned = status.to_string();
        tokio::spawn(async move {
            let _ = send_chat_agent_step(
                &w,
                &rid,
                step,
                crate::agent::MAX_AGENT_STEPS,
                &tool_owned,
                &status_owned,
            )
            .await;
        });
    });

    let cancel = Arc::new(|| CHAT_CANCEL.load(Ordering::SeqCst));

    let result = run_agent_loop(AgentConfig {
        model: model.to_string(),
        messages: agent_messages,
        context_ids: context_ids.to_vec(),
        on_step,
        is_cancelled: cancel,
    })
    .await;

    drop(tx);
    let _ = forward.await;

    if CHAT_CANCEL.load(Ordering::SeqCst) {
        return send_chat_done(write, &envelope.requestId).await;
    }

    match result {
        Ok(answer) => {
            if !answer.is_empty() {
                let _ = send_chat_delta(write, &envelope.requestId, &answer).await;
            }
            finish_chat_with_persist(envelope, write, &answer).await
        }
        Err(message) => send_chat_error(write, envelope, &message).await,
    }
}

async fn stream_openai_chat(
    envelope: &WsEnvelope,
    write: &SharedRelayWrite,
    response: reqwest::Response,
    assistant_content: &mut String,
) -> Result<(), String> {
    let mut stream = response.bytes_stream();

    while let Some(chunk) = stream.next().await {
        if CHAT_CANCEL.load(Ordering::SeqCst) {
            return finish_chat_with_persist(envelope, write, assistant_content).await;
        }

        let chunk = chunk.map_err(|e| e.to_string())?;
        let text = String::from_utf8_lossy(&chunk);

        for line in text.lines() {
            if CHAT_CANCEL.load(Ordering::SeqCst) {
                return finish_chat_with_persist(envelope, write, assistant_content).await;
            }

            if !line.starts_with("data: ") {
                continue;
            }
            let data = &line[6..];
            if data == "[DONE]" {
                return finish_chat_with_persist(envelope, write, assistant_content).await;
            }
            if let Ok(json) = serde_json::from_str::<serde_json::Value>(data) {
                crate::local_metrics::merge_stream_chunk(&json);
                if let Some(content) = json["choices"][0]["delta"]["content"].as_str() {
                    assistant_content.push_str(content);
                    let _ = send_chat_delta(write, &envelope.requestId, content).await;
                }
            }
        }
    }

    finish_chat_with_persist(envelope, write, assistant_content).await
}

async fn stream_thinking_chat(
    envelope: &WsEnvelope,
    write: &SharedRelayWrite,
    response: reqwest::Response,
    assistant_content: &mut String,
) -> Result<(), String> {
    let mut stream = response.bytes_stream();
    let mut line_buffer = String::new();

    while let Some(chunk) = stream.next().await {
        if CHAT_CANCEL.load(Ordering::SeqCst) {
            return finish_chat_with_persist(envelope, write, assistant_content).await;
        }

        let chunk = chunk.map_err(|e| e.to_string())?;
        line_buffer.push_str(&String::from_utf8_lossy(&chunk));

        while let Some(pos) = line_buffer.find('\n') {
            let line = line_buffer[..pos].trim().to_string();
            line_buffer = line_buffer[pos + 1..].to_string();
            if line.is_empty() {
                continue;
            }

            if CHAT_CANCEL.load(Ordering::SeqCst) {
                return finish_chat_with_persist(envelope, write, assistant_content).await;
            }

            let Ok(json) = serde_json::from_str::<serde_json::Value>(&line) else {
                continue;
            };

            crate::local_metrics::merge_stream_chunk(&json);

            if let Some(thinking) = json["message"]["thinking"].as_str() {
                if !thinking.is_empty() {
                    let _ =
                        send_chat_thinking_delta(write, &envelope.requestId, thinking).await;
                }
            }
            if let Some(content) = json["message"]["content"].as_str() {
                if !content.is_empty() {
                    assistant_content.push_str(content);
                    let _ = send_chat_delta(write, &envelope.requestId, content).await;
                }
            }
            if json["done"].as_bool() == Some(true) {
                return finish_chat_with_persist(envelope, write, assistant_content).await;
            }
        }
    }

    finish_chat_with_persist(envelope, write, assistant_content).await
}

async fn finish_chat_with_persist(
    envelope: &WsEnvelope,
    write: &SharedRelayWrite,
    assistant_content: &str,
) -> Result<(), String> {
    crate::local_metrics::finish_request();
    let result = send_chat_done(write, &envelope.requestId).await;
    if result.is_ok() {
        let _ = persist_chat_turn(envelope, assistant_content);
    }
    result
}

fn persist_chat_turn(envelope: &WsEnvelope, assistant_content: &str) -> Result<(), String> {
    let thread_id = envelope
        .payload
        .get("threadId")
        .and_then(|v| v.as_str())
        .filter(|s| !s.is_empty());
    let Some(thread_id) = thread_id else {
        return Ok(());
    };

    let model = envelope
        .payload
        .get("model")
        .and_then(|m| m.as_str());
    let context_ids: Vec<String> = envelope
        .payload
        .get("contextIds")
        .and_then(|v| v.as_array())
        .map(|arr| {
            arr.iter()
                .filter_map(|v| v.as_str().map(String::from))
                .collect()
        })
        .unwrap_or_default();

    let messages = envelope
        .payload
        .get("messages")
        .and_then(|m| m.as_array())
        .cloned()
        .unwrap_or_default();

    let mut pairs: Vec<(String, String)> = messages
        .iter()
        .filter_map(|m| {
            let role = m.get("role")?.as_str()?.to_string();
            let content = m.get("content")?.as_str()?.to_string();
            if role == "system" {
                return None;
            }
            Some((role, content))
        })
        .collect();

    let trimmed = assistant_content.trim();
    if !trimmed.is_empty() {
        if pairs.last().map(|(r, _)| r.as_str()) == Some("assistant") {
            if let Some(last) = pairs.last_mut() {
                last.1 = trimmed.to_string();
            }
        } else {
            pairs.push(("assistant".into(), trimmed.to_string()));
        }
    }

    if pairs.is_empty() {
        return Ok(());
    }

    let _ = save_thread(
        Some(thread_id),
        None,
        model,
        &context_ids,
        &pairs,
    );
    Ok(())
}

fn context_limits() -> ContextLimits {
    resolved_context_limits()
}

async fn send_ws_response(
    write: &SharedRelayWrite,
    msg_type: &str,
    payload: serde_json::Value,
    request_id: &Option<String>,
) -> Result<(), String> {
    let env = WsEnvelope {
        msg_type: msg_type.into(),
        payload,
        requestId: request_id.clone(),
    };
    write
        .lock()
        .await
        .send(Message::Text(serde_json::to_string(&env).unwrap()))
        .await
        .map_err(|e| e.to_string())
}

async fn handle_model_pull(
    envelope: &WsEnvelope,
    write: &SharedRelayWrite,
) -> Result<(), String> {
    let model = envelope
        .payload
        .get("model")
        .and_then(|m| m.as_str())
        .unwrap_or("");
    if model.is_empty() {
        return send_ws_response(
            write,
            "model.pull.error",
            serde_json::json!({ "message": "Modèle requis" }),
            &envelope.requestId,
        )
        .await;
    }
    let _ = ensure_ollama_running(None).await;
    let model_owned = model.to_string();
    let request_id = envelope.requestId.clone();

    let (tx, mut rx) = tokio::sync::mpsc::unbounded_channel::<SetupProgress>();
    let progress_cb: PullProgressCallback = Arc::new(move |p| {
        let _ = tx.send(p);
    });

    let pull_task = tokio::spawn(async move {
        pull_model(&model_owned, None, Some(progress_cb)).await
    });

    while let Some(progress) = rx.recv().await {
        let payload = serde_json::json!({
            "model": progress.current_model,
            "message": progress.message,
            "percent": progress.percent,
            "bytesDownloaded": progress.bytes_downloaded,
            "bytesTotal": progress.bytes_total,
        });
        let _ = send_ws_response(
            write,
            "model.pull.progress",
            payload,
            &request_id,
        )
        .await;
    }

    match pull_task.await.map_err(|e| e.to_string())? {
        Ok(()) => {
            send_ws_response(
                write,
                "model.pull.done",
                serde_json::json!({ "model": model }),
                &request_id,
            )
            .await
        }
        Err(e) => {
            send_ws_response(
                write,
                "model.pull.error",
                serde_json::json!({ "message": e }),
                &request_id,
            )
            .await
        }
    }
}

async fn handle_context_list(
    envelope: &WsEnvelope,
    write: &SharedRelayWrite,
) -> Result<(), String> {
    let _ = init_context_db();
    let bases = list_knowledge_bases().unwrap_or_default();
    send_ws_response(
        write,
        "context.list",
        serde_json::json!({ "bases": bases }),
        &envelope.requestId,
    )
    .await
}

async fn handle_project_list(
    envelope: &WsEnvelope,
    write: &SharedRelayWrite,
) -> Result<(), String> {
    let _ = init_context_db();
    let active_id = get_active_project_id();
    let projects = list_projects(active_id.as_deref()).unwrap_or_default();
    send_ws_response(
        write,
        "project.list",
        serde_json::json!({
            "projects": projects,
            "activeProjectId": active_id,
        }),
        &envelope.requestId,
    )
    .await
}

async fn handle_project_open(
    envelope: &WsEnvelope,
    write: &SharedRelayWrite,
) -> Result<(), String> {
    let _ = init_context_db();
    let id = envelope
        .payload
        .get("id")
        .and_then(|v| v.as_str())
        .unwrap_or("");
    if id.is_empty() {
        return send_ws_response(
            write,
            "project.error",
            serde_json::json!({ "message": "ID projet requis" }),
            &envelope.requestId,
        )
        .await;
    }
    match open_project(id) {
        Ok((project, kbase_ids)) => {
            send_ws_response(
                write,
                "project.opened",
                serde_json::json!({
                    "project": project,
                    "knowledgeBaseIds": kbase_ids,
                }),
                &envelope.requestId,
            )
            .await
        }
        Err(e) => {
            send_ws_response(
                write,
                "project.error",
                serde_json::json!({ "message": e }),
                &envelope.requestId,
            )
            .await
        }
    }
}

async fn handle_context_create(
    envelope: &WsEnvelope,
    write: &SharedRelayWrite,
) -> Result<(), String> {
    let _ = init_context_db();
    let _ = ensure_embedding_model(None).await;
    let name = envelope
        .payload
        .get("name")
        .and_then(|n| n.as_str())
        .unwrap_or("Nouvelle base");
    let description = envelope
        .payload
        .get("description")
        .and_then(|d| d.as_str())
        .unwrap_or("");
    match create_knowledge_base(name, description, &context_limits()) {
        Ok(kb) => {
            send_ws_response(
                write,
                "context.created",
                serde_json::json!({ "base": kb }),
                &envelope.requestId,
            )
            .await
        }
        Err(e) => {
            send_ws_response(
                write,
                "context.error",
                serde_json::json!({ "message": e }),
                &envelope.requestId,
            )
            .await
        }
    }
}

async fn handle_context_delete(
    envelope: &WsEnvelope,
    write: &SharedRelayWrite,
) -> Result<(), String> {
    let kb_id = envelope
        .payload
        .get("id")
        .and_then(|id| id.as_str())
        .unwrap_or("");
    let doc_id = envelope.payload.get("documentId").and_then(|id| id.as_str());
    let result = if let Some(doc) = doc_id {
        delete_document(doc)
    } else if !kb_id.is_empty() {
        delete_knowledge_base(kb_id)
    } else {
        Err("ID requis".into())
    };
    match result {
        Ok(()) => {
            send_ws_response(
                write,
                "context.deleted",
                serde_json::json!({}),
                &envelope.requestId,
            )
            .await
        }
        Err(e) => {
            send_ws_response(
                write,
                "context.error",
                serde_json::json!({ "message": e }),
                &envelope.requestId,
            )
            .await
        }
    }
}

async fn handle_context_status(
    envelope: &WsEnvelope,
    write: &SharedRelayWrite,
) -> Result<(), String> {
    let kb_id = envelope
        .payload
        .get("knowledgeBaseId")
        .and_then(|id| id.as_str())
        .unwrap_or("");
    let docs = list_documents(kb_id).unwrap_or_default();
    let links = list_context_links(kb_id).unwrap_or_default();
    send_ws_response(
        write,
        "context.status",
        serde_json::json!({ "documents": docs, "links": links }),
        &envelope.requestId,
    )
    .await
}

async fn handle_context_upload(
    envelope: &WsEnvelope,
    write: &SharedRelayWrite,
) -> Result<(), String> {
    let _ = init_context_db();
    let _ = ensure_embedding_model(None).await;
    let kb_id = envelope
        .payload
        .get("knowledgeBaseId")
        .and_then(|id| id.as_str())
        .unwrap_or("");
    let filename = envelope
        .payload
        .get("filename")
        .and_then(|f| f.as_str())
        .unwrap_or("document.txt");
    let data_b64 = envelope
        .payload
        .get("data")
        .and_then(|d| d.as_str())
        .unwrap_or("");
    if kb_id.is_empty() || data_b64.is_empty() {
        return send_ws_response(
            write,
            "context.error",
            serde_json::json!({ "message": "knowledgeBaseId et data requis" }),
            &envelope.requestId,
        )
        .await;
    }
    let data = base64::Engine::decode(
        &base64::engine::general_purpose::STANDARD,
        data_b64,
    )
    .map_err(|e| e.to_string())?;
    let limits = context_limits();
    send_ws_response(
        write,
        "context.upload.progress",
        serde_json::json!({ "percent": 10, "message": "Réception du fichier…" }),
        &envelope.requestId,
    )
    .await?;
    send_ws_response(
        write,
        "context.upload.progress",
        serde_json::json!({ "percent": 40, "message": "Extraction et indexation…" }),
        &envelope.requestId,
    )
    .await?;
    match ingest_document(kb_id, filename, &data, &limits).await {
        Ok(doc_id) => {
            send_ws_response(
                write,
                "context.upload.progress",
                serde_json::json!({ "percent": 100, "message": "Terminé" }),
                &envelope.requestId,
            )
            .await?;
            send_ws_response(
                write,
                "context.upload.done",
                serde_json::json!({ "documentId": doc_id }),
                &envelope.requestId,
            )
            .await
        }
        Err(e) => {
            send_ws_response(
                write,
                "context.error",
                serde_json::json!({ "message": e }),
                &envelope.requestId,
            )
            .await
        }
    }
}

async fn handle_mcp_list(
    envelope: &WsEnvelope,
    write: &SharedRelayWrite,
) -> Result<(), String> {
    let servers = list_servers();
    send_ws_response(
        write,
        "mcp.servers",
        serde_json::json!({ "servers": servers }),
        &envelope.requestId,
    )
    .await
}

async fn handle_mcp_tools(
    envelope: &WsEnvelope,
    write: &SharedRelayWrite,
) -> Result<(), String> {
    match list_all_tools() {
        Ok(tools) => {
            send_ws_response(
                write,
                "mcp.tools",
                serde_json::json!({ "tools": tools }),
                &envelope.requestId,
            )
            .await
        }
        Err(message) => {
            send_ws_response(
                write,
                "mcp.error",
                serde_json::json!({ "message": message }),
                &envelope.requestId,
            )
            .await
        }
    }
}

async fn handle_mcp_call(
    envelope: &WsEnvelope,
    write: &SharedRelayWrite,
) -> Result<(), String> {
    let qualified_name = envelope
        .payload
        .get("qualifiedName")
        .and_then(|v| v.as_str())
        .unwrap_or("")
        .trim()
        .to_string();
    if qualified_name.is_empty() {
        return send_ws_response(
            write,
            "mcp.error",
            serde_json::json!({ "message": "qualifiedName requis" }),
            &envelope.requestId,
        )
        .await;
    }

    let arguments = envelope
        .payload
        .get("arguments")
        .cloned()
        .unwrap_or_else(|| serde_json::json!({}));
    let context_ids: Vec<String> = envelope
        .payload
        .get("contextIds")
        .and_then(|v| v.as_array())
        .map(|arr| {
            arr.iter()
                .filter_map(|id| id.as_str().map(String::from))
                .collect()
        })
        .unwrap_or_default();

    match call_mcp_tool(&qualified_name, &arguments, &context_ids).await {
        Ok(result) => {
            send_ws_response(
                write,
                "mcp.result",
                serde_json::json!({ "qualifiedName": qualified_name, "result": result }),
                &envelope.requestId,
            )
            .await
        }
        Err(message) => {
            send_ws_response(
                write,
                "mcp.error",
                serde_json::json!({ "message": message }),
                &envelope.requestId,
            )
            .await
        }
    }
}

async fn handle_job_start(
    envelope: &WsEnvelope,
    write: &SharedRelayWrite,
) -> Result<(), String> {
    match crate::jobs::parse_job_start_payload(&envelope.payload) {
        Ok(kind) => {
            let job_id = crate::jobs::submit_job(kind);
            send_ws_response(
                write,
                "job.progress",
                serde_json::json!({
                    "jobId": job_id,
                    "status": "queued",
                    "message": "Tâche en file d'attente",
                    "progress": 0,
                }),
                &envelope.requestId,
            )
            .await
        }
        Err(e) => {
            send_ws_response(
                write,
                "job.error",
                serde_json::json!({ "message": e }),
                &envelope.requestId,
            )
            .await
        }
    }
}

fn handle_job_cancel(envelope: &WsEnvelope) {
    if let Some(job_id) = envelope.payload.get("jobId").and_then(|v| v.as_str()) {
        crate::jobs::cancel_job(job_id);
        return;
    }
    if let Some(job_id) = envelope.requestId.as_deref() {
        crate::jobs::cancel_job(job_id);
    }
}

async fn handle_job_list(
    envelope: &WsEnvelope,
    write: &SharedRelayWrite,
) -> Result<(), String> {
    let jobs = crate::jobs::list_jobs();
    send_ws_response(
        write,
        "job.status",
        serde_json::json!({ "jobs": jobs }),
        &envelope.requestId,
    )
    .await
}

async fn handle_playbook_list(
    envelope: &WsEnvelope,
    write: &SharedRelayWrite,
) -> Result<(), String> {
    let items = playbooks::list_playbooks();
    send_ws_response(
        write,
        "playbook.list",
        serde_json::json!({ "playbooks": items }),
        &envelope.requestId,
    )
    .await
}

async fn handle_playbook_run(
    envelope: &WsEnvelope,
    write: &SharedRelayWrite,
) -> Result<(), String> {
    if !session_started() {
        return send_chat_error(
            write,
            envelope,
            "Ce PC est déjà utilisé par un autre onglet ou une autre session de chat.",
        )
        .await;
    }

    let _ = send_relay_host_status(write).await;
    CHAT_CANCEL.store(false, Ordering::SeqCst);
    if let Ok(mut active) = ACTIVE_CHAT_REQUEST.lock() {
        *active = envelope.requestId.clone();
    }

    let result = handle_playbook_run_inner(envelope, write).await;
    if let Err(ref message) = result {
        let _ = send_chat_error(write, envelope, message).await;
    } else {
        let _ = send_chat_done(write, &envelope.requestId).await;
    }

    if let Ok(mut active) = ACTIVE_CHAT_REQUEST.lock() {
        *active = None;
    }
    CHAT_CANCEL.store(false, Ordering::SeqCst);
    session_ended();
    Ok(())
}

async fn handle_playbook_run_inner(
    envelope: &WsEnvelope,
    write: &SharedRelayWrite,
) -> Result<(), String> {
    let _ = send_chat_delta(
        write,
        &envelope.requestId,
        "Chargement du modèle sur votre PC…\n\n",
    )
    .await;

    ensure_ollama_running(None).await?;

    let payload = &envelope.payload;
    let playbook_id = payload
        .get("playbookId")
        .and_then(|v| v.as_str())
        .unwrap_or("");
    if playbook_id.is_empty() {
        return Err("playbookId requis".into());
    }

    let model = payload
        .get("model")
        .and_then(|m| m.as_str())
        .filter(|m| !m.is_empty())
        .unwrap_or(resolved_default_model().as_str())
        .to_string();

    if !is_available_model(&model) {
        let hint = if is_cloud_model(&model) {
            "Configurez la clé API et activez le fournisseur dans l'app Host."
        } else {
            "Téléchargez-le depuis le gestionnaire de modèles."
        };
        return Err(format!("Le modèle « {model} » n'est pas disponible. {hint}"));
    }

    if !is_cloud_model(&model) {
        ensure_ollama_running(None).await?;
    }

    let context_ids: Vec<String> = payload
        .get("contextIds")
        .and_then(|v| v.as_array())
        .map(|arr| {
            arr.iter()
                .filter_map(|v| v.as_str().map(String::from))
                .collect()
        })
        .unwrap_or_default();

    let link_id = payload
        .get("linkId")
        .and_then(|v| v.as_str())
        .map(String::from);
    let path = payload
        .get("path")
        .and_then(|v| v.as_str())
        .map(String::from);

    let (delta_tx, mut delta_rx) = tokio::sync::mpsc::unbounded_channel::<String>();
    let write_pump = write.clone();
    let request_id = envelope.requestId.clone();
    let pump = tokio::spawn(async move {
        while let Some(chunk) = delta_rx.recv().await {
            if send_chat_delta(&write_pump, &request_id, &chunk)
                .await
                .is_err()
            {
                break;
            }
        }
    });

    let is_cancelled = Arc::new(|| CHAT_CANCEL.load(Ordering::SeqCst));
    let run_result = playbooks::run_playbook(
        PlaybookRunParams {
            playbook_id: playbook_id.to_string(),
            context_ids,
            link_id,
            path,
            model,
        },
        is_cancelled,
        delta_tx,
    )
    .await;

    let _ = pump.await;
    run_result
}

async fn handle_terminal_exec(
    envelope: &WsEnvelope,
    write: &SharedRelayWrite,
) -> Result<(), String> {
    let program = envelope
        .payload
        .get("program")
        .and_then(|p| p.as_str())
        .unwrap_or("")
        .trim()
        .to_string();
    let args: Vec<String> = envelope
        .payload
        .get("args")
        .and_then(|a| a.as_array())
        .map(|arr| {
            arr.iter()
                .filter_map(|v| v.as_str().map(String::from))
                .collect()
        })
        .unwrap_or_default();
    let cwd = envelope
        .payload
        .get("cwd")
        .and_then(|c| c.as_str())
        .map(String::from);
    let timeout_secs = clamp_timeout_secs(
        envelope
            .payload
            .get("timeoutSecs")
            .and_then(|t| t.as_u64()),
    );

    let cmd = AllowlistedCommand {
        program,
        args,
        cwd,
    };

    let request_id = envelope.requestId.clone();
    let write_output = write.clone();

    let result = run_allowlisted_command(&cmd, timeout_secs, |stream, data| {
        let stream_name = match stream {
            OutputStream::Stdout => "stdout",
            OutputStream::Stderr => "stderr",
        };
        let write_task = write_output.clone();
        let request_id = request_id.clone();
        let data = data.to_string();
        tauri::async_runtime::spawn(async move {
            let _ = send_ws_response(
                &write_task,
                "terminal.output",
                serde_json::json!({ "stream": stream_name, "data": data }),
                &request_id,
            )
            .await;
        });
    })
    .await;

    match result {
        Ok(exit_code) => {
            send_ws_response(
                write,
                "terminal.done",
                serde_json::json!({ "exitCode": exit_code }),
                &envelope.requestId,
            )
            .await
        }
        Err(message) => {
            send_ws_response(
                write,
                "terminal.error",
                serde_json::json!({ "message": message }),
                &envelope.requestId,
            )
            .await
        }
    }
}

async fn handle_context_chunks(
    envelope: &WsEnvelope,
    write: &SharedRelayWrite,
) -> Result<(), String> {
    let doc_id = envelope
        .payload
        .get("documentId")
        .and_then(|id| id.as_str())
        .unwrap_or("");
    let chunks = list_chunks(doc_id).unwrap_or_default();
    send_ws_response(
        write,
        "context.chunks",
        serde_json::json!({ "chunks": chunks }),
        &envelope.requestId,
    )
    .await
}

async fn handle_pr_review(
    envelope: &WsEnvelope,
    write: &SharedRelayWrite,
) -> Result<(), String> {
    let payload = &envelope.payload;
    let input = PrReviewInput {
        diff: payload.get("diff").and_then(|v| v.as_str()).map(String::from),
        repo_path: payload
            .get("repoPath")
            .and_then(|v| v.as_str())
            .map(String::from),
        link_id: payload
            .get("linkId")
            .and_then(|v| v.as_str())
            .map(String::from),
        diff_mode: payload
            .get("diffMode")
            .and_then(|v| v.as_str())
            .map(String::from),
        pr_number: payload
            .get("prNumber")
            .and_then(|v| v.as_u64())
            .map(|n| n as u32),
        model: payload
            .get("model")
            .and_then(|v| v.as_str())
            .map(String::from),
    };

    match review_git_diff(input).await {
        Ok(result) => {
            send_ws_response(
                write,
                "pr.review.done",
                serde_json::to_value(result).unwrap_or_default(),
                &envelope.requestId,
            )
            .await
        }
        Err(e) => {
            send_ws_response(
                write,
                "pr.review.error",
                serde_json::json!({ "message": e }),
                &envelope.requestId,
            )
            .await
        }
    }
}

async fn handle_inline_edit_preview(
    envelope: &WsEnvelope,
    write: &SharedRelayWrite,
) -> Result<(), String> {
    let doc_id = envelope
        .payload
        .get("documentId")
        .and_then(|id| id.as_str())
        .unwrap_or("");
    let selected = envelope
        .payload
        .get("selectedText")
        .and_then(|v| v.as_str())
        .unwrap_or("");
    let instruction = envelope
        .payload
        .get("instruction")
        .and_then(|v| v.as_str())
        .unwrap_or("");
    let model = envelope.payload.get("model").and_then(|v| v.as_str());

    if doc_id.is_empty() || selected.is_empty() || instruction.is_empty() {
        return send_ws_response(
            write,
            "inline_edit.error",
            serde_json::json!({ "message": "documentId, selectedText et instruction requis" }),
            &envelope.requestId,
        )
        .await;
    }

    match preview_inline_edit(doc_id, selected, instruction, model).await {
        Ok(preview) => {
            send_ws_response(
                write,
                "inline_edit.previewed",
                serde_json::to_value(preview).unwrap_or_default(),
                &envelope.requestId,
            )
            .await
        }
        Err(e) => {
            send_ws_response(
                write,
                "inline_edit.error",
                serde_json::json!({ "message": e }),
                &envelope.requestId,
            )
            .await
        }
    }
}

async fn handle_inline_edit_apply(
    envelope: &WsEnvelope,
    write: &SharedRelayWrite,
) -> Result<(), String> {
    let doc_id = envelope
        .payload
        .get("documentId")
        .and_then(|id| id.as_str())
        .unwrap_or("");
    let selected = envelope
        .payload
        .get("selectedText")
        .and_then(|v| v.as_str())
        .unwrap_or("");
    let proposed = envelope
        .payload
        .get("proposedText")
        .and_then(|v| v.as_str())
        .unwrap_or("");

    if doc_id.is_empty() || selected.is_empty() {
        return send_ws_response(
            write,
            "inline_edit.error",
            serde_json::json!({ "message": "documentId et selectedText requis" }),
            &envelope.requestId,
        )
        .await;
    }

    match apply_inline_edit(doc_id, selected, proposed).await {
        Ok(()) => {
            send_ws_response(
                write,
                "inline_edit.applied",
                serde_json::json!({ "documentId": doc_id }),
                &envelope.requestId,
            )
            .await
        }
        Err(e) => {
            send_ws_response(
                write,
                "inline_edit.error",
                serde_json::json!({ "message": e }),
                &envelope.requestId,
            )
            .await
        }
    }
}

async fn handle_history_list(
    envelope: &WsEnvelope,
    write: &SharedRelayWrite,
) -> Result<(), String> {
    let _ = init_history_db();
    let limit = envelope
        .payload
        .get("limit")
        .and_then(|v| v.as_u64())
        .unwrap_or(50) as u32;
    let threads = list_threads(limit).unwrap_or_default();
    send_ws_response(
        write,
        "history.list",
        serde_json::json!({ "threads": threads }),
        &envelope.requestId,
    )
    .await
}

async fn handle_history_get(
    envelope: &WsEnvelope,
    write: &SharedRelayWrite,
) -> Result<(), String> {
    let _ = init_history_db();
    let thread_id = envelope
        .payload
        .get("threadId")
        .and_then(|id| id.as_str())
        .unwrap_or("");
    if thread_id.is_empty() {
        return send_ws_response(
            write,
            "history.error",
            serde_json::json!({ "message": "threadId requis" }),
            &envelope.requestId,
        )
        .await;
    }
    match get_thread(thread_id) {
        Ok((thread, messages)) => {
            send_ws_response(
                write,
                "history.get",
                serde_json::json!({ "thread": thread, "messages": messages }),
                &envelope.requestId,
            )
            .await
        }
        Err(e) => {
            send_ws_response(
                write,
                "history.error",
                serde_json::json!({ "message": e }),
                &envelope.requestId,
            )
            .await
        }
    }
}

async fn handle_history_save(
    envelope: &WsEnvelope,
    write: &SharedRelayWrite,
) -> Result<(), String> {
    let _ = init_history_db();
    let payload = &envelope.payload;
    let thread_id = payload.get("threadId").and_then(|id| id.as_str());
    let title = payload.get("title").and_then(|t| t.as_str());
    let model = payload.get("model").and_then(|m| m.as_str());
    let context_ids: Vec<String> = payload
        .get("contextIds")
        .and_then(|v| v.as_array())
        .map(|arr| {
            arr.iter()
                .filter_map(|v| v.as_str().map(String::from))
                .collect()
        })
        .unwrap_or_default();
    let raw_messages = payload
        .get("messages")
        .and_then(|m| m.as_array())
        .cloned()
        .unwrap_or_default();
    let pairs: Vec<(String, String)> = raw_messages
        .iter()
        .filter_map(|m| {
            let role = m.get("role")?.as_str()?.to_string();
            let content = m.get("content")?.as_str()?.to_string();
            if role == "system" {
                return None;
            }
            Some((role, content))
        })
        .collect();

    match save_thread(thread_id, title, model, &context_ids, &pairs) {
        Ok(id) => {
            send_ws_response(
                write,
                "history.saved",
                serde_json::json!({ "threadId": id }),
                &envelope.requestId,
            )
            .await
        }
        Err(e) => {
            send_ws_response(
                write,
                "history.error",
                serde_json::json!({ "message": e }),
                &envelope.requestId,
            )
            .await
        }
    }
}

async fn handle_history_delete(
    envelope: &WsEnvelope,
    write: &SharedRelayWrite,
) -> Result<(), String> {
    let _ = init_history_db();
    let thread_id = envelope
        .payload
        .get("threadId")
        .and_then(|id| id.as_str())
        .unwrap_or("");
    if thread_id.is_empty() {
        return send_ws_response(
            write,
            "history.error",
            serde_json::json!({ "message": "threadId requis" }),
            &envelope.requestId,
        )
        .await;
    }
    match delete_thread(thread_id) {
        Ok(()) => {
            send_ws_response(
                write,
                "history.deleted",
                serde_json::json!({}),
                &envelope.requestId,
            )
            .await
        }
        Err(e) => {
            send_ws_response(
                write,
                "history.error",
                serde_json::json!({ "message": e }),
                &envelope.requestId,
            )
            .await
        }
    }
}

async fn handle_history_fork(
    envelope: &WsEnvelope,
    write: &SharedRelayWrite,
) -> Result<(), String> {
    let _ = init_history_db();
    let payload = &envelope.payload;
    let parent_thread_id = payload
        .get("parentThreadId")
        .and_then(|id| id.as_str())
        .unwrap_or("");
    let fork_at_index = payload
        .get("forkAtIndex")
        .and_then(|v| v.as_u64())
        .unwrap_or(0) as u32;
    if parent_thread_id.is_empty() {
        return send_ws_response(
            write,
            "history.error",
            serde_json::json!({ "message": "parentThreadId requis" }),
            &envelope.requestId,
        )
        .await;
    }
    let model = payload.get("model").and_then(|m| m.as_str());
    let context_ids: Vec<String> = payload
        .get("contextIds")
        .and_then(|v| v.as_array())
        .map(|arr| {
            arr.iter()
                .filter_map(|v| v.as_str().map(String::from))
                .collect()
        })
        .unwrap_or_default();

    match fork_thread(parent_thread_id, fork_at_index, model, &context_ids) {
        Ok(thread_id) => {
            send_ws_response(
                write,
                "history.forked",
                serde_json::json!({ "threadId": thread_id }),
                &envelope.requestId,
            )
            .await
        }
        Err(e) => {
            send_ws_response(
                write,
                "history.error",
                serde_json::json!({ "message": e }),
                &envelope.requestId,
            )
            .await
        }
    }
}

async fn handle_history_branches(
    envelope: &WsEnvelope,
    write: &SharedRelayWrite,
) -> Result<(), String> {
    let _ = init_history_db();
    let root_thread_id = envelope
        .payload
        .get("rootThreadId")
        .and_then(|id| id.as_str())
        .unwrap_or("");
    if root_thread_id.is_empty() {
        return send_ws_response(
            write,
            "history.error",
            serde_json::json!({ "message": "rootThreadId requis" }),
            &envelope.requestId,
        )
        .await;
    }
    let branches = list_thread_branches(root_thread_id).unwrap_or_default();
    send_ws_response(
        write,
        "history.branches",
        serde_json::json!({ "threads": branches }),
        &envelope.requestId,
    )
    .await
}

async fn handle_memory_list(
    envelope: &WsEnvelope,
    write: &SharedRelayWrite,
) -> Result<(), String> {
    let _ = init_context_db();
    match memory_state() {
        Ok(state) => {
            send_ws_response(
                write,
                "memory.list",
                serde_json::to_value(state).unwrap_or_default(),
                &envelope.requestId,
            )
            .await
        }
        Err(e) => {
            send_ws_response(
                write,
                "memory.error",
                serde_json::json!({ "message": e }),
                &envelope.requestId,
            )
            .await
        }
    }
}

async fn handle_memory_add(
    envelope: &WsEnvelope,
    write: &SharedRelayWrite,
) -> Result<(), String> {
    let _ = init_context_db();
    let content = envelope
        .payload
        .get("content")
        .and_then(|c| c.as_str())
        .unwrap_or("");
    match add_fact(content) {
        Ok(fact) => {
            send_ws_response(
                write,
                "memory.added",
                serde_json::json!({ "fact": fact }),
                &envelope.requestId,
            )
            .await
        }
        Err(e) => {
            send_ws_response(
                write,
                "memory.error",
                serde_json::json!({ "message": e }),
                &envelope.requestId,
            )
            .await
        }
    }
}

async fn handle_memory_delete(
    envelope: &WsEnvelope,
    write: &SharedRelayWrite,
) -> Result<(), String> {
    let _ = init_context_db();
    let id = envelope
        .payload
        .get("id")
        .and_then(|v| v.as_str())
        .unwrap_or("");
    if id.is_empty() {
        return send_ws_response(
            write,
            "memory.error",
            serde_json::json!({ "message": "id requis" }),
            &envelope.requestId,
        )
        .await;
    }
    match delete_fact(id) {
        Ok(()) => {
            send_ws_response(
                write,
                "memory.deleted",
                serde_json::json!({}),
                &envelope.requestId,
            )
            .await
        }
        Err(e) => {
            send_ws_response(
                write,
                "memory.error",
                serde_json::json!({ "message": e }),
                &envelope.requestId,
            )
            .await
        }
    }
}

async fn handle_memory_set_enabled(
    envelope: &WsEnvelope,
    write: &SharedRelayWrite,
) -> Result<(), String> {
    let enabled = envelope
        .payload
        .get("enabled")
        .and_then(|v| v.as_bool())
        .unwrap_or(false);
    match set_user_memory_enabled(enabled) {
        Ok(()) => {
            send_ws_response(
                write,
                "memory.updated",
                serde_json::json!({ "enabled": enabled }),
                &envelope.requestId,
            )
            .await
        }
        Err(e) => {
            send_ws_response(
                write,
                "memory.error",
                serde_json::json!({ "message": e }),
                &envelope.requestId,
            )
            .await
        }
    }
}
