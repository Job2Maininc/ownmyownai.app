use crate::context::ContextLimits;
use serde::{Deserialize, Serialize};
use std::path::PathBuf;

const APP_DIR: &str = "OwnMyOwnAI";
const SETTINGS_FILE: &str = "settings.json";
pub const FALLBACK_DEFAULT_MODEL: &str = "llama3.2:3b";

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct ContextLimitsSettings {
    #[serde(default = "default_max_bases")]
    pub max_bases: u32,
    #[serde(default = "default_max_docs_per_base")]
    pub max_docs_per_base: u32,
    #[serde(default = "default_max_file_mb")]
    pub max_file_mb: u32,
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

impl Default for ContextLimitsSettings {
    fn default() -> Self {
        Self {
            max_bases: default_max_bases(),
            max_docs_per_base: default_max_docs_per_base(),
            max_file_mb: default_max_file_mb(),
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
pub struct HostSettings {
    #[serde(default = "default_models_dir")]
    pub models_dir: String,
    #[serde(default = "default_selected_models")]
    pub selected_models: Vec<String>,
    #[serde(default = "default_model_id")]
    pub default_model: String,
    #[serde(default)]
    pub context_limits: ContextLimitsSettings,
    /// Si true, plusieurs onglets web peuvent chatter en parallèle sur ce host.
    #[serde(default)]
    pub allow_multi_session: bool,
    #[serde(default = "default_rag_top_k")]
    pub rag_top_k: u32,
    #[serde(default = "default_rag_chunk_tokens")]
    pub rag_chunk_tokens: u32,
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
            context_limits: ContextLimitsSettings::default(),
            allow_multi_session: false,
            rag_top_k: default_rag_top_k(),
            rag_chunk_tokens: default_rag_chunk_tokens(),
        }
    }
}

pub fn resolved_context_limits() -> ContextLimits {
    get_settings()
        .map(|s| ContextLimits::from(&s.context_limits))
        .unwrap_or_default()
}

pub fn allow_multi_session() -> bool {
    get_settings()
        .map(|s| s.allow_multi_session)
        .unwrap_or(false)
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

    if !settings.selected_models.contains(&settings.default_model) {
        return Err("Le modèle par défaut doit faire partie de la sélection".into());
    }

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
