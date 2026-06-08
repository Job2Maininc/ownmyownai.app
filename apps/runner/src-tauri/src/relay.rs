use crate::credentials::{get_credentials, resolve_supabase_url, StoredCredentials};
use crate::host_status::{
    self, session_ended, session_started, set_heartbeat_error, set_heartbeat_ok,
    set_relay_connected, set_relay_error,
};
use crate::ollama::{ensure_ollama_running, stream_chat};
use futures_util::{SinkExt, StreamExt};
use serde::{Deserialize, Serialize};
use std::sync::atomic::{AtomicBool, Ordering};
use tokio::time::{sleep, Duration};
use tokio_tungstenite::{connect_async, tungstenite::Message};

static SERVICES_RUNNING: AtomicBool = AtomicBool::new(false);

pub fn services_running() -> bool {
    SERVICES_RUNNING.load(Ordering::SeqCst)
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
            if let Err(e) = run_relay_loop(&creds_relay, &supabase_url_relay).await {
                eprintln!("Relay error: {e}");
                set_relay_error(e);
            }
            sleep(Duration::from_secs(5)).await;
        }
    });

    tauri::async_runtime::spawn(async move {
        loop {
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

    let res = client
        .post(&url)
        .header("X-Device-Secret", &creds.device_secret)
        .header("X-Host-Id", &creds.host_id)
        .header("Content-Type", "application/json")
        .json(&serde_json::json!({ "status": "online" }))
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
        let msg = msg.map_err(|e| e.to_string())?;
        if let Message::Text(text) = msg {
            if let Ok(envelope) = serde_json::from_str::<WsEnvelope>(&text) {
                if envelope.msg_type == "chat.start" {
                    let _ = handle_chat_start(&envelope, &mut write).await;
                }
            }
        }
    }

    set_relay_connected(false);
    Ok(())
}

async fn handle_chat_start(
    envelope: &WsEnvelope,
    write: &mut futures_util::stream::SplitSink<
        tokio_tungstenite::WebSocketStream<tokio_tungstenite::MaybeTlsStream<tokio::net::TcpStream>>,
        Message,
    >,
) -> Result<(), String> {
    session_started();
    let result = handle_chat_start_inner(envelope, write).await;
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
    let model = payload
        .get("model")
        .and_then(|m| m.as_str())
        .unwrap_or("llama3.2:3b");
    let messages = payload
        .get("messages")
        .and_then(|m| m.as_array())
        .cloned()
        .unwrap_or_default();

    let messages: Vec<serde_json::Value> = messages.into_iter().take(20).collect();

    let response = stream_chat(model, &messages).await?;
    let mut stream = response.bytes_stream();

    while let Some(chunk) = stream.next().await {
        let chunk = chunk.map_err(|e| e.to_string())?;
        let text = String::from_utf8_lossy(&chunk);

        for line in text.lines() {
            if !line.starts_with("data: ") {
                continue;
            }
            let data = &line[6..];
            if data == "[DONE]" {
                let done = WsEnvelope {
                    msg_type: "chat.done".into(),
                    payload: serde_json::json!({}),
                    requestId: envelope.requestId.clone(),
                };
                write
                    .send(Message::Text(serde_json::to_string(&done).unwrap()))
                    .await
                    .map_err(|e| e.to_string())?;
                return Ok(());
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
