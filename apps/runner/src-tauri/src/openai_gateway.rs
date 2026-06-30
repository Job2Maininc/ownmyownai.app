//! Passerelle HTTP locale compatible OpenAI pour Cursor et autres clients IDE.
//! Injecte RAG, règles projet et mémoire utilisateur avant d'appeler Ollama ou les providers cloud.

use crate::chat_pipeline::{self, ChatPipelineInput};
use crate::context::init_context_db;
use crate::credentials::cursor_api_token_for_gateway;
use crate::ollama::{chat_with_tools, complete_chat, ensure_ollama_running, ToolCall};
use crate::projects::get_project;
use crate::providers::{
    is_available_model, is_cloud_model, list_available_models, parse_cloud_model,
    stream_chat_response,
};
use crate::settings::{
    get_active_project_id as settings_active_project_id, resolved_cursor_gateway_max_req_per_min,
    resolved_default_model,
};
use crate::cloud_keys::CloudProviderId;
use axum::{
    body::Body,
    extract::{Request, State},
    http::{header, HeaderMap, StatusCode},
    middleware::{self, Next},
    response::{IntoResponse, Response},
    routing::{get, post},
    Json, Router,
};
use futures_util::StreamExt;
use serde::{Deserialize, Serialize};
use std::collections::HashMap;
use std::net::{IpAddr, UdpSocket};
use std::sync::atomic::{AtomicBool, Ordering};
use std::sync::{Arc, Mutex, OnceLock};
use tokio::sync::watch;
use uuid::Uuid;

/// Configuration d'écoute du gateway (port + loopback ou LAN).
#[derive(Debug, Clone, PartialEq, Eq)]
pub struct GatewayBindConfig {
    pub port: u16,
    pub lan: bool,
}

fn read_gateway_bind_config() -> GatewayBindConfig {
    let settings = crate::settings::get_settings().unwrap_or_default();
    GatewayBindConfig {
        port: settings.cursor_gateway_port,
        lan: settings.cursor_gateway_lan,
    }
}

/// Adresse socket `host:port` pour `TcpListener::bind`.
pub fn bind_socket_addr(config: &GatewayBindConfig) -> String {
    let host = if config.lan { "0.0.0.0" } else { "127.0.0.1" };
    format!("{host}:{}", config.port)
}

/// IP locale préférée pour les clients sur le réseau (UDP trick).
pub fn primary_lan_ip() -> Option<String> {
    let socket = UdpSocket::bind("0.0.0.0:0").ok()?;
    socket.connect("8.8.8.8:80").ok()?;
    let addr = socket.local_addr().ok()?;
    match addr.ip() {
        IpAddr::V4(v4) if !v4.is_loopback() => Some(v4.to_string()),
        _ => None,
    }
}

/// URL de base affichée à l'utilisateur (Cursor Settings → Override OpenAI Base URL).
pub fn client_base_url(config: &GatewayBindConfig) -> String {
    let host = if config.lan {
        primary_lan_ip().unwrap_or_else(|| "127.0.0.1".to_string())
    } else {
        "127.0.0.1".to_string()
    };
    format!("http://{host}:{}/v1", config.port)
}

static GATEWAY_CONFIG_TX: OnceLock<watch::Sender<GatewayBindConfig>> = OnceLock::new();
static GATEWAY_SUPERVISOR_STARTED: AtomicBool = AtomicBool::new(false);

/// En-tête HTTP optionnel pour fusionner les outils locaux Host (`agent/tools.rs`).
pub const ENABLE_LOCAL_TOOLS_HEADER: &str = "x-enable-local-tools";

/// En-tête HTTP optionnel pour cibler un projet OwnMyOwnAI depuis Cursor.
pub const PROJECT_ID_HEADER: &str = "x-project-id";

/// Événement extrait d'une ligne SSE OpenAI-compatible (`data: ...`).
#[derive(Debug, Clone, PartialEq, Eq)]
enum SseLineEvent {
    Skip,
    Done,
    ContentDelta(String),
}

/// Parse une ligne SSE du flux chat OpenAI/Ollama.
fn parse_sse_line(line: &str) -> SseLineEvent {
    let trimmed = line.trim();
    if !trimmed.starts_with("data: ") {
        return SseLineEvent::Skip;
    }
    let data = trimmed["data: ".len()..].trim();
    if data == "[DONE]" {
        return SseLineEvent::Done;
    }
    if let Ok(json) = serde_json::from_str::<serde_json::Value>(data) {
        if let Some(content) = json["choices"][0]["delta"]["content"].as_str() {
            if !content.is_empty() {
                return SseLineEvent::ContentDelta(content.to_string());
            }
        }
    }
    SseLineEvent::Skip
}

/// Extrait le jeton Bearer depuis la valeur brute de l'en-tête `Authorization`.
fn extract_bearer_token(authorization: &str) -> Option<&str> {
    let scheme_end = authorization.find(' ')?;
    let scheme = &authorization[..scheme_end];
    if !scheme.eq_ignore_ascii_case("bearer") {
        return None;
    }
    let token = authorization[scheme_end + 1..].trim();
    if token.is_empty() {
        None
    } else {
        Some(token)
    }
}

/// Mappe l'en-tête `Authorization` vers le jeton Bearer fourni par le client.
fn map_gateway_auth_token(headers: &axum::http::HeaderMap) -> Result<String, String> {
    let raw = headers
        .get(header::AUTHORIZATION)
        .ok_or("En-tête Authorization manquant.")?
        .to_str()
        .map_err(|_| "Authorization : encodage invalide.")?;
    extract_bearer_token(raw)
        .map(|token| token.to_string())
        .ok_or_else(|| "Authorization doit utiliser le schéma Bearer.".into())
}

/// Vérifie que le jeton Bearer correspond au secret gateway du Host.
fn validate_gateway_bearer(
    headers: &axum::http::HeaderMap,
    expected_token: &str,
) -> Result<(), String> {
    if expected_token.is_empty() {
        return Err("Host non appairé — token gateway Cursor indisponible.".into());
    }
    let provided = map_gateway_auth_token(headers)?;
    if provided != expected_token {
        return Err("Token gateway invalide.".into());
    }
    Ok(())
}

/// Résout l'identifiant projet pour une requête gateway.
/// Si `X-Project-Id` est fourni (non vide), valide l'existence du projet.
/// Sinon, retombe sur le projet actif du Host.
pub fn resolve_gateway_project_id(
    headers: &axum::http::HeaderMap,
) -> Result<Option<String>, String> {
    if let Some(value) = headers.get(PROJECT_ID_HEADER) {
        let raw = value
            .to_str()
            .map_err(|_| "En-tête X-Project-Id : encodage invalide.".to_string())?;
        let trimmed = raw.trim();
        if trimmed.is_empty() {
            return settings_active_project_id();
        }
        get_project(trimmed, None)
            .map_err(|_| format!("Projet introuvable pour X-Project-Id : {trimmed}"))?;
        return Ok(Some(trimmed.to_string()));
    }
    settings_active_project_id()
}

#[derive(Clone)]
struct GatewayAuthState {
    expected_token: Arc<String>,
}

async fn bearer_auth_middleware(
    State(auth): State<GatewayAuthState>,
    request: Request,
    next: Next,
) -> Response {
    if let Err(message) = validate_gateway_bearer(request.headers(), &auth.expected_token) {
        let body = ApiErrorBody {
            error: ApiErrorDetail {
                message,
                error_type: "authentication_error".into(),
                code: Some("invalid_api_key".into()),
            },
        };
        return (StatusCode::UNAUTHORIZED, Json(body)).into_response();
    }
    next.run(request).await
}

/// Limiteur fixe par fenêtre d'une minute, indexé par token Bearer.
#[derive(Clone, Default)]
struct GatewayRateLimiter {
    buckets: Arc<Mutex<HashMap<String, RateBucket>>>,
}

#[derive(Debug, Clone, Copy)]
struct RateBucket {
    window_minute: u64,
    count: u32,
}

impl GatewayRateLimiter {
    /// Retourne `Ok(())` si la requête est autorisée, sinon le nombre de secondes avant retry.
    fn try_acquire(&self, token: &str, max_per_min: u32) -> Result<(), u64> {
        if max_per_min == 0 {
            return Ok(());
        }

        let now_min = current_minute_epoch();
        let mut map = self.buckets.lock().expect("rate limiter lock");

        if map.len() > 512 {
            map.retain(|_, bucket| bucket.window_minute == now_min);
        }

        let bucket = map
            .entry(token.to_string())
            .or_insert(RateBucket {
                window_minute: now_min,
                count: 0,
            });

        if bucket.window_minute != now_min {
            bucket.window_minute = now_min;
            bucket.count = 0;
        }

        if bucket.count >= max_per_min {
            let retry_after = 60 - (chrono::Utc::now().timestamp() as u64 % 60);
            return Err(retry_after.max(1));
        }

        bucket.count += 1;
        Ok(())
    }
}

fn current_minute_epoch() -> u64 {
    chrono::Utc::now().timestamp() as u64 / 60
}

/// Clé de rate limiting à partir de l'en-tête Authorization (sentinelle si absent).
fn rate_limit_token_key(headers: &HeaderMap) -> String {
    headers
        .get(header::AUTHORIZATION)
        .and_then(|v| v.to_str().ok())
        .and_then(extract_bearer_token)
        .map(str::to_string)
        .unwrap_or_else(|| "__no_token__".to_string())
}

async fn rate_limit_middleware(
    State(limiter): State<GatewayRateLimiter>,
    request: Request,
    next: Next,
) -> Response {
    let max_per_min = resolved_cursor_gateway_max_req_per_min();
    let token = rate_limit_token_key(request.headers());

    if let Err(retry_after) = limiter.try_acquire(&token, max_per_min) {
        return rate_limit_response(max_per_min, retry_after);
    }

    next.run(request).await
}

fn rate_limit_response(max_per_min: u32, retry_after: u64) -> Response {
    let body = ApiErrorBody {
        error: ApiErrorDetail {
            message: format!(
                "Limite de {max_per_min} requêtes par minute atteinte pour ce token. Réessayez dans {retry_after} s."
            ),
            error_type: "rate_limit_error".into(),
            code: Some("rate_limit_exceeded".into()),
        },
    };
    (
        StatusCode::TOO_MANY_REQUESTS,
        [(header::RETRY_AFTER, retry_after.to_string())],
        Json(body),
    )
        .into_response()
}

/// Démarre le superviseur HTTP (idempotent).
pub fn start() {
    if GATEWAY_SUPERVISOR_STARTED.swap(true, Ordering::SeqCst) {
        return;
    }
    let initial = read_gateway_bind_config();
    let (tx, rx) = watch::channel(initial);
    let _ = GATEWAY_CONFIG_TX.set(tx);
    tauri::async_runtime::spawn(gateway_supervisor(rx));
}

/// Recharge port / mode d'écoute après modification des settings Host.
pub fn reload() {
    if let Some(tx) = GATEWAY_CONFIG_TX.get() {
        let _ = tx.send(read_gateway_bind_config());
    } else {
        start();
    }
}

fn build_gateway_router(auth_state: GatewayAuthState) -> Router {
    let rate_limiter = GatewayRateLimiter::default();
    let v1 = Router::new()
        .route("/models", get(list_models))
        .route("/chat/completions", post(chat_completions))
        .layer(middleware::from_fn_with_state(
            rate_limiter.clone(),
            rate_limit_middleware,
        ))
        .layer(middleware::from_fn_with_state(
            auth_state.clone(),
            bearer_auth_middleware,
        ));

    Router::new()
        .route("/health", get(health))
        .nest("/v1", v1)
}

async fn gateway_supervisor(mut rx: watch::Receiver<GatewayBindConfig>) {
    loop {
        let config = rx.borrow_and_update().clone();
        let socket_addr = bind_socket_addr(&config);

        let expected_token = cursor_api_token_for_gateway().unwrap_or_default();
        if expected_token.is_empty() {
            eprintln!(
                "OpenAI gateway : aucun cursorApiToken — les routes /v1 exigeront un pairing."
            );
        }
        let auth_state = GatewayAuthState {
            expected_token: Arc::new(expected_token),
        };

        let listener = match tokio::net::TcpListener::bind(&socket_addr).await {
            Ok(listener) => listener,
            Err(e) => {
                eprintln!("OpenAI gateway — impossible de démarrer sur {socket_addr}: {e}");
                if rx.changed().await.is_err() {
                    break;
                }
                continue;
            }
        };

        let client_url = client_base_url(&config);
        if config.lan {
            eprintln!("OpenAI gateway → {client_url} (LAN, écoute {socket_addr}, Bearer requis)");
        } else {
            eprintln!("OpenAI gateway → {client_url} (localhost uniquement, Bearer requis)");
        }

        let app = build_gateway_router(auth_state);
        let shutdown = async {
            let _ = rx.changed().await;
        };

        if let Err(e) = axum::serve(listener, app)
            .with_graceful_shutdown(shutdown)
            .await
        {
            eprintln!("OpenAI gateway : {e}");
        }

        if rx.has_changed().is_err() {
            break;
        }
    }
    GATEWAY_SUPERVISOR_STARTED.store(false, Ordering::SeqCst);
}

async fn health() -> impl IntoResponse {
    Json(serde_json::json!({
        "ok": true,
        "service": "omoa-openai-gateway",
    }))
}

#[derive(Serialize)]
struct ModelsListResponse {
    object: String,
    data: Vec<ModelObject>,
}

#[derive(Serialize)]
struct ModelObject {
    id: String,
    object: String,
    created: i64,
    owned_by: String,
}

async fn list_models() -> impl IntoResponse {
    let created = chrono::Utc::now().timestamp();
    let data: Vec<ModelObject> = list_available_models()
        .into_iter()
        .map(|id| ModelObject {
            id: id.clone(),
            object: "model".into(),
            created,
            owned_by: if is_cloud_model(&id) {
                "cloud".into()
            } else {
                "ollama".into()
            },
        })
        .collect();

    Json(ModelsListResponse {
        object: "list".into(),
        data,
    })
}

#[derive(Debug, Deserialize)]
struct ChatCompletionRequest {
    #[serde(default)]
    model: String,
    #[serde(default)]
    messages: Vec<serde_json::Value>,
    #[serde(default)]
    stream: bool,
    #[serde(default)]
    tools: Option<Vec<serde_json::Value>>,
    #[serde(default)]
    tool_choice: Option<serde_json::Value>,
}

#[derive(Serialize)]
struct ApiErrorBody {
    error: ApiErrorDetail,
}

#[derive(Serialize)]
struct ApiErrorDetail {
    message: String,
    #[serde(rename = "type")]
    error_type: String,
    code: Option<String>,
}

struct ApiError {
    status: StatusCode,
    message: String,
}

impl ApiError {
    fn new(status: StatusCode, message: impl Into<String>) -> Self {
        Self {
            status,
            message: message.into(),
        }
    }
}

impl IntoResponse for ApiError {
    fn into_response(self) -> Response {
        let body = ApiErrorBody {
            error: ApiErrorDetail {
                message: self.message,
                error_type: "invalid_request_error".into(),
                code: None,
            },
        };
        (self.status, Json(body)).into_response()
    }
}

async fn chat_completions(request: Request) -> Result<Response, ApiError> {
    let project_id = resolve_gateway_project_id(request.headers())
        .map_err(|e| ApiError::new(StatusCode::BAD_REQUEST, e))?;

    let enable_local_tools = request
        .headers()
        .get(ENABLE_LOCAL_TOOLS_HEADER)
        .and_then(|v| v.to_str().ok())
        .is_some_and(|v| v == "1" || v.eq_ignore_ascii_case("true"));

    let body: ChatCompletionRequest = axum::body::to_bytes(request.into_body(), 2 * 1024 * 1024)
        .await
        .map_err(|e| ApiError::new(StatusCode::BAD_REQUEST, e.to_string()))
        .and_then(|bytes| {
            serde_json::from_slice(&bytes)
                .map_err(|e| ApiError::new(StatusCode::BAD_REQUEST, format!("JSON invalide : {e}")))
        })?;

    let model = if body.model.trim().is_empty() {
        resolved_default_model()
    } else {
        body.model.trim().to_string()
    };

    if body.messages.is_empty() {
        return Err(ApiError::new(
            StatusCode::BAD_REQUEST,
            "Le champ « messages » est requis.",
        ));
    }

    if let Some((CloudProviderId::Anthropic, _)) = parse_cloud_model(&model) {
        return Err(ApiError::new(
            StatusCode::NOT_IMPLEMENTED,
            "Les modèles Anthropic ne sont pas encore exposés via le gateway Cursor. Utilisez le chat web.",
        ));
    }

    if !is_available_model(&model) {
        return Err(ApiError::new(
            StatusCode::BAD_REQUEST,
            format!("Le modèle « {model} » n'est pas disponible sur ce Host."),
        ));
    }

    let _ = init_context_db();

    let mut messages = body.messages;
    if messages.len() > 20 {
        messages = messages.split_off(messages.len().saturating_sub(20));
    }

    if !is_cloud_model(&model) {
        messages = crate::conversation_summary::compact_messages_for_chat(&model, messages)
            .await
            .map_err(|e| ApiError::new(StatusCode::INTERNAL_SERVER_ERROR, e))?;
    }

    let context_ids = chat_pipeline::resolve_context_ids(&[], project_id.as_deref());

    let enriched = chat_pipeline::enrich_messages(
        messages,
        ChatPipelineInput {
            model: &model,
            project_id: project_id.as_deref(),
            context_ids: &context_ids,
            mention_payload: None,
            audit_source: "openai_gateway",
            audit_request_id: None,
        },
    )
    .await
    .map_err(|e| ApiError::new(StatusCode::INTERNAL_SERVER_ERROR, e))?;

    messages = enriched.messages;

    if !is_cloud_model(&model) {
        ensure_ollama_running(None)
            .await
            .map_err(|e| ApiError::new(StatusCode::SERVICE_UNAVAILABLE, e))?;
    }

    let tools = resolve_gateway_tools(
        body.tools.as_deref(),
        enable_local_tools,
        body.tool_choice.as_ref(),
    );

    if tools.is_some() {
        if body.stream {
            return Err(ApiError::new(
                StatusCode::BAD_REQUEST,
                "Le tool calling OpenAI requiert « stream » : false.",
            ));
        }
        if is_cloud_model(&model) {
            return Err(ApiError::new(
                StatusCode::NOT_IMPLEMENTED,
                "Le tool calling via le gateway n'est pas encore supporté pour les modèles cloud.",
            ));
        }
        return complete_chat_with_tools(&model, &messages, tools.as_ref().unwrap()).await;
    }

    if body.stream {
        stream_chat_completions(&model, &messages).await
    } else {
        complete_chat_completions(&model, &messages).await
    }
}

/// Fusionne les outils OpenAI du client (Cursor) avec les schémas locaux `agent/tools.rs`.
fn resolve_gateway_tools(
    request_tools: Option<&[serde_json::Value]>,
    enable_local: bool,
    tool_choice: Option<&serde_json::Value>,
) -> Option<Vec<serde_json::Value>> {
    if matches!(tool_choice, Some(tc) if tc.as_str() == Some("none")) {
        return None;
    }

    let mut tools: Vec<serde_json::Value> = request_tools
        .map(|items| items.iter().filter_map(normalize_openai_tool).collect())
        .unwrap_or_default();

    if enable_local {
        for local in crate::agent::tool_definitions() {
            let local_name = local["function"]["name"].as_str();
            let already_present = tools.iter().any(|tool| {
                tool["function"]["name"].as_str() == local_name
            });
            if !already_present {
                tools.push(local);
            }
        }
    }

    if tools.is_empty() {
        None
    } else {
        Some(tools)
    }
}

/// Normalise un outil OpenAI vers le format Ollama (`type` + `function`).
fn normalize_openai_tool(tool: &serde_json::Value) -> Option<serde_json::Value> {
    if tool.get("type").and_then(|t| t.as_str()) != Some("function") {
        return None;
    }
    let func = tool.get("function")?;
    let name = func.get("name")?.as_str()?;
    Some(serde_json::json!({
        "type": "function",
        "function": {
            "name": name,
            "description": func.get("description").cloned().unwrap_or(serde_json::Value::Null),
            "parameters": func
                .get("parameters")
                .cloned()
                .unwrap_or_else(|| serde_json::json!({ "type": "object" }))
        }
    }))
}

/// Convertit les appels d'outils Ollama en réponse OpenAI (`arguments` en chaîne JSON).
fn format_tool_calls_for_openai(calls: &[ToolCall]) -> Vec<serde_json::Value> {
    calls
        .iter()
        .map(|tc| {
            let arguments = if let Some(s) = tc.arguments.as_str() {
                s.to_string()
            } else {
                tc.arguments.to_string()
            };
            serde_json::json!({
                "id": format!("call_{}", Uuid::new_v4().simple()),
                "type": "function",
                "function": {
                    "name": tc.name,
                    "arguments": arguments
                }
            })
        })
        .collect()
}

async fn stream_chat_completions(
    model: &str,
    messages: &[serde_json::Value],
) -> Result<Response, ApiError> {
    crate::local_metrics::begin_request(model);

    let upstream = stream_chat_response(model, messages)
        .await
        .map_err(|e| ApiError::new(StatusCode::BAD_GATEWAY, e))?;

    let stream = upstream.bytes_stream().map(|chunk| {
        chunk.map_err(|e| std::io::Error::new(std::io::ErrorKind::Other, e.to_string()))
    });

    let body = Body::from_stream(stream);

    Ok(Response::builder()
        .status(StatusCode::OK)
        .header(header::CONTENT_TYPE, "text/event-stream; charset=utf-8")
        .header(header::CACHE_CONTROL, "no-cache")
        .header(header::CONNECTION, "keep-alive")
        .body(body)
        .map_err(|e| ApiError::new(StatusCode::INTERNAL_SERVER_ERROR, e.to_string()))?)
}

async fn complete_chat_with_tools(
    model: &str,
    messages: &[serde_json::Value],
    tools: &[serde_json::Value],
) -> Result<Response, ApiError> {
    crate::local_metrics::begin_request(model);

    let response = chat_with_tools(model, messages, tools)
        .await
        .map_err(|e| ApiError::new(StatusCode::BAD_GATEWAY, e))?;

    crate::local_metrics::finish_request();

    let completion_id = format!("chatcmpl-{}", Uuid::new_v4().simple());
    let created = chrono::Utc::now().timestamp();

    let (message, finish_reason) = if let Some(calls) = response.tool_calls {
        let tool_calls = format_tool_calls_for_openai(&calls);
        let content = response.content.unwrap_or_default();
        (
            serde_json::json!({
                "role": "assistant",
                "content": if content.is_empty() {
                    serde_json::Value::Null
                } else {
                    serde_json::json!(content)
                },
                "tool_calls": tool_calls,
            }),
            "tool_calls",
        )
    } else {
        (
            serde_json::json!({
                "role": "assistant",
                "content": response.content.unwrap_or_default(),
            }),
            "stop",
        )
    };

    let body = serde_json::json!({
        "id": completion_id,
        "object": "chat.completion",
        "created": created,
        "model": model,
        "choices": [{
            "index": 0,
            "message": message,
            "finish_reason": finish_reason
        }],
        "usage": {
            "prompt_tokens": 0,
            "completion_tokens": 0,
            "total_tokens": 0
        }
    });

    Ok(Json(body).into_response())
}

async fn complete_chat_completions(
    model: &str,
    messages: &[serde_json::Value],
) -> Result<Response, ApiError> {
    crate::local_metrics::begin_request(model);

    let content = if is_cloud_model(model) {
        let cancel = AtomicBool::new(false);
        let mut assembled = String::new();
        crate::providers::relay_chat_stream(model, messages, &cancel, |delta| {
            assembled.push_str(delta);
            Ok(())
        })
        .await
        .map_err(|e| ApiError::new(StatusCode::BAD_GATEWAY, e))?;
        assembled
    } else {
        complete_chat(model, messages)
            .await
            .map_err(|e| ApiError::new(StatusCode::BAD_GATEWAY, e))?
    };

    crate::local_metrics::finish_request();

    let completion_id = format!("chatcmpl-{}", Uuid::new_v4().simple());
    let created = chrono::Utc::now().timestamp();

    let body = serde_json::json!({
        "id": completion_id,
        "object": "chat.completion",
        "created": created,
        "model": model,
        "choices": [{
            "index": 0,
            "message": { "role": "assistant", "content": content },
            "finish_reason": "stop"
        }],
        "usage": {
            "prompt_tokens": 0,
            "completion_tokens": 0,
            "total_tokens": 0
        }
    });

    Ok(Json(body).into_response())
}

#[cfg(test)]
mod tests {
    use super::*;
    use axum::http::HeaderMap;

    #[test]
    fn resolve_project_id_without_header_uses_settings_fallback() {
        let headers = HeaderMap::new();
        let result = resolve_gateway_project_id(&headers);
        assert!(result.is_ok());
    }

    #[test]
    fn resolve_project_id_rejects_unknown_explicit_id() {
        let mut headers = HeaderMap::new();
        headers.insert(
            PROJECT_ID_HEADER,
            "projet-inexistant-xyz".parse().expect("header"),
        );
        let err = resolve_gateway_project_id(&headers).unwrap_err();
        assert!(err.contains("Projet introuvable"));
        assert!(err.contains("projet-inexistant-xyz"));
    }

    #[test]
    fn resolve_project_id_rejects_invalid_header_encoding() {
        let mut headers = HeaderMap::new();
        headers.insert(
            PROJECT_ID_HEADER,
            axum::http::HeaderValue::from_bytes(&[0x80]).expect("header"),
        );
        let err = resolve_gateway_project_id(&headers).unwrap_err();
        assert!(err.contains("encodage invalide"));
    }

    #[test]
    fn resolve_project_id_empty_header_falls_back_to_settings() {
        let mut headers = HeaderMap::new();
        headers.insert(PROJECT_ID_HEADER, "   ".parse().expect("header"));
        let result = resolve_gateway_project_id(&headers);
        assert!(result.is_ok());
    }

    #[test]
    fn normalize_openai_tool_matches_ollama_format() {
        let openai = serde_json::json!({
            "type": "function",
            "function": {
                "name": "read_file",
                "description": "Lit un fichier",
                "parameters": {
                    "type": "object",
                    "properties": { "path": { "type": "string" } },
                    "required": ["path"]
                }
            }
        });
        let normalized = normalize_openai_tool(&openai).expect("outil valide");
        assert_eq!(normalized["type"], "function");
        assert_eq!(normalized["function"]["name"], "read_file");
        assert_eq!(normalized["function"]["description"], "Lit un fichier");
    }

    #[test]
    fn resolve_gateway_tools_merges_local_definitions() {
        use crate::agent::LOCAL_TOOL_NAMES;

        let client_tools = vec![serde_json::json!({
            "type": "function",
            "function": {
                "name": "cursor_search",
                "description": "Recherche Cursor",
                "parameters": { "type": "object" }
            }
        })];
        let merged = resolve_gateway_tools(Some(&client_tools), true, None).expect("outils");
        assert_eq!(merged.len(), LOCAL_TOOL_NAMES.len() + 1);
        assert!(merged.iter().any(|t| t["function"]["name"] == "cursor_search"));
        for name in LOCAL_TOOL_NAMES {
            assert!(merged.iter().any(|t| t["function"]["name"] == *name));
        }
    }

    #[test]
    fn resolve_gateway_tools_respects_tool_choice_none() {
        let tools = vec![serde_json::json!({
            "type": "function",
            "function": {
                "name": "read_file",
                "parameters": { "type": "object" }
            }
        })];
        let choice = serde_json::json!("none");
        assert!(resolve_gateway_tools(Some(&tools), false, Some(&choice)).is_none());
    }

    #[test]
    fn format_tool_calls_serializes_arguments_as_json_string() {
        let calls = vec![ToolCall {
            name: "read_file".into(),
            arguments: serde_json::json!({ "path": "src/main.rs" }),
        }];
        let formatted = format_tool_calls_for_openai(&calls);
        assert_eq!(formatted.len(), 1);
        assert_eq!(formatted[0]["type"], "function");
        assert_eq!(formatted[0]["function"]["name"], "read_file");
        let args = formatted[0]["function"]["arguments"]
            .as_str()
            .expect("arguments string");
        let parsed: serde_json::Value = serde_json::from_str(args).expect("json valide");
        assert_eq!(parsed["path"], "src/main.rs");
    }

    #[test]
    fn parse_sse_line_skips_non_data_lines() {
        assert_eq!(parse_sse_line(": keep-alive"), SseLineEvent::Skip);
        assert_eq!(parse_sse_line(""), SseLineEvent::Skip);
        assert_eq!(parse_sse_line("event: ping"), SseLineEvent::Skip);
    }

    #[test]
    fn parse_sse_line_detects_done_marker() {
        assert_eq!(parse_sse_line("data: [DONE]"), SseLineEvent::Done);
        assert_eq!(parse_sse_line("data:[DONE]"), SseLineEvent::Done);
    }

    #[test]
    fn parse_sse_line_extracts_content_delta() {
        let line = r#"data: {"choices":[{"delta":{"content":"Bonjour"}}]}"#;
        assert_eq!(
            parse_sse_line(line),
            SseLineEvent::ContentDelta("Bonjour".into())
        );
    }

    #[test]
    fn parse_sse_line_skips_empty_delta_content() {
        let line = r#"data: {"choices":[{"delta":{"content":""}}]}"#;
        assert_eq!(parse_sse_line(line), SseLineEvent::Skip);
    }

    #[test]
    fn parse_sse_line_skips_malformed_json() {
        assert_eq!(parse_sse_line("data: {not-json"), SseLineEvent::Skip);
    }

    #[test]
    fn extract_bearer_token_parses_standard_header() {
        assert_eq!(
            extract_bearer_token("Bearer omoa_abc123"),
            Some("omoa_abc123")
        );
        assert_eq!(
            extract_bearer_token("bearer omoa_abc123"),
            Some("omoa_abc123")
        );
    }

    #[test]
    fn extract_bearer_token_rejects_missing_or_invalid_scheme() {
        assert_eq!(extract_bearer_token("Basic dXNlcjpwYXNz"), None);
        assert_eq!(extract_bearer_token("Bearer"), None);
        assert_eq!(extract_bearer_token("Bearer   "), None);
    }

    #[test]
    fn map_gateway_auth_token_reads_authorization_header() {
        let mut headers = HeaderMap::new();
        headers.insert(
            header::AUTHORIZATION,
            "Bearer omoa_test_token".parse().expect("header"),
        );
        assert_eq!(
            map_gateway_auth_token(&headers).expect("token"),
            "omoa_test_token"
        );
    }

    #[test]
    fn map_gateway_auth_token_requires_bearer_scheme() {
        let mut headers = HeaderMap::new();
        headers.insert(
            header::AUTHORIZATION,
            "Token omoa_test_token".parse().expect("header"),
        );
        let err = map_gateway_auth_token(&headers).unwrap_err();
        assert!(err.contains("Bearer"));
    }

    #[test]
    fn validate_gateway_bearer_accepts_matching_token() {
        let mut headers = HeaderMap::new();
        headers.insert(
            header::AUTHORIZATION,
            "Bearer omoa_secret".parse().expect("header"),
        );
        assert!(validate_gateway_bearer(&headers, "omoa_secret").is_ok());
    }

    #[test]
    fn validate_gateway_bearer_rejects_mismatch() {
        let mut headers = HeaderMap::new();
        headers.insert(
            header::AUTHORIZATION,
            "Bearer wrong".parse().expect("header"),
        );
        let err = validate_gateway_bearer(&headers, "omoa_secret").unwrap_err();
        assert!(err.contains("invalide"));
    }

    #[test]
    fn rate_limiter_allows_up_to_max_per_minute() {
        let limiter = GatewayRateLimiter::default();
        let token = "test-token";

        for _ in 0..5 {
            assert!(limiter.try_acquire(token, 5).is_ok());
        }
        assert!(limiter.try_acquire(token, 5).is_err());
    }

    #[test]
    fn rate_limiter_is_per_token() {
        let limiter = GatewayRateLimiter::default();

        for _ in 0..3 {
            assert!(limiter.try_acquire("token-a", 3).is_ok());
        }
        assert!(limiter.try_acquire("token-a", 3).is_err());
        assert!(limiter.try_acquire("token-b", 3).is_ok());
    }

    #[test]
    fn rate_limiter_zero_disables_limit() {
        let limiter = GatewayRateLimiter::default();
        for _ in 0..100 {
            assert!(limiter.try_acquire("any", 0).is_ok());
        }
    }

    #[test]
    fn rate_limit_token_key_uses_bearer_value() {
        let mut headers = HeaderMap::new();
        headers.insert(
            header::AUTHORIZATION,
            "Bearer omoa_abc123".parse().expect("header"),
        );
        assert_eq!(rate_limit_token_key(&headers), "omoa_abc123");
    }

    #[test]
    fn rate_limit_token_key_missing_uses_sentinel() {
        let headers = HeaderMap::new();
        assert_eq!(rate_limit_token_key(&headers), "__no_token__");
    }

    #[test]
    fn bind_socket_addr_localhost_by_default() {
        let addr = bind_socket_addr(&GatewayBindConfig {
            port: 8765,
            lan: false,
        });
        assert_eq!(addr, "127.0.0.1:8765");
    }

    #[test]
    fn bind_socket_addr_lan_uses_all_interfaces() {
        let addr = bind_socket_addr(&GatewayBindConfig {
            port: 9000,
            lan: true,
        });
        assert_eq!(addr, "0.0.0.0:9000");
    }

    #[test]
    fn client_base_url_localhost_uses_loopback() {
        let url = client_base_url(&GatewayBindConfig {
            port: 8765,
            lan: false,
        });
        assert_eq!(url, "http://127.0.0.1:8765/v1");
    }
}
