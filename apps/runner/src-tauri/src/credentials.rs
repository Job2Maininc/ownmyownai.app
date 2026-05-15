use keyring::Entry;
use serde::{Deserialize, Serialize};

const SERVICE: &str = "app.ownmyownai.runner";
const ACCOUNT: &str = "default";

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct StoredCredentials {
    pub host_id: String,
    pub device_secret: String,
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
