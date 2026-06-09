use crate::context::ContextLimits;
use serde::{Deserialize, Serialize};
use std::collections::HashMap;
use std::path::PathBuf;

const APP_DIR: &str = "OwnMyOwnAI";
const SETTINGS_FILE: &str = "settings.json";
pub const FALLBACK_DEFAULT_MODEL: &str = "llama3.2:3b";
pub const FALLBACK_VISION_MODEL: &str = "moondream:1.8b";

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct ContextLimitsSettings {
    #[serde(default = "default_max_bases")]
    pub max_bases: u32,
    #[serde(default = "default_max_docs_per_base")]
    pub max_docs_per_base: u32,
    #[serde(default = "default_max_file_mb")]
    pub max_file_mb: u32,
    #[serde(default = "default_max_scan_files")]
    pub max_scan_files: u32,
    #[serde(default = "default_max_scan_depth")]
    pub max_scan_depth: u32,
    #[serde(default = "default_sync_debounce_ms")]
    pub sync_debounce_ms: u64,
    #[serde(default = "default_allowed_extensions")]
    pub default_allowed_extensions: Vec<String>,
}

fn default_allowed_extensions() -> Vec<String> {
    default_allowed_extensions_list()
}

fn default_max_bases() -> u32 {
    10
}
fn default_max_docs_per_base() -> u32 {
    50
}
fn default_max_file_mb() -> u32 {
    10
}

fn default_max_scan_files() -> u32 {
    500
}

fn default_max_scan_depth() -> u32 {
    8
}

fn default_sync_debounce_ms() -> u64 {
    3000
}

/// Extensions extractibles par l'ingestion (sous-ensemble autorisé pour les liens).
pub const EXTRACTABLE_EXTENSIONS: &[&str] =
    &["txt", "md", "pdf", "docx", "png", "jpg", "jpeg"];

pub fn default_allowed_extensions_list() -> Vec<String> {
    EXTRACTABLE_EXTENSIONS
        .iter()
        .map(|s| (*s).to_string())
        .collect()
}

pub fn normalize_allowed_extensions(exts: &[String]) -> Result<Vec<String>, String> {
    if exts.is_empty() {
        return Err("Au moins une extension requise".into());
    }
    let mut out = Vec::new();
    for ext in exts {
        let e = ext.trim().trim_start_matches('.').to_lowercase();
        if e.is_empty() {
            continue;
        }
        if !EXTRACTABLE_EXTENSIONS.contains(&e.as_str()) {
            return Err(format!(
                "Extension non supportée : {e}. Extensions acceptées : {}",
                EXTRACTABLE_EXTENSIONS.join(", ")
            ));
        }
        if !out.contains(&e) {
            out.push(e);
        }
    }
    if out.is_empty() {
        return Err("Au moins une extension requise".into());
    }
    Ok(out)
}

impl Default for ContextLimitsSettings {
    fn default() -> Self {
        Self {
            max_bases: default_max_bases(),
            max_docs_per_base: default_max_docs_per_base(),
            max_file_mb: default_max_file_mb(),
            max_scan_files: default_max_scan_files(),
            max_scan_depth: default_max_scan_depth(),
            sync_debounce_ms: default_sync_debounce_ms(),
            default_allowed_extensions: default_allowed_extensions(),
        }
    }
}

#[derive(Debug, Clone)]
pub struct SyncScanSettings {
    pub max_scan_files: u32,
    pub max_scan_depth: u32,
    pub sync_debounce_ms: u64,
}

impl Default for SyncScanSettings {
    fn default() -> Self {
        Self {
            max_scan_files: default_max_scan_files(),
            max_scan_depth: default_max_scan_depth(),
            sync_debounce_ms: default_sync_debounce_ms(),
        }
    }
}

impl From<&ContextLimitsSettings> for ContextLimits {
    fn from(s: &ContextLimitsSettings) -> Self {
        Self {
            max_bases: s.max_bases,
            max_docs_per_base: s.max_docs_per_base,
            max_file_mb: s.max_file_mb,
        }
    }
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct CloudProviderToggle {
    #[serde(default)]
    pub enabled: bool,
}

impl Default for CloudProviderToggle {
    fn default() -> Self {
        Self { enabled: false }
    }
}

/// Serveur MCP externe lancé côté Host (stdio JSON-RPC). Le builtin `builtin-fs` est toujours actif.
#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct McpServerConfig {
    pub id: String,
    pub name: String,
    pub command: String,
    #[serde(default)]
    pub args: Vec<String>,
    #[serde(default)]
    pub env: HashMap<String, String>,
    #[serde(default)]
    pub enabled: bool,
    #[serde(default)]
    pub builtin: bool,
}

#[derive(Debug, Clone, Serialize, Deserialize, Default)]
#[serde(rename_all = "camelCase")]
pub struct CloudProvidersSettings {
    #[serde(default)]
    pub openai: CloudProviderToggle,
    #[serde(default)]
    pub anthropic: CloudProviderToggle,
}

#[derive(Debug, Clone, Serialize, Deserialize, Default)]
#[serde(rename_all = "camelCase")]
pub struct ModelTaskRouting {
    /// Petit modèle pour résumés / synthèses (ex. llama3.2:3b).
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub summary_model: Option<String>,
    /// Gros modèle pour rédaction (ex. llama3.1:8b).
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub writing_model: Option<String>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct ScheduledSyncSettings {
    /// Active la resynchronisation planifiée des liens de contexte.
    #[serde(default)]
    pub enabled: bool,
    /// Expression cron 5 champs (`minute heure jour mois dow`). Ex. `0 3 * * *` = 03:00 chaque jour.
    #[serde(default = "default_scheduled_sync_cron")]
    pub cron: String,
}

fn default_scheduled_sync_cron() -> String {
    "0 3 * * *".to_string()
}

impl Default for ScheduledSyncSettings {
    fn default() -> Self {
        Self {
            enabled: false,
            cron: default_scheduled_sync_cron(),
        }
    }
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct HostSettings {
    #[serde(default = "default_models_dir")]
    pub models_dir: String,
    #[serde(default = "default_selected_models")]
    pub selected_models: Vec<String>,
    #[serde(default = "default_model_id")]
    pub default_model: String,
    #[serde(default)]
    pub model_routing: ModelTaskRouting,
    #[serde(default)]
    pub context_limits: ContextLimitsSettings,
    #[serde(default = "default_rag_top_k")]
    pub rag_top_k: u32,
    #[serde(default = "default_rag_chunk_tokens")]
    pub rag_chunk_tokens: u32,
    /// Modèle dédié au mode réflexion si le modèle sélectionné ne le supporte pas.
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub thinking_model: Option<String>,
    #[serde(default)]
    pub scheduled_sync: ScheduledSyncSettings,
    /// Projet actif (bases de contexte et règles injectées au chat).
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub active_project_id: Option<String>,
    /// Fournisseurs cloud optionnels (OpenAI, Anthropic) — clés en keyring Host.
    #[serde(default)]
    pub cloud_providers: CloudProvidersSettings,
    /// Mémoire utilisateur opt-in : injection sélective au chat.
    #[serde(default)]
    pub user_memory_enabled: bool,
    /// Toasts Windows à la fin d'une indexation ou d'un agent.
    #[serde(default = "default_desktop_notifications")]
    pub desktop_notifications: bool,
    /// Serveurs MCP optionnels (ex. `npx -y @modelcontextprotocol/server-filesystem <path>`).
    #[serde(default)]
    pub mcp_servers: Vec<McpServerConfig>,
    /// Modèle Ollama vision pour décrire les images liées et les questions multimodales.
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub vision_model: Option<String>,
    /// Modèle secours si le modèle demandé est absent ou trop lent.
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub fallback_model: Option<String>,
    /// Mode air-gapped : pas de relay, heartbeat ni cloud — chat local Host uniquement.
    #[serde(default)]
    pub air_gapped: bool,
    /// Seuil de tokens estimés avant compaction automatique de l'historique chat.
    #[serde(default = "default_chat_token_threshold")]
    pub chat_token_threshold: u32,
    /// Nombre de messages récents conservés verbatim après compaction.
    #[serde(default = "default_chat_recent_messages")]
    pub chat_recent_messages: u32,
}

fn default_chat_token_threshold() -> u32 {
    6_000
}

fn default_chat_recent_messages() -> u32 {
    12
}

fn default_desktop_notifications() -> bool {
    true
}

fn default_rag_top_k() -> u32 {
    5
}

fn default_rag_chunk_tokens() -> u32 {
    400
}

fn default_models_dir() -> String {
    default_ollama_models_path()
        .to_string_lossy()
        .into_owned()
}

fn default_selected_models() -> Vec<String> {
    vec![FALLBACK_DEFAULT_MODEL.to_string()]
}

fn default_model_id() -> String {
    FALLBACK_DEFAULT_MODEL.to_string()
}

impl Default for HostSettings {
    fn default() -> Self {
        Self {
            models_dir: default_models_dir(),
            selected_models: default_selected_models(),
            default_model: default_model_id(),
            model_routing: ModelTaskRouting::default(),
            context_limits: ContextLimitsSettings::default(),
            rag_top_k: default_rag_top_k(),
            rag_chunk_tokens: default_rag_chunk_tokens(),
            thinking_model: None,
            scheduled_sync: ScheduledSyncSettings::default(),
            active_project_id: None,
            cloud_providers: CloudProvidersSettings::default(),
            user_memory_enabled: false,
            desktop_notifications: default_desktop_notifications(),
            mcp_servers: Vec::new(),
            vision_model: None,
            fallback_model: None,
            air_gapped: false,
            chat_token_threshold: default_chat_token_threshold(),
            chat_recent_messages: default_chat_recent_messages(),
        }
    }
}

pub fn resolved_vision_model_setting() -> Option<String> {
    get_settings().ok().and_then(|s| s.vision_model)
}

pub fn desktop_notifications_enabled() -> bool {
    get_settings()
        .map(|s| s.desktop_notifications)
        .unwrap_or(true)
}

pub fn user_memory_enabled() -> bool {
    get_settings()
        .map(|s| s.user_memory_enabled)
        .unwrap_or(false)
}

pub fn air_gapped_enabled() -> bool {
    get_settings()
        .map(|s| s.air_gapped)
        .unwrap_or(false)
}

pub fn set_user_memory_enabled(enabled: bool) -> Result<(), String> {
    let mut settings = get_settings().unwrap_or_default();
    settings.user_memory_enabled = enabled;
    save_settings(&settings)
}

fn is_cloud_model_id(model: &str) -> bool {
    model.starts_with("openai:") || model.starts_with("anthropic:")
}

pub fn resolved_scheduled_sync() -> ScheduledSyncSettings {
    get_settings()
        .map(|s| s.scheduled_sync)
        .unwrap_or_default()
}

fn validate_scheduled_sync(settings: &ScheduledSyncSettings) -> Result<(), String> {
    if !settings.enabled {
        return Ok(());
    }
    crate::sync_schedule::parse_cron_expression(&settings.cron)?;
    Ok(())
}

pub fn resolved_thinking_model(fallback: &str) -> String {
    get_settings()
        .ok()
        .and_then(|s| s.thinking_model.clone().filter(|m| !m.is_empty()))
        .unwrap_or_else(|| fallback.to_string())
}

pub fn resolved_context_limits() -> ContextLimits {
    get_settings()
        .map(|s| ContextLimits::from(&s.context_limits))
        .unwrap_or_default()
}

pub fn resolved_default_allowed_extensions() -> Vec<String> {
    get_settings()
        .map(|s| {
            normalize_allowed_extensions(&s.context_limits.default_allowed_extensions)
                .unwrap_or_else(|_| default_allowed_extensions_list())
        })
        .unwrap_or_else(|_| default_allowed_extensions_list())
}

pub fn resolved_sync_scan_settings() -> SyncScanSettings {
    get_settings()
        .map(|s| SyncScanSettings {
            max_scan_files: s.context_limits.max_scan_files,
            max_scan_depth: s.context_limits.max_scan_depth,
            sync_debounce_ms: s.context_limits.sync_debounce_ms,
        })
        .unwrap_or_default()
}

pub fn resolved_rag_top_k() -> usize {
    get_settings()
        .map(|s| s.rag_top_k.max(1) as usize)
        .unwrap_or(5)
}

pub fn resolved_rag_chunk_tokens() -> usize {
    get_settings()
        .map(|s| s.rag_chunk_tokens.max(50) as usize)
        .unwrap_or(400)
}

pub fn default_ollama_models_path() -> PathBuf {
    if let Ok(home) = std::env::var("USERPROFILE") {
        return PathBuf::from(home).join(".ollama").join("models");
    }
    dirs::home_dir()
        .unwrap_or_else(|| PathBuf::from("."))
        .join(".ollama")
        .join("models")
}

fn settings_file_path() -> Result<PathBuf, String> {
    dirs::data_local_dir()
        .map(|dir| dir.join(APP_DIR).join(SETTINGS_FILE))
        .ok_or_else(|| "Impossible de résoudre le dossier de données local".into())
}

pub fn get_settings() -> Result<HostSettings, String> {
    let path = settings_file_path()?;
    if !path.exists() {
        return Ok(HostSettings::default());
    }

    let json = std::fs::read_to_string(&path).map_err(|e| e.to_string())?;
    let settings: HostSettings = serde_json::from_str(&json).map_err(|e| e.to_string())?;
    Ok(settings)
}

pub fn save_settings(settings: &HostSettings) -> Result<(), String> {
    if settings.selected_models.is_empty() {
        return Err("Sélectionnez au moins un modèle".into());
    }

    if !settings.selected_models.contains(&settings.default_model)
        && !is_cloud_model_id(&settings.default_model)
    {
        return Err("Le modèle par défaut doit faire partie de la sélection".into());
    }

    validate_scheduled_sync(&settings.scheduled_sync)?;

    let models_path = PathBuf::from(&settings.models_dir);
    std::fs::create_dir_all(&models_path).map_err(|e| {
        format!(
            "Impossible de créer le dossier des modèles ({}): {e}",
            models_path.display()
        )
    })?;

    let path = settings_file_path()?;
    if let Some(parent) = path.parent() {
        std::fs::create_dir_all(parent).map_err(|e| e.to_string())?;
    }

    let json = serde_json::to_string_pretty(settings).map_err(|e| e.to_string())?;
    std::fs::write(&path, json).map_err(|e| e.to_string())?;
    Ok(())
}

pub fn get_active_project_id() -> Result<Option<String>, String> {
    get_settings().map(|s| s.active_project_id)
}

pub fn set_active_project_id(id: Option<String>) -> Result<(), String> {
    let mut settings = get_settings()?;
    settings.active_project_id = id;
    save_settings(&settings)
}

pub fn resolved_default_model() -> String {
    get_settings()
        .map(|s| s.default_model)
        .unwrap_or_else(|_| FALLBACK_DEFAULT_MODEL.to_string())
}

pub fn resolved_models_dir() -> PathBuf {
    get_settings()
        .map(|s| PathBuf::from(s.models_dir))
        .unwrap_or_else(|_| default_ollama_models_path())
}
