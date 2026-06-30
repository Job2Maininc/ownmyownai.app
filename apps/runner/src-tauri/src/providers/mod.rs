mod anthropic;
mod openai;

use crate::cloud_keys::{has_provider_api_key, CloudProviderId};
use crate::ollama::{list_installed_models, stream_chat};
use crate::settings::get_settings;
use futures_util::StreamExt;
use serde::Serialize;
use std::sync::atomic::{AtomicBool, Ordering};
use std::time::Duration;

pub use crate::cloud_keys::CloudProviderId as ProviderId;
pub use openai::{GeneratedImage, ImageGenerationOptions, DEFAULT_IMAGE_MODEL};

const OPENAI_MODELS: &[&str] = &[
    "openai:gpt-4o-mini",
    "openai:gpt-4o",
    "openai:gpt-4-turbo",
];

const ANTHROPIC_MODELS: &[&str] = &[
    "anthropic:claude-3-5-haiku-20241022",
    "anthropic:claude-3-5-sonnet-20241022",
];

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct CloudProviderStatus {
    pub id: String,
    pub configured: bool,
    pub enabled: bool,
    pub models: Vec<String>,
}

pub fn is_cloud_model(model: &str) -> bool {
    model.starts_with("openai:") || model.starts_with("anthropic:")
}

pub fn parse_cloud_model(model: &str) -> Option<(CloudProviderId, String)> {
    if let Some(api_model) = model.strip_prefix("openai:") {
        if api_model.is_empty() {
            return None;
        }
        return Some((CloudProviderId::OpenAi, api_model.to_string()));
    }
    if let Some(api_model) = model.strip_prefix("anthropic:") {
        if api_model.is_empty() {
            return None;
        }
        return Some((CloudProviderId::Anthropic, api_model.to_string()));
    }
    None
}

fn provider_enabled(provider: CloudProviderId) -> bool {
    get_settings()
        .map(|s| match provider {
            CloudProviderId::OpenAi => s.cloud_providers.openai.enabled,
            CloudProviderId::Anthropic => s.cloud_providers.anthropic.enabled,
        })
        .unwrap_or(false)
}

pub fn list_available_cloud_models() -> Vec<String> {
    let mut models = Vec::new();
    if provider_enabled(CloudProviderId::OpenAi) && has_provider_api_key(CloudProviderId::OpenAi) {
        models.extend(OPENAI_MODELS.iter().map(|s| (*s).to_string()));
    }
    if provider_enabled(CloudProviderId::Anthropic)
        && has_provider_api_key(CloudProviderId::Anthropic)
    {
        models.extend(ANTHROPIC_MODELS.iter().map(|s| (*s).to_string()));
    }
    models
}

pub fn list_available_models() -> Vec<String> {
    let mut models = list_installed_models();
    for cloud in list_available_cloud_models() {
        if !models.contains(&cloud) {
            models.push(cloud);
        }
    }
    models
}

pub fn is_available_model(model: &str) -> bool {
    if is_cloud_model(model) {
        list_available_cloud_models().iter().any(|m| m == model)
    } else {
        crate::ollama::model_exists(model)
    }
}

/// Generates an image via OpenAI DALL-E (`images/generations`) when the provider is enabled.
pub async fn generate_openai_image(
    prompt: &str,
    options: &ImageGenerationOptions,
) -> Result<GeneratedImage, String> {
    if !provider_enabled(CloudProviderId::OpenAi) {
        return Err(
            "Le fournisseur OpenAI est désactivé dans les paramètres Host.".to_string(),
        );
    }
    let api_key = crate::cloud_keys::get_provider_api_key(CloudProviderId::OpenAi)?
        .ok_or_else(|| {
            "Aucune clé API configurée pour OpenAI. Ajoutez-la dans l'app Host.".to_string()
        })?;
    openai::generate_image(&api_key, prompt, options).await
}

pub fn get_cloud_providers_status() -> Vec<CloudProviderStatus> {
    vec![
        CloudProviderStatus {
            id: CloudProviderId::OpenAi.as_str().to_string(),
            configured: has_provider_api_key(CloudProviderId::OpenAi),
            enabled: provider_enabled(CloudProviderId::OpenAi),
            models: OPENAI_MODELS.iter().map(|s| (*s).to_string()).collect(),
        },
        CloudProviderStatus {
            id: CloudProviderId::Anthropic.as_str().to_string(),
            configured: has_provider_api_key(CloudProviderId::Anthropic),
            enabled: provider_enabled(CloudProviderId::Anthropic),
            models: ANTHROPIC_MODELS.iter().map(|s| (*s).to_string()).collect(),
        },
    ]
}

fn http_client() -> Result<reqwest::Client, String> {
    reqwest::Client::builder()
        .connect_timeout(Duration::from_secs(15))
        .timeout(Duration::from_secs(600))
        .build()
        .map_err(|e| e.to_string())
}

pub async fn stream_chat_response(
    model: &str,
    messages: &[serde_json::Value],
) -> Result<reqwest::Response, String> {
    if let Some((provider, api_model)) = parse_cloud_model(model) {
        if !provider_enabled(provider) {
            return Err(format!(
                "Le fournisseur « {} » est désactivé dans les paramètres Host.",
                provider.as_str()
            ));
        }
        let api_key = crate::cloud_keys::get_provider_api_key(provider)?
            .ok_or_else(|| {
                format!(
                    "Aucune clé API configurée pour « {} ». Ajoutez-la dans l'app Host.",
                    provider.as_str()
                )
            })?;
        return match provider {
            CloudProviderId::OpenAi => openai::stream_chat(&api_key, &api_model, messages).await,
            CloudProviderId::Anthropic => {
                anthropic::stream_chat(&api_key, &api_model, messages).await
            }
        };
    }

    stream_chat(model, messages).await
}

/// Streams chat deltas (OpenAI-compatible SSE or Anthropic events).
pub async fn relay_chat_stream<W>(
    model: &str,
    messages: &[serde_json::Value],
    cancel: &AtomicBool,
    mut on_delta: W,
) -> Result<(), String>
where
    W: FnMut(&str) -> Result<(), String>,
{
    if let Some((provider, api_model)) = parse_cloud_model(model) {
        if !provider_enabled(provider) {
            return Err(format!(
                "Le fournisseur « {} » est désactivé dans les paramètres Host.",
                provider.as_str()
            ));
        }
        let api_key = crate::cloud_keys::get_provider_api_key(provider)?
            .ok_or_else(|| {
                format!(
                    "Aucune clé API configurée pour « {} ». Ajoutez-la dans l'app Host.",
                    provider.as_str()
                )
            })?;
        let client = http_client()?;
        return match provider {
            CloudProviderId::OpenAi => {
                let response = openai::stream_chat(&api_key, &api_model, messages).await?;
                relay_openai_sse_stream(response, cancel, on_delta).await
            }
            CloudProviderId::Anthropic => {
                anthropic::relay_stream(&client, &api_key, &api_model, messages, cancel, on_delta)
                    .await
            }
        };
    }

    let response = stream_chat(model, messages).await?;
    relay_openai_sse_stream(response, cancel, on_delta).await
}

async fn relay_openai_sse_stream<W>(
    response: reqwest::Response,
    cancel: &AtomicBool,
    mut on_delta: W,
) -> Result<(), String>
where
    W: FnMut(&str) -> Result<(), String>,
{
    let mut stream = response.bytes_stream();
    while let Some(chunk) = stream.next().await {
        if cancel.load(Ordering::SeqCst) {
            return Ok(());
        }
        let chunk = chunk.map_err(|e| e.to_string())?;
        let text = String::from_utf8_lossy(&chunk);
        for line in text.lines() {
            if cancel.load(Ordering::SeqCst) {
                return Ok(());
            }
            if !line.starts_with("data: ") {
                continue;
            }
            let data = &line[6..];
            if data == "[DONE]" {
                return Ok(());
            }
            if let Ok(json) = serde_json::from_str::<serde_json::Value>(data) {
                if let Some(content) = json["choices"][0]["delta"]["content"].as_str() {
                    on_delta(content)?;
                }
            }
        }
    }
    Ok(())
}
