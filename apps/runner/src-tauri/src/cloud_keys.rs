use keyring::Entry;
use std::path::PathBuf;

const SERVICE: &str = "app.ownmyownai.runner";
const APP_DIR: &str = "OwnMyOwnAI";
const CLOUD_KEYS_FILE: &str = "cloud-keys.json";

#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub enum CloudProviderId {
    OpenAi,
    Anthropic,
}

impl CloudProviderId {
    pub fn from_str_id(id: &str) -> Option<Self> {
        match id {
            "openai" => Some(Self::OpenAi),
            "anthropic" => Some(Self::Anthropic),
            _ => None,
        }
    }

    pub fn as_str(self) -> &'static str {
        match self {
            Self::OpenAi => "openai",
            Self::Anthropic => "anthropic",
        }
    }

    pub fn keyring_account(self) -> String {
        format!("cloud:{}", self.as_str())
    }
}

fn cloud_keys_file_path() -> Result<PathBuf, String> {
    Ok(crate::settings::resolved_cloud_keys_path())
}

fn read_cloud_keys_file() -> Result<serde_json::Map<String, serde_json::Value>, String> {
    let path = cloud_keys_file_path()?;
    if !path.exists() {
        return Ok(serde_json::Map::new());
    }
    let json = std::fs::read_to_string(&path).map_err(|e| e.to_string())?;
    serde_json::from_str(&json).map_err(|e| e.to_string())
}

fn write_cloud_keys_file(map: &serde_json::Map<String, serde_json::Value>) -> Result<(), String> {
    let path = cloud_keys_file_path()?;
    if let Some(parent) = path.parent() {
        std::fs::create_dir_all(parent).map_err(|e| e.to_string())?;
    }
    let json = serde_json::to_string(map).map_err(|e| e.to_string())?;
    std::fs::write(&path, json).map_err(|e| e.to_string())
}

pub fn save_provider_api_key(provider: CloudProviderId, api_key: &str) -> Result<(), String> {
    let trimmed = api_key.trim();
    if trimmed.is_empty() {
        return Err("La clé API ne peut pas être vide".into());
    }

    let keyring_result = Entry::new(SERVICE, &provider.keyring_account())
        .map_err(|e| e.to_string())?
        .set_password(trimmed);

    if keyring_result.is_ok() {
        let mut map = read_cloud_keys_file().unwrap_or_default();
        map.insert(
            provider.as_str().to_string(),
            serde_json::Value::String(trimmed.to_string()),
        );
        let _ = write_cloud_keys_file(&map);
        return Ok(());
    }

    let mut map = read_cloud_keys_file().unwrap_or_default();
    map.insert(
        provider.as_str().to_string(),
        serde_json::Value::String(trimmed.to_string()),
    );
    write_cloud_keys_file(&map)
}

pub fn get_provider_api_key(provider: CloudProviderId) -> Result<Option<String>, String> {
    let entry = Entry::new(SERVICE, &provider.keyring_account()).map_err(|e| e.to_string())?;
    match entry.get_password() {
        Ok(key) if !key.trim().is_empty() => return Ok(Some(key)),
        Ok(_) => {}
        Err(keyring::Error::NoEntry) => {}
        Err(e) => eprintln!("Keyring cloud indisponible, repli fichier: {e}"),
    }

    let map = read_cloud_keys_file()?;
    Ok(map
        .get(provider.as_str())
        .and_then(|v| v.as_str())
        .filter(|s| !s.trim().is_empty())
        .map(String::from))
}

pub fn delete_provider_api_key(provider: CloudProviderId) -> Result<(), String> {
    let entry = Entry::new(SERVICE, &provider.keyring_account()).map_err(|e| e.to_string())?;
    match entry.delete_credential() {
        Ok(()) => {}
        Err(keyring::Error::NoEntry) => {}
        Err(e) => eprintln!("Keyring cloud delete: {e}"),
    }

    let mut map = read_cloud_keys_file().unwrap_or_default();
    map.remove(provider.as_str());
    if map.is_empty() {
        let path = cloud_keys_file_path()?;
        if path.exists() {
            std::fs::remove_file(&path).map_err(|e| e.to_string())?;
        }
    } else {
        write_cloud_keys_file(&map)?;
    }
    Ok(())
}

pub fn has_provider_api_key(provider: CloudProviderId) -> bool {
    get_provider_api_key(provider)
        .ok()
        .flatten()
        .is_some()
}
