use super::{MediaGenerateRequest, MediaGenerateResult};
use crate::settings::{resolved_local_image_settings, LocalImageSettings};
use base64::Engine;
use chrono::Utc;
use serde::{Deserialize, Serialize};
use serde_json::{json, Value};
use std::sync::atomic::{AtomicBool, Ordering};
use std::sync::Arc;
use std::time::{Duration, Instant};
use url::Url;

const CLIENT_ID: &str = "ownmyownai";
const COMFYUI_POLL_TIMEOUT: Duration = Duration::from_secs(180);
const COMFYUI_POLL_INTERVAL: Duration = Duration::from_millis(800);

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct LocalImageStatus {
    pub enabled: bool,
    pub backend: String,
    pub base_url: String,
    pub reachable: bool,
    pub message: String,
    pub checkpoint: Option<String>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct GenerateImageInput {
    pub prompt: String,
    #[serde(default)]
    pub negative_prompt: Option<String>,
    #[serde(default)]
    pub width: Option<u32>,
    #[serde(default)]
    pub height: Option<u32>,
    #[serde(default)]
    pub steps: Option<u32>,
    #[serde(default)]
    pub seed: Option<i64>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct LocalImageResult {
    pub file_path: String,
    pub filename: String,
    pub prompt: String,
    pub width: u32,
    pub height: u32,
    pub backend: String,
}

#[derive(Clone)]
struct ImageGenerationParams {
    prompt: String,
    negative_prompt: String,
    width: u32,
    height: u32,
    steps: u32,
    seed: Option<i64>,
}

struct GeneratedImageBytes {
    bytes: Vec<u8>,
    backend: String,
    width: u32,
    height: u32,
    message: String,
}

fn http_client() -> Result<reqwest::blocking::Client, String> {
    reqwest::blocking::Client::builder()
        .timeout(Duration::from_secs(300))
        .build()
        .map_err(|e| e.to_string())
}

pub fn normalize_base_url(raw: &str) -> Result<String, String> {
    let trimmed = raw.trim();
    if trimmed.is_empty() {
        return Err("URL de base requise".into());
    }
    let url = Url::parse(trimmed).map_err(|_| "URL invalide".to_string())?;
    validate_local_url(&url)?;
    let mut normalized = format!(
        "{}://{}{}",
        url.scheme(),
        url.host_str().ok_or("Hôte manquant")?,
        if let Some(port) = url.port() {
            format!(":{port}")
        } else {
            String::new()
        }
    );
    let path = url.path().trim_end_matches('/');
    if !path.is_empty() && path != "/" {
        normalized.push_str(path);
    }
    Ok(normalized)
}

fn validate_local_url(url: &Url) -> Result<(), String> {
    if url.scheme() != "http" {
        return Err("Seul HTTP local est autorisé (pas HTTPS)".into());
    }
    match url.host_str() {
        Some("127.0.0.1") | Some("localhost") | Some("::1") => Ok(()),
        Some(host) => Err(format!(
            "Hôte non autorisé : {host}. Utilisez 127.0.0.1 ou localhost."
        )),
        None => Err("Hôte manquant".into()),
    }
}

fn is_comfyui(backend: &str) -> bool {
    backend.eq_ignore_ascii_case("comfyui")
}

fn is_sd_webui(backend: &str) -> bool {
    matches!(
        backend.to_ascii_lowercase().as_str(),
        "sd-webui" | "sdwebui" | "automatic1111" | "a1111" | "webui"
    )
}

fn parse_options(
    settings: &LocalImageSettings,
    options: &serde_json::Value,
) -> ImageGenerationParams {
    let width = options
        .get("width")
        .and_then(|v| v.as_u64())
        .map(|v| v as u32)
        .unwrap_or(settings.width)
        .clamp(64, 2048);
    let height = options
        .get("height")
        .and_then(|v| v.as_u64())
        .map(|v| v as u32)
        .unwrap_or(settings.height)
        .clamp(64, 2048);
    let steps = options
        .get("steps")
        .and_then(|v| v.as_u64())
        .map(|v| v as u32)
        .unwrap_or(settings.steps)
        .clamp(1, 150);
    let seed = options.get("seed").and_then(|v| v.as_i64());
    let negative_prompt = options
        .get("negativePrompt")
        .or_else(|| options.get("negative_prompt"))
        .and_then(|v| v.as_str())
        .unwrap_or("")
        .trim()
        .to_string();
    ImageGenerationParams {
        prompt: String::new(),
        negative_prompt,
        width,
        height,
        steps,
        seed,
    }
}

pub fn check_local_image_status(settings: &LocalImageSettings) -> LocalImageStatus {
    let base_url = settings.base_url.clone();
    let backend = settings.backend.clone();
    let enabled = settings.enabled;
    let checkpoint = settings.checkpoint.clone();

    if !enabled {
        return LocalImageStatus {
            enabled,
            backend,
            base_url,
            reachable: false,
            message: "Génération d'images locale désactivée.".into(),
            checkpoint,
        };
    }

    let normalized = match normalize_base_url(&base_url) {
        Ok(url) => url,
        Err(e) => {
            return LocalImageStatus {
                enabled,
                backend,
                base_url,
                reachable: false,
                message: e,
                checkpoint,
            };
        }
    };

    if is_comfyui(&backend) {
        match ping_comfyui(&normalized) {
            Ok(msg) => LocalImageStatus {
                enabled,
                backend,
                base_url: normalized,
                reachable: true,
                message: msg,
                checkpoint,
            },
            Err(e) => LocalImageStatus {
                enabled,
                backend,
                base_url: normalized,
                reachable: false,
                message: e,
                checkpoint,
            },
        }
    } else if is_sd_webui(&backend) {
        match ping_sd_webui(&normalized) {
            Ok(msg) => LocalImageStatus {
                enabled,
                backend,
                base_url: normalized,
                reachable: true,
                message: msg,
                checkpoint,
            },
            Err(e) => LocalImageStatus {
                enabled,
                backend,
                base_url: normalized,
                reachable: false,
                message: e,
                checkpoint,
            },
        }
    } else {
        LocalImageStatus {
            enabled,
            backend,
            base_url: normalized,
            reachable: false,
            message: "Backend inconnu. Choisissez comfyui ou sd-webui.".into(),
            checkpoint,
        }
    }
}

fn ping_comfyui(base_url: &str) -> Result<String, String> {
    let client = http_client()?;
    let url = format!("{base_url}/system_stats");
    let resp = client
        .get(&url)
        .send()
        .map_err(|e| format!("ComfyUI injoignable : {e}"))?;
    if !resp.status().is_success() {
        return Err(format!("ComfyUI a répondu {}", resp.status()));
    }
    Ok("ComfyUI accessible.".into())
}

fn ping_sd_webui(base_url: &str) -> Result<String, String> {
    let client = http_client()?;
    let url = format!("{base_url}/sdapi/v1/sd-models");
    let resp = client
        .get(&url)
        .send()
        .map_err(|e| format!("SD WebUI injoignable : {e}"))?;
    if !resp.status().is_success() {
        return Err(format!("SD WebUI a répondu {}", resp.status()));
    }
    let models: Vec<Value> = resp.json().map_err(|e| e.to_string())?;
    Ok(format!("SD WebUI accessible — {} modèle(s).", models.len()))
}

pub fn list_comfyui_checkpoints(base_url: &str) -> Result<Vec<String>, String> {
    let normalized = normalize_base_url(base_url)?;
    let client = http_client()?;
    let url = format!("{normalized}/object_info/CheckpointLoaderSimple");
    let resp = client
        .get(&url)
        .send()
        .map_err(|e| format!("ComfyUI injoignable : {e}"))?;
    if !resp.status().is_success() {
        return Err(format!("ComfyUI a répondu {}", resp.status()));
    }
    let body: Value = resp.json().map_err(|e| e.to_string())?;
    let checkpoints = body
        .pointer("/CheckpointLoaderSimple/input/required/ckpt_name/0")
        .or_else(|| body.pointer("/CheckpointLoaderSimple/input/required/ckpt_name"))
        .and_then(|v| v.as_array())
        .map(|arr| {
            arr.iter()
                .filter_map(|v| v.as_str().map(str::to_string))
                .collect::<Vec<_>>()
        })
        .unwrap_or_default();
    if checkpoints.is_empty() {
        return Err("Aucun checkpoint ComfyUI détecté.".into());
    }
    Ok(checkpoints)
}

fn resolve_checkpoint(settings: &LocalImageSettings, base_url: &str) -> Result<String, String> {
    if let Some(ref ckpt) = settings.checkpoint {
        if !ckpt.trim().is_empty() {
            return Ok(ckpt.trim().to_string());
        }
    }
    list_comfyui_checkpoints(base_url)?
        .into_iter()
        .next()
        .ok_or_else(|| "Aucun checkpoint ComfyUI disponible.".into())
}

fn generate_image_bytes(
    settings: &LocalImageSettings,
    prompt: &str,
    mut params: ImageGenerationParams,
    cancel: Option<&AtomicBool>,
) -> Result<GeneratedImageBytes, String> {
    if cancel.is_some_and(|c| c.load(Ordering::SeqCst)) {
        return Err("__cancelled__".into());
    }
    if !settings.enabled {
        return Err("Génération d'images locale désactivée.".into());
    }
    let prompt = prompt.trim();
    if prompt.is_empty() {
        return Err("Le prompt est requis.".into());
    }
    params.prompt = prompt.to_string();

    let base_url = normalize_base_url(&settings.base_url)?;
    if is_comfyui(&settings.backend) {
        generate_comfyui_bytes(&base_url, settings, &params, cancel)
    } else if is_sd_webui(&settings.backend) {
        generate_sd_webui_bytes(&base_url, &settings.backend, &params)
    } else {
        Err("Backend inconnu. Choisissez comfyui ou sd-webui.".into())
    }
}

fn generate_sd_webui_bytes(
    base_url: &str,
    backend: &str,
    params: &ImageGenerationParams,
) -> Result<GeneratedImageBytes, String> {
    let client = http_client()?;
    let url = format!("{base_url}/sdapi/v1/txt2img");
    let body = json!({
        "prompt": params.prompt,
        "negative_prompt": params.negative_prompt,
        "steps": params.steps,
        "width": params.width,
        "height": params.height,
        "cfg_scale": 7,
        "seed": params.seed.unwrap_or(-1),
    });
    let resp = client
        .post(&url)
        .json(&body)
        .send()
        .map_err(|e| format!("SD WebUI injoignable : {e}"))?;
    if !resp.status().is_success() {
        let status = resp.status();
        let text = resp.text().unwrap_or_default();
        return Err(format!("SD WebUI erreur {status} : {text}"));
    }
    let payload: Value = resp.json().map_err(|e| e.to_string())?;
    let b64 = payload
        .get("images")
        .and_then(|v| v.as_array())
        .and_then(|arr| arr.first())
        .and_then(|v| v.as_str())
        .ok_or_else(|| "SD WebUI n'a pas renvoyé d'image.".to_string())?;
    let bytes = base64::engine::general_purpose::STANDARD
        .decode(b64)
        .map_err(|e| format!("Image base64 invalide : {e}"))?;
    Ok(GeneratedImageBytes {
        bytes,
        backend: backend.to_string(),
        width: params.width,
        height: params.height,
        message: format!(
            "Image générée via SD WebUI ({}×{}).",
            params.width, params.height
        ),
    })
}

fn comfyui_workflow(params: &ImageGenerationParams, checkpoint: &str, seed: i64) -> Value {
    json!({
        "3": {
            "class_type": "KSampler",
            "inputs": {
                "seed": seed,
                "steps": params.steps,
                "cfg": 7.0,
                "sampler_name": "euler",
                "scheduler": "normal",
                "denoise": 1.0,
                "model": ["4", 0],
                "positive": ["6", 0],
                "negative": ["7", 0],
                "latent_image": ["5", 0]
            }
        },
        "4": {
            "class_type": "CheckpointLoaderSimple",
            "inputs": { "ckpt_name": checkpoint }
        },
        "5": {
            "class_type": "EmptyLatentImage",
            "inputs": { "width": params.width, "height": params.height, "batch_size": 1 }
        },
        "6": {
            "class_type": "CLIPTextEncode",
            "inputs": { "text": params.prompt, "clip": ["4", 1] }
        },
        "7": {
            "class_type": "CLIPTextEncode",
            "inputs": { "text": params.negative_prompt, "clip": ["4", 1] }
        },
        "8": {
            "class_type": "VAEDecode",
            "inputs": { "samples": ["3", 0], "vae": ["4", 2] }
        },
        "9": {
            "class_type": "SaveImage",
            "inputs": { "filename_prefix": "omoa", "images": ["8", 0] }
        }
    })
}

fn generate_comfyui_bytes(
    base_url: &str,
    settings: &LocalImageSettings,
    params: &ImageGenerationParams,
    cancel: Option<&AtomicBool>,
) -> Result<GeneratedImageBytes, String> {
    let checkpoint = resolve_checkpoint(settings, base_url)?;
    let seed = params
        .seed
        .unwrap_or_else(|| Utc::now().timestamp().rem_euclid(i64::MAX / 2));
    let workflow = comfyui_workflow(params, &checkpoint, seed);

    let client = http_client()?;
    let prompt_url = format!("{base_url}/prompt");
    let body = json!({ "prompt": workflow, "client_id": CLIENT_ID });
    let resp = client
        .post(&prompt_url)
        .json(&body)
        .send()
        .map_err(|e| format!("ComfyUI injoignable : {e}"))?;
    if !resp.status().is_success() {
        let status = resp.status();
        let text = resp.text().unwrap_or_default();
        return Err(format!("ComfyUI erreur {status} : {text}"));
    }
    let payload: Value = resp.json().map_err(|e| e.to_string())?;
    let prompt_id = payload
        .get("prompt_id")
        .and_then(|v| v.as_str())
        .ok_or_else(|| "ComfyUI n'a pas renvoyé de prompt_id.".to_string())?;

    let image_ref = poll_comfyui_output(base_url, prompt_id, cancel)?;
    let bytes = fetch_comfyui_image(base_url, &image_ref)?;
    Ok(GeneratedImageBytes {
        bytes,
        backend: "comfyui".to_string(),
        width: params.width,
        height: params.height,
        message: format!("Image générée via ComfyUI ({checkpoint})."),
    })
}

#[derive(Debug, Deserialize)]
struct ComfyImageRef {
    filename: String,
    subfolder: String,
    #[serde(rename = "type")]
    image_type: String,
}

fn poll_comfyui_output(
    base_url: &str,
    prompt_id: &str,
    cancel: Option<&AtomicBool>,
) -> Result<ComfyImageRef, String> {
    let client = http_client()?;
    let history_url = format!("{base_url}/history/{prompt_id}");
    let started = Instant::now();

    loop {
        if cancel.is_some_and(|c| c.load(Ordering::SeqCst)) {
            return Err("__cancelled__".into());
        }
        if started.elapsed() > COMFYUI_POLL_TIMEOUT {
            return Err("Délai ComfyUI dépassé (180 s).".into());
        }
        std::thread::sleep(COMFYUI_POLL_INTERVAL);

        let resp = client
            .get(&history_url)
            .send()
            .map_err(|e| format!("ComfyUI history : {e}"))?;
        if !resp.status().is_success() {
            continue;
        }
        let history: Value = resp.json().map_err(|e| e.to_string())?;
        let Some(entry) = history.get(prompt_id) else {
            continue;
        };
        let Some(outputs) = entry.get("outputs") else {
            continue;
        };
        for node in outputs.as_object().into_iter().flatten().map(|(_, v)| v) {
            if let Some(images) = node.get("images").and_then(|v| v.as_array()) {
                if let Some(first) = images.first() {
                    return serde_json::from_value(first.clone())
                        .map_err(|e| format!("Référence image invalide : {e}"));
                }
            }
        }
    }
}

fn fetch_comfyui_image(base_url: &str, image: &ComfyImageRef) -> Result<Vec<u8>, String> {
    let client = http_client()?;
    let url = format!(
        "{base_url}/view?filename={}&subfolder={}&type={}",
        urlencoding::encode(&image.filename),
        urlencoding::encode(&image.subfolder),
        urlencoding::encode(&image.image_type),
    );
    let resp = client
        .get(&url)
        .send()
        .map_err(|e| format!("Téléchargement image ComfyUI : {e}"))?;
    if !resp.status().is_success() {
        return Err(format!("ComfyUI view a répondu {}", resp.status()));
    }
    resp.bytes()
        .map(|b| b.to_vec())
        .map_err(|e| e.to_string())
}

pub fn generate_local_image(
    settings: &LocalImageSettings,
    input: &GenerateImageInput,
) -> Result<LocalImageResult, String> {
    let params = ImageGenerationParams {
        prompt: input.prompt.clone(),
        negative_prompt: input
            .negative_prompt
            .as_deref()
            .unwrap_or("")
            .trim()
            .to_string(),
        width: input.width.unwrap_or(settings.width).clamp(64, 2048),
        height: input.height.unwrap_or(settings.height).clamp(64, 2048),
        steps: input.steps.unwrap_or(settings.steps).clamp(1, 150),
        seed: input.seed,
    };
    let output = generate_image_bytes(settings, &input.prompt, params.clone(), None)?;
    let stamp = Utc::now().format("%Y%m%d-%H%M%S");
    let filename = format!("image-{stamp}.png");
    let path = crate::settings::resolved_creatives_dir().join(&filename);
    std::fs::create_dir_all(path.parent().unwrap()).map_err(|e| e.to_string())?;
    std::fs::write(&path, &output.bytes).map_err(|e| e.to_string())?;
    Ok(LocalImageResult {
        file_path: path.to_string_lossy().into_owned(),
        filename,
        prompt: params.prompt,
        width: output.width,
        height: output.height,
        backend: output.backend,
    })
}

pub async fn generate(
    request: &MediaGenerateRequest,
    cancel: &Arc<AtomicBool>,
    on_progress: impl Fn(u8, &str),
) -> Result<MediaGenerateResult, String> {
    if cancel.load(Ordering::SeqCst) {
        return Err("__cancelled__".into());
    }

    let settings = resolved_local_image_settings();
    if !settings.enabled {
        return Err(
            "Génération d'images locale désactivée — activez-la dans Paramètres > Images.".into(),
        );
    }

    on_progress(5, "Connexion au backend image local…");
    let status = check_local_image_status(&settings);
    if !status.reachable {
        return Err(status.message);
    }

    on_progress(15, "Génération image en cours…");
    let mut params = parse_options(&settings, &request.options);
    let prompt = request.prompt.clone();
    let cancel_flag = cancel.clone();

    let output = tokio::task::spawn_blocking(move || {
        generate_image_bytes(&settings, &prompt, params, Some(&cancel_flag))
    })
    .await
    .map_err(|e| e.to_string())??;

    on_progress(95, "Finalisation…");
    Ok(MediaGenerateResult {
        bytes: output.bytes,
        extension: "png".to_string(),
        mime_type: "image/png".to_string(),
        message: output.message,
    })
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn accepts_localhost_urls() {
        assert!(normalize_base_url("http://127.0.0.1:8188").is_ok());
        assert!(normalize_base_url("http://localhost:7860/").is_ok());
    }

    #[test]
    fn rejects_remote_urls() {
        assert!(normalize_base_url("http://example.com:8188").is_err());
        assert!(normalize_base_url("https://127.0.0.1:8188").is_err());
    }

    #[test]
    fn recognizes_backends() {
        assert!(is_comfyui("comfyui"));
        assert!(is_sd_webui("sd-webui"));
        assert!(is_sd_webui("automatic1111"));
    }
}
