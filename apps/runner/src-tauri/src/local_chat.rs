use crate::context::build_rag_context;
use crate::local_metrics;
use crate::ollama::{ensure_ollama_running, model_exists, stream_chat};
use futures_util::StreamExt;
use serde::Serialize;
use std::sync::atomic::{AtomicBool, Ordering};
use tauri::{AppHandle, Emitter};

static LOCAL_CHAT_CANCEL: AtomicBool = AtomicBool::new(false);

pub fn cancel_local_chat() {
    LOCAL_CHAT_CANCEL.store(true, Ordering::SeqCst);
}

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct LocalChatDelta {
    pub content: String,
}

#[derive(Debug, Clone, Serialize)]
pub struct LocalChatError {
    pub message: String,
}

pub async fn run_local_chat(
    app: AppHandle,
    model: String,
    messages: Vec<serde_json::Value>,
    context_ids: Vec<String>,
) -> Result<(), String> {
    LOCAL_CHAT_CANCEL.store(false, Ordering::SeqCst);

    ensure_ollama_running(Some(&app)).await?;

    if !model_exists(&model) {
        let message = format!(
            "Le modèle « {model} » n'est pas installé sur ce PC. Téléchargez-le depuis le gestionnaire de modèles."
        );
        let _ = app.emit("local-chat-error", LocalChatError { message });
        return Ok(());
    }

    let mut messages: Vec<serde_json::Value> = messages.into_iter().take(20).collect();
    crate::assistant_output::ensure_output_format_hint(&mut messages);

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

    local_metrics::begin_request(&model);
    let response = stream_chat(&model, &messages).await?;
    let mut stream = response.bytes_stream();

    let finish = |app: &AppHandle| {
        local_metrics::finish_request();
        let _ = app.emit("local-chat-done", ());
    };

    while let Some(chunk) = stream.next().await {
        if LOCAL_CHAT_CANCEL.load(Ordering::SeqCst) {
            finish(&app);
            return Ok(());
        }

        let chunk = chunk.map_err(|e| e.to_string())?;
        let text = String::from_utf8_lossy(&chunk);

        for line in text.lines() {
            if LOCAL_CHAT_CANCEL.load(Ordering::SeqCst) {
                finish(&app);
                return Ok(());
            }

            if !line.starts_with("data: ") {
                continue;
            }
            let data = &line[6..];
            if data == "[DONE]" {
                finish(&app);
                return Ok(());
            }
            if let Ok(json) = serde_json::from_str::<serde_json::Value>(data) {
                local_metrics::merge_stream_chunk(&json);
                if let Some(content) = json["choices"][0]["delta"]["content"].as_str() {
                    let _ = app.emit(
                        "local-chat-delta",
                        LocalChatDelta {
                            content: content.to_string(),
                        },
                    );
                }
            }
        }
    }

    finish(&app);
    Ok(())
}
