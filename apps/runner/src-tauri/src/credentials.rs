use keyring::Entry;
use serde::{Deserialize, Serialize};
use std::path::PathBuf;

const SERVICE: &str = "app.ownmyownai.runner";
const ACCOUNT: &str = "default";
const APP_DIR: &str = "OwnMyOwnAI";
const CREDENTIALS_FILE: &str = "credentials.json";

fn credentials_file_path() -> Result<PathBuf, String> {
    dirs::data_local_dir()
        .map(|dir| dir.join(APP_DIR).join(CREDENTIALS_FILE))
        .ok_or_else(|| "Impossible de résoudre le dossier de données local".into())
}

fn read_credentials_file() -> Result<Option<StoredCredentials>, String> {
    let path = credentials_file_path()?;
    if !path.exists() {
        return Ok(None);
    }

    let json = std::fs::read_to_string(&path).map_err(|e| e.to_string())?;
    let creds: StoredCredentials = serde_json::from_str(&json).map_err(|e| e.to_string())?;
    Ok(Some(creds))
}

fn write_credentials_file(json: &str) -> Result<(), String> {
    let path = credentials_file_path()?;
    if let Some(parent) = path.parent() {
        std::fs::create_dir_all(parent).map_err(|e| e.to_string())?;
    }
    std::fs::write(&path, json).map_err(|e| e.to_string())
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct StoredCredentials {
    pub host_id: String,
    pub device_secret: String,
    /// URL Supabase (sauvegardée au pairing — le .exe n'a pas les variables Vite en runtime).
    #[serde(default)]
    pub supabase_url: Option<String>,
    /// Token Bearer pour la passerelle OpenAI locale (Cursor).
    #[serde(default, rename = "cursorApiToken")]
    pub cursor_api_token: Option<String>,
}

/// Génère un token opaque pour l'authentification Bearer de la passerelle Cursor.
pub fn generate_cursor_api_token() -> String {
    format!("omoa_{}", uuid::Uuid::new_v4().simple())
}

/// Renseigne `cursor_api_token` s'il est absent. Retourne `true` si un token a été créé.
pub fn ensure_cursor_api_token(creds: &mut StoredCredentials) -> bool {
    if creds
        .cursor_api_token
        .as_ref()
        .is_some_and(|t| !t.is_empty())
    {
        return false;
    }
    creds.cursor_api_token = Some(generate_cursor_api_token());
    true
}

/// Token attendu par la passerelle OpenAI locale, si le host est appairé.
pub fn cursor_api_token_for_gateway() -> Option<String> {
    get_credentials()
        .ok()
        .flatten()?
        .cursor_api_token
        .filter(|t| !t.is_empty())
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

    let keyring_result = Entry::new(SERVICE, ACCOUNT)
        .map_err(|e| e.to_string())?
        .set_password(&json);

    if keyring_result.is_ok() {
        let _ = write_credentials_file(&json);
        return Ok(());
    }

    write_credentials_file(&json)
}

fn load_credentials_raw() -> Result<Option<StoredCredentials>, String> {
    let entry = Entry::new(SERVICE, ACCOUNT).map_err(|e| e.to_string())?;
    match entry.get_password() {
        Ok(json) => {
            let creds: StoredCredentials = serde_json::from_str(&json).map_err(|e| e.to_string())?;
            return Ok(Some(creds));
        }
        Err(keyring::Error::NoEntry) => {}
        Err(e) => eprintln!("Keyring indisponible, repli fichier: {e}"),
    }

    read_credentials_file()
}

pub fn get_credentials() -> Result<Option<StoredCredentials>, String> {
    let mut creds = load_credentials_raw()?;
    if let Some(ref mut c) = creds {
        if ensure_cursor_api_token(c) {
            save_credentials(c)?;
        }
    }
    Ok(creds)
}

pub fn delete_credentials() -> Result<(), String> {
    let entry = Entry::new(SERVICE, ACCOUNT).map_err(|e| e.to_string())?;
    match entry.delete_credential() {
        Ok(()) => {}
        Err(keyring::Error::NoEntry) => {}
        Err(e) => eprintln!("Keyring delete: {e}"),
    }

    let path = credentials_file_path()?;
    if path.exists() {
        std::fs::remove_file(&path).map_err(|e| e.to_string())?;
    }

    Ok(())
}
