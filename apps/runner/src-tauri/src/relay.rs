use crate::credentials::{get_credentials, resolve_supabase_url, StoredCredentials};
use crate::host_status::{
    self, session_ended, session_started, set_heartbeat_error, set_heartbeat_ok,
    set_relay_connected, set_relay_error,
};
use crate::ollama::{default_model, ensure_ollama_running, stream_chat};
use crate::settings::resolved_default_model;
use futures_util::{SinkExt, StreamExt};
use serde::{Deserialize, Serialize};
use std::sync::atomic::{AtomicBool, Ordering};
use std::sync::Mutex;
use tokio::time::{sleep, Duration};
use tokio_tungstenite::{connect_async, tungstenite::Message};

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

#[derive(Debug, Deserialize, Serialize)]
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
        }))
        .send()
        .await
        .map_err(|e| e.to_string())?;

    if !res.status().is_success() {
        return Err(res.text().await.unwrap_or_default());
    }

    Ok(())
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
    let (mut write, mut read) = ws.split();
    set_relay_connected(true);

    while let Some(msg) = read.next().await {
        if SERVICES_STOP.load(Ordering::SeqCst) {
            break;
        }
        let msg = msg.map_err(|e| e.to_string())?;
        if let Message::Text(text) = msg {
            if let Ok(envelope) = serde_json::from_str::<WsEnvelope>(&text) {
                match envelope.msg_type.as_str() {
                    "chat.start" => {
                        let _ = handle_chat_start(&envelope, &mut write).await;
                    }
                    "chat.cancel" => {
                        handle_chat_cancel(&envelope);
                    }
                    _ => {}
                }
            }
        }
    }

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
    write: &mut futures_util::stream::SplitSink<
        tokio_tungstenite::WebSocketStream<tokio_tungstenite::MaybeTlsStream<tokio::net::TcpStream>>,
        Message,
    >,
    envelope: &WsEnvelope,
    message: &str,
) -> Result<(), String> {
    let err = WsEnvelope {
        msg_type: "chat.error".into(),
        payload: serde_json::json!({ "message": message }),
        requestId: envelope.requestId.clone(),
    };
    write
        .send(Message::Text(serde_json::to_string(&err).unwrap()))
        .await
        .map_err(|e| e.to_string())
}

async fn send_chat_done(
    write: &mut futures_util::stream::SplitSink<
        tokio_tungstenite::WebSocketStream<tokio_tungstenite::MaybeTlsStream<tokio::net::TcpStream>>,
        Message,
    >,
    request_id: &Option<String>,
) -> Result<(), String> {
    let done = WsEnvelope {
        msg_type: "chat.done".into(),
        payload: serde_json::json!({}),
        requestId: request_id.clone(),
    };
    write
        .send(Message::Text(serde_json::to_string(&done).unwrap()))
        .await
        .map_err(|e| e.to_string())
}

async fn handle_chat_start(
    envelope: &WsEnvelope,
    write: &mut futures_util::stream::SplitSink<
        tokio_tungstenite::WebSocketStream<tokio_tungstenite::MaybeTlsStream<tokio::net::TcpStream>>,
        Message,
    >,
) -> Result<(), String> {
    if !session_started() {
        return send_chat_error(write, envelope, "Host occupé").await;
    }

    CHAT_CANCEL.store(false, Ordering::SeqCst);
    if let Ok(mut active) = ACTIVE_CHAT_REQUEST.lock() {
        *active = envelope.requestId.clone();
    }

    let result = handle_chat_start_inner(envelope, write).await;

    if let Ok(mut active) = ACTIVE_CHAT_REQUEST.lock() {
        *active = None;
    }
    CHAT_CANCEL.store(false, Ordering::SeqCst);
    session_ended();
    result
}

async fn handle_chat_start_inner(
    envelope: &WsEnvelope,
    write: &mut futures_util::stream::SplitSink<
        tokio_tungstenite::WebSocketStream<tokio_tungstenite::MaybeTlsStream<tokio::net::TcpStream>>,
        Message,
    >,
) -> Result<(), String> {
    let _ = ensure_ollama_running(None).await;

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

    let messages: Vec<serde_json::Value> = messages.into_iter().take(20).collect();

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
                    let delta = WsEnvelope {
                        msg_type: "chat.delta".into(),
                        payload: serde_json::json!({ "content": content }),
                        requestId: envelope.requestId.clone(),
                    };
                    write
                        .send(Message::Text(serde_json::to_string(&delta).unwrap()))
                        .await
                        .map_err(|e| e.to_string())?;
                }
            }
        }
    }

    Ok(())
}
