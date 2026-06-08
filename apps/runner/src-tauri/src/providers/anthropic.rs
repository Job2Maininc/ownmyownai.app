use futures_util::StreamExt;
use std::sync::atomic::{AtomicBool, Ordering};
use std::time::Duration;

const ANTHROPIC_MESSAGES_URL: &str = "https://api.anthropic.com/v1/messages";
const ANTHROPIC_VERSION: &str = "2023-06-01";

fn split_messages(
    messages: &[serde_json::Value],
) -> (Option<String>, Vec<serde_json::Value>) {
    let mut system_parts: Vec<String> = Vec::new();
    let mut out: Vec<serde_json::Value> = Vec::new();

    for msg in messages {
        let role = msg
            .get("role")
            .and_then(|r| r.as_str())
            .unwrap_or("user");
        let content = msg
            .get("content")
            .and_then(|c| c.as_str())
            .unwrap_or("");
        if role == "system" {
            if !content.is_empty() {
                system_parts.push(content.to_string());
            }
        } else {
            let anthropic_role = if role == "assistant" {
                "assistant"
            } else {
                "user"
            };
            out.push(serde_json::json!({
                "role": anthropic_role,
                "content": content,
            }));
        }
    }

    let system = if system_parts.is_empty() {
        None
    } else {
        Some(system_parts.join("\n\n"))
    };
    (system, out)
}

pub async fn stream_chat(
    api_key: &str,
    model: &str,
    messages: &[serde_json::Value],
) -> Result<reqwest::Response, String> {
    let client = reqwest::Client::builder()
        .connect_timeout(Duration::from_secs(15))
        .timeout(Duration::from_secs(600))
        .build()
        .map_err(|e| e.to_string())?;

    let (system, anthropic_messages) = split_messages(messages);
    let mut body = serde_json::json!({
        "model": model,
        "max_tokens": 4096,
        "messages": anthropic_messages,
        "stream": true,
    });
    if let Some(sys) = system {
        body["system"] = serde_json::Value::String(sys);
    }

    let response = client
        .post(ANTHROPIC_MESSAGES_URL)
        .header("x-api-key", api_key)
        .header("anthropic-version", ANTHROPIC_VERSION)
        .header("content-type", "application/json")
        .json(&body)
        .send()
        .await
        .map_err(|e| {
            if e.is_connect() {
                "Impossible de joindre l'API Anthropic. Vérifiez votre connexion.".to_string()
            } else if e.is_timeout() {
                "L'API Anthropic met trop de temps à répondre.".to_string()
            } else {
                e.to_string()
            }
        })?;

    if !response.status().is_success() {
        let status = response.status();
        let detail = response.text().await.unwrap_or_default();
        return Err(format!(
            "Anthropic a renvoyé une erreur ({status}) : {detail}"
        ));
    }

    Ok(response)
}

pub async fn relay_stream<W>(
    client: &reqwest::Client,
    api_key: &str,
    model: &str,
    messages: &[serde_json::Value],
    cancel: &AtomicBool,
    mut on_delta: W,
) -> Result<(), String>
where
    W: FnMut(&str) -> Result<(), String>,
{
    let (system, anthropic_messages) = split_messages(messages);
    let mut body = serde_json::json!({
        "model": model,
        "max_tokens": 4096,
        "messages": anthropic_messages,
        "stream": true,
    });
    if let Some(sys) = system {
        body["system"] = serde_json::Value::String(sys);
    }

    let response = client
        .post(ANTHROPIC_MESSAGES_URL)
        .header("x-api-key", api_key)
        .header("anthropic-version", ANTHROPIC_VERSION)
        .header("content-type", "application/json")
        .json(&body)
        .send()
        .await
        .map_err(|e| e.to_string())?;

    if !response.status().is_success() {
        let status = response.status();
        let detail = response.text().await.unwrap_or_default();
        return Err(format!(
            "Anthropic a renvoyé une erreur ({status}) : {detail}"
        ));
    }

    let mut stream = response.bytes_stream();
    let mut buffer = String::new();

    while let Some(chunk) = stream.next().await {
        if cancel.load(Ordering::SeqCst) {
            return Ok(());
        }
        let chunk = chunk.map_err(|e| e.to_string())?;
        buffer.push_str(&String::from_utf8_lossy(&chunk));

        while let Some(pos) = buffer.find("\n\n") {
            let block = buffer[..pos].to_string();
            buffer = buffer[pos + 2..].to_string();
            for line in block.lines() {
                if cancel.load(Ordering::SeqCst) {
                    return Ok(());
                }
                if let Some(data) = line.strip_prefix("data: ") {
                    if let Ok(json) = serde_json::from_str::<serde_json::Value>(data) {
                        if json.get("type").and_then(|t| t.as_str())
                            == Some("content_block_delta")
                        {
                            if let Some(text) = json["delta"]["text"].as_str() {
                                on_delta(text)?;
                            }
                        }
                    }
                }
            }
        }
    }

    Ok(())
}
