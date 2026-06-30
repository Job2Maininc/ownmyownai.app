use base64::Engine;
use serde::Serialize;
use std::time::Duration;

const OPENAI_CHAT_URL: &str = "https://api.openai.com/v1/chat/completions";
const OPENAI_IMAGES_URL: &str = "https://api.openai.com/v1/images/generations";

pub const DEFAULT_IMAGE_MODEL: &str = "dall-e-3";
const DEFAULT_IMAGE_SIZE: &str = "1024x1024";

fn http_client() -> Result<reqwest::Client, String> {
    reqwest::Client::builder()
        .connect_timeout(Duration::from_secs(15))
        .timeout(Duration::from_secs(600))
        .build()
        .map_err(|e| e.to_string())
}

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct ImageGenerationOptions {
    pub model: Option<String>,
    pub size: Option<String>,
    pub quality: Option<String>,
    pub style: Option<String>,
}

impl Default for ImageGenerationOptions {
    fn default() -> Self {
        Self {
            model: None,
            size: None,
            quality: None,
            style: None,
        }
    }
}

#[derive(Debug, Clone)]
pub struct GeneratedImage {
    pub bytes: Vec<u8>,
    pub revised_prompt: Option<String>,
}

pub async fn stream_chat(
    api_key: &str,
    model: &str,
    messages: &[serde_json::Value],
) -> Result<reqwest::Response, String> {
    let client = http_client()?;
    let body = serde_json::json!({
        "model": model,
        "messages": messages,
        "stream": true,
    });

    let response = client
        .post(OPENAI_CHAT_URL)
        .header("Authorization", format!("Bearer {api_key}"))
        .json(&body)
        .send()
        .await
        .map_err(|e| {
            if e.is_connect() {
                "Impossible de joindre l'API OpenAI. Vérifiez votre connexion.".to_string()
            } else if e.is_timeout() {
                "L'API OpenAI met trop de temps à répondre.".to_string()
            } else {
                e.to_string()
            }
        })?;

    if !response.status().is_success() {
        let status = response.status();
        let detail = response.text().await.unwrap_or_default();
        return Err(format!(
            "OpenAI a renvoyé une erreur ({status}) : {detail}"
        ));
    }

    Ok(response)
}

/// Calls OpenAI `POST /v1/images/generations` (DALL-E) and returns decoded PNG bytes.
pub async fn generate_image(
    api_key: &str,
    prompt: &str,
    options: &ImageGenerationOptions,
) -> Result<GeneratedImage, String> {
    let trimmed = prompt.trim();
    if trimmed.is_empty() {
        return Err("Le prompt de génération d'image ne peut pas être vide.".into());
    }

    let model = options
        .model
        .as_deref()
        .filter(|m| !m.is_empty())
        .unwrap_or(DEFAULT_IMAGE_MODEL);
    let size = options
        .size
        .as_deref()
        .filter(|s| !s.is_empty())
        .unwrap_or(DEFAULT_IMAGE_SIZE);

    let mut body = serde_json::json!({
        "model": model,
        "prompt": trimmed,
        "n": 1,
        "size": size,
        "response_format": "b64_json",
    });

    if let Some(quality) = options.quality.as_deref().filter(|q| !q.is_empty()) {
        body["quality"] = serde_json::Value::String(quality.to_string());
    }
    if let Some(style) = options.style.as_deref().filter(|s| !s.is_empty()) {
        body["style"] = serde_json::Value::String(style.to_string());
    }

    let client = http_client()?;
    let response = client
        .post(OPENAI_IMAGES_URL)
        .header("Authorization", format!("Bearer {api_key}"))
        .json(&body)
        .send()
        .await
        .map_err(|e| {
            if e.is_connect() {
                "Impossible de joindre l'API OpenAI (images). Vérifiez votre connexion."
                    .to_string()
            } else if e.is_timeout() {
                "La génération d'image OpenAI met trop de temps à répondre.".to_string()
            } else {
                e.to_string()
            }
        })?;

    if !response.status().is_success() {
        let status = response.status();
        let detail = response.text().await.unwrap_or_default();
        return Err(format!(
            "OpenAI images a renvoyé une erreur ({status}) : {detail}"
        ));
    }

    let json: serde_json::Value = response.json().await.map_err(|e| e.to_string())?;
    parse_image_generation_response(&json)
}

fn parse_image_generation_response(json: &serde_json::Value) -> Result<GeneratedImage, String> {
    let item = json
        .get("data")
        .and_then(|d| d.as_array())
        .and_then(|arr| arr.first())
        .ok_or_else(|| "Réponse OpenAI images invalide : champ data manquant.".to_string())?;

    let b64 = item
        .get("b64_json")
        .and_then(|v| v.as_str())
        .filter(|s| !s.is_empty())
        .ok_or_else(|| {
            "Réponse OpenAI images invalide : b64_json manquant ou vide.".to_string()
        })?;

    let bytes = base64::engine::general_purpose::STANDARD
        .decode(b64)
        .map_err(|e| format!("Impossible de décoder l'image base64 OpenAI : {e}"))?;

    if bytes.is_empty() {
        return Err("OpenAI a renvoyé une image vide.".into());
    }

    let revised_prompt = item
        .get("revised_prompt")
        .and_then(|v| v.as_str())
        .map(str::to_string);

    Ok(GeneratedImage {
        bytes,
        revised_prompt,
    })
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn parses_b64_image_response() {
        let payload = b"PNG-test-bytes";
        let b64 = base64::engine::general_purpose::STANDARD.encode(payload);
        let json = serde_json::json!({
            "created": 1,
            "data": [{
                "b64_json": b64,
                "revised_prompt": "a cat in space"
            }]
        });

        let image = parse_image_generation_response(&json).expect("parse");
        assert_eq!(image.bytes, payload);
        assert_eq!(image.revised_prompt.as_deref(), Some("a cat in space"));
    }

    #[test]
    fn rejects_missing_data() {
        let err = parse_image_generation_response(&serde_json::json!({}))
            .expect_err("missing data");
        assert!(err.contains("data"));
    }
}
