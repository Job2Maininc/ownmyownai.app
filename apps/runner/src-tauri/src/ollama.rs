use serde::{Deserialize, Serialize};
use std::process::Command;

const OLLAMA_URL: &str = "http://127.0.0.1:11434";

#[derive(Debug, Serialize, Deserialize)]
pub struct OllamaStatus {
    pub installed: bool,
    pub running: bool,
    pub models: Vec<String>,
}

pub fn check_ollama() -> Result<OllamaStatus, String> {
    let installed = Command::new("ollama")
        .arg("--version")
        .output()
        .map(|o| o.status.success())
        .unwrap_or(false);

    let client = reqwest::blocking::Client::builder()
        .timeout(std::time::Duration::from_secs(3))
        .build()
        .map_err(|e| e.to_string())?;

    let running = client
        .get(format!("{OLLAMA_URL}/api/tags"))
        .send()
        .map(|r| r.status().is_success())
        .unwrap_or(false);

    let models = if running {
        #[derive(Deserialize)]
        struct TagsResponse {
            models: Vec<ModelEntry>,
        }
        #[derive(Deserialize)]
        struct ModelEntry {
            name: String,
        }

        client
            .get(format!("{OLLAMA_URL}/api/tags"))
            .send()
            .ok()
            .and_then(|r| r.json::<TagsResponse>().ok())
            .map(|t| t.models.into_iter().map(|m| m.name).collect())
            .unwrap_or_default()
    } else {
        vec![]
    };

    Ok(OllamaStatus {
        installed,
        running,
        models,
    })
}

pub async fn ensure_ollama_running() -> Result<(), String> {
    let status = check_ollama()?;
    if status.running {
        return Ok(());
    }

    if !status.installed {
        return Err(
            "Ollama n'est pas installé. Installez-le via https://ollama.com ou winget install Ollama.Ollama".into(),
        );
    }

    Command::new("ollama")
        .arg("serve")
        .spawn()
        .map_err(|e| e.to_string())?;

    for _ in 0..30 {
        tokio::time::sleep(tokio::time::Duration::from_secs(1)).await;
        if check_ollama()?.running {
            return Ok(());
        }
    }

    Err("Ollama n'a pas démarré à temps".into())
}

pub async fn pull_model(model: &str) -> Result<(), String> {
    ensure_ollama_running().await?;

    let output = Command::new("ollama")
        .args(["pull", model])
        .output()
        .map_err(|e| e.to_string())?;

    if !output.status.success() {
        return Err(String::from_utf8_lossy(&output.stderr).to_string());
    }

    Ok(())
}

pub async fn stream_chat(
    model: &str,
    messages: &[serde_json::Value],
) -> Result<reqwest::Response, String> {
    let client = reqwest::Client::new();
    let body = serde_json::json!({
        "model": model,
        "messages": messages,
        "stream": true,
    });

    client
        .post(format!("{OLLAMA_URL}/v1/chat/completions"))
        .json(&body)
        .send()
        .await
        .map_err(|e| e.to_string())
}
