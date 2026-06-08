use crate::context::{
    build_rag_context, create_knowledge_base, delete_document, delete_knowledge_base,
    get_context_summary, ingest_document, list_chunks, list_documents, list_knowledge_bases,
    ContextLimits, init_context_db,
};
use crate::credentials::{get_credentials, resolve_supabase_url, StoredCredentials};
use crate::host_status::{
    self, session_ended, session_started, set_heartbeat_error, set_heartbeat_ok,
    set_relay_connected, set_relay_error,
};
use crate::ollama::{
    default_model, disk_free_gb_for_models_dir, ensure_embedding_model, ensure_ollama_running,
    list_installed_models, model_exists, pull_model, stream_chat, PullProgressCallback,
    SetupProgress,
};
use crate::settings::{resolved_context_limits, resolved_default_model};
use futures_util::{SinkExt, StreamExt};
use serde::{Deserialize, Serialize};
use std::sync::atomic::{AtomicBool, Ordering};
use std::sync::{Arc, Mutex};
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

    let status = if host_status::is_session_active() {
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
            "installed_models": list_installed_models(),
            "disk_free_gb": disk_free_gb_for_models_dir(),
            "context_summary": get_context_summary(),
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
    if host_status::is_session_active() {
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
                if let Message::Text(text) = msg {
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
                            _ => {}
                        }
                    }
                }
            }
            _ = status_tick.tick() => {
                let _ = send_relay_host_status(&write).await;
            }
        }
    }

    host_status::set_web_viewers(0);
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
    let _ = send_chat_delta(
        write,
        &envelope.requestId,
        "Chargement du modèle sur votre PC…\n\n",
    )
    .await;

    ensure_ollama_running(None).await?;

    let payload = &envelope.payload;
    let fallback_model = default_model();
    let model = payload
        .get("model")
        .and_then(|m| m.as_str())
        .unwrap_or(fallback_model.as_str());
    let messages = payload
        .get("messages")
        .and_then(|m| m.as_array())
        .cloned()
        .unwrap_or_default();

    let mut messages: Vec<serde_json::Value> = messages.into_iter().take(20).collect();

    if !model_exists(model) {
        return send_chat_error(
            write,
            envelope,
            &format!(
                "Le modèle « {model} » n'est pas installé sur ce PC. Téléchargez-le depuis le gestionnaire de modèles."
            ),
        )
        .await;
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

    if !context_ids.is_empty() {
        let last_user = messages
            .iter()
            .rev()
            .find(|m| m.get("role").and_then(|r| r.as_str()) == Some("user"))
            .and_then(|m| m.get("content").and_then(|c| c.as_str()))
            .unwrap_or("");
        if let Ok(Some(rag)) = build_rag_context(&context_ids, last_user).await {
            messages.insert(
                0,
                serde_json::json!({ "role": "system", "content": rag }),
            );
        }
    }

    let response = stream_chat(model, &messages).await?;
    let mut stream = response.bytes_stream();

    while let Some(chunk) = stream.next().await {
        if CHAT_CANCEL.load(Ordering::SeqCst) {
            return send_chat_done(write, &envelope.requestId).await;
        }

        let chunk = chunk.map_err(|e| e.to_string())?;
        let text = String::from_utf8_lossy(&chunk);

        for line in text.lines() {
            if CHAT_CANCEL.load(Ordering::SeqCst) {
                return send_chat_done(write, &envelope.requestId).await;
            }

            if !line.starts_with("data: ") {
                continue;
            }
            let data = &line[6..];
            if data == "[DONE]" {
                return send_chat_done(write, &envelope.requestId).await;
            }
            if let Ok(json) = serde_json::from_str::<serde_json::Value>(data) {
                if let Some(content) = json["choices"][0]["delta"]["content"].as_str() {
                    let _ = send_chat_delta(write, &envelope.requestId, content).await;
                }
            }
        }
    }

    send_chat_done(write, &envelope.requestId).await
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
    send_ws_response(
        write,
        "context.status",
        serde_json::json!({ "documents": docs }),
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
    match ingest_document(kb_id, filename, &data, &limits).await {
        Ok(doc_id) => {
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
