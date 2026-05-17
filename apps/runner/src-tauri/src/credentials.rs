use keyring::Entry;
use serde::{Deserialize, Serialize};

const SERVICE: &str = "app.ownmyownai.runner";
const ACCOUNT: &str = "default";

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct StoredCredentials {
    pub host_id: String,
    pub device_secret: String,
    /// URL Supabase (sauvegardée au pairing — le .exe n'a pas les variables Vite en runtime).
    #[serde(default)]
    pub supabase_url: Option<String>,
}

pub fn resolve_supabase_url(creds: &StoredCredentials) -> Result<String, String> {
    if let Some(url) = &creds.supabase_url {
        if !url.is_empty() {
            return Ok(url.trim_end_matches('/').to_string());
        }
    }

    if let Ok(url) = std::env::var("SUPABASE_URL").or_else(|_| std::env::var("VITE_SUPABASE_URL")) {
        return Ok(url.trim_end_matches('/').to_string());
    }

    if let Some(url) = option_env!("VITE_SUPABASE_URL") {
        return Ok(url.trim_end_matches('/').to_string());
    }

    Err("URL Supabase introuvable. Reliez ce PC depuis l'application.".into())
}

pub fn save_credentials(creds: &StoredCredentials) -> Result<(), String> {
    let json = serde_json::to_string(creds).map_err(|e| e.to_string())?;
    Entry::new(SERVICE, ACCOUNT)
        .map_err(|e| e.to_string())?
        .set_password(&json)
        .map_err(|e| e.to_string())
}

pub fn get_credentials() -> Result<Option<StoredCredentials>, String> {
    let entry = Entry::new(SERVICE, ACCOUNT).map_err(|e| e.to_string())?;
    match entry.get_password() {
        Ok(json) => {
            let creds: StoredCredentials = serde_json::from_str(&json).map_err(|e| e.to_string())?;
            Ok(Some(creds))
        }
        Err(keyring::Error::NoEntry) => Ok(None),
        Err(e) => Err(e.to_string()),
    }
}

pub fn delete_credentials() -> Result<(), String> {
    let entry = Entry::new(SERVICE, ACCOUNT).map_err(|e| e.to_string())?;
    match entry.delete_credential() {
        Ok(()) => Ok(()),
        Err(keyring::Error::NoEntry) => Ok(()),
        Err(e) => Err(e.to_string()),
    }
}
