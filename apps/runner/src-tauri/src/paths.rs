use std::path::{Path, PathBuf};

const APP_DIR: &str = "OwnMyOwnAI";
const HOST_SUBDIR: &str = "OwnMyOwnAI-Host";

/// Dossier de configuration bootstrap (toujours sous AppData).
pub fn settings_dir() -> PathBuf {
    dirs::data_local_dir()
        .unwrap_or_else(|| PathBuf::from("."))
        .join(APP_DIR)
}

pub fn settings_file_path() -> PathBuf {
    settings_dir().join("settings.json")
}

/// Emplacement par défaut proposé lors du premier lancement.
pub fn default_data_dir() -> PathBuf {
    dirs::data_local_dir()
        .unwrap_or_else(|| PathBuf::from("."))
        .join(APP_DIR)
}

/// Si l'utilisateur choisit la racine d'un disque (ex. `E:\`), on crée un sous-dossier dédié.
pub fn normalize_user_data_dir(picked: &Path) -> PathBuf {
    let picked = picked.to_path_buf();
    if is_drive_root(&picked) {
        picked.join(HOST_SUBDIR)
    } else {
        picked
    }
}

fn is_drive_root(path: &Path) -> bool {
    let s = path.to_string_lossy();
    let trimmed = s.trim_end_matches(['\\', '/']);
    trimmed.len() == 2 && trimmed.as_bytes().get(1) == Some(&b':')
}

pub fn ensure_host_data_layout(data_dir: &Path) -> Result<(), String> {
    std::fs::create_dir_all(data_dir).map_err(|e| e.to_string())?;
    for sub in ["models", "context", "creatives", "activity", "cache"] {
        std::fs::create_dir_all(data_dir.join(sub)).map_err(|e| e.to_string())?;
    }
    Ok(())
}

pub fn models_dir_for(data_dir: &Path) -> PathBuf {
    data_dir.join("models")
}

pub fn context_root_dir_for(data_dir: &Path) -> PathBuf {
    data_dir.join("context")
}

pub fn context_db_path_for(data_dir: &Path) -> PathBuf {
    data_dir.join("context.db")
}

pub fn context_encrypted_db_path_for(data_dir: &Path) -> PathBuf {
    data_dir.join("context.db.enc")
}

pub fn history_db_path_for(data_dir: &Path) -> PathBuf {
    data_dir.join("chat_history.db")
}

pub fn creatives_dir_for(data_dir: &Path) -> PathBuf {
    data_dir.join("creatives")
}

pub fn activity_dir_for(data_dir: &Path) -> PathBuf {
    data_dir.join("activity")
}

pub fn cache_dir_for(data_dir: &Path) -> PathBuf {
    data_dir.join("cache")
}

pub fn cloud_keys_path_for(data_dir: &Path) -> PathBuf {
    data_dir.join("cloud-keys.json")
}

pub fn sync_schedule_log_path_for(data_dir: &Path) -> PathBuf {
    activity_dir_for(data_dir).join("sync-schedule.log")
}

#[derive(Debug, Clone, serde::Serialize)]
#[serde(rename_all = "camelCase")]
pub struct HostDataLayout {
    pub data_dir: String,
    pub models_dir: String,
    pub context_dir: String,
    pub creatives_dir: String,
    pub activity_dir: String,
}

pub fn host_data_layout_for(data_dir: &Path) -> HostDataLayout {
    HostDataLayout {
        data_dir: data_dir.to_string_lossy().into_owned(),
        models_dir: models_dir_for(data_dir).to_string_lossy().into_owned(),
        context_dir: context_root_dir_for(data_dir).to_string_lossy().into_owned(),
        creatives_dir: creatives_dir_for(data_dir).to_string_lossy().into_owned(),
        activity_dir: activity_dir_for(data_dir).to_string_lossy().into_owned(),
    }
}
