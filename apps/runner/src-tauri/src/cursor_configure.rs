use serde::Serialize;
use serde_json::{Map, Value};
use std::path::{Path, PathBuf};
use sysinfo::{ProcessesToUpdate, System};

/// Clés Cursor / VS Code utilisées pour l'override OpenAI (chat & plan).
pub const GATEWAY_KEYS: &[&str] = &[
    "openai.apiKey",
    "openai.baseUrl",
    "cursor.general.openAiKey",
    "cursor.general.openAiBaseUrl",
    "cursor.model",
    "model",
];

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct CursorConfigureResult {
    pub settings_path: String,
    pub backup_path: Option<String>,
    pub merged: bool,
    pub cursor_running: bool,
    pub gateway_enabled: bool,
    pub mcp_path: Option<String>,
    pub message: String,
}

/// Résout `%APPDATA%\Cursor\User\settings.json` (Windows) ou
/// `~/Library/Application Support/Cursor/User/settings.json` (macOS).
pub fn detect_cursor_settings_path() -> Result<PathBuf, String> {
    let config = dirs::config_dir()
        .ok_or_else(|| "Impossible de résoudre le dossier de configuration utilisateur.".to_string())?;
    let cursor_user = config.join("Cursor").join("User");
    if !cursor_user.is_dir() {
        return Err(
            "Cursor n'est pas installé ou n'a jamais été lancé — dossier User introuvable. \
             Installez Cursor puis ouvrez-le une fois avant de réessayer."
                .to_string(),
        );
    }
    Ok(cursor_user.join("settings.json"))
}

pub fn is_cursor_running() -> bool {
    let mut system = System::new();
    system.refresh_processes(ProcessesToUpdate::All, true);
    system.processes().values().any(|process| {
        let name = process.name().to_string_lossy();
        name.eq_ignore_ascii_case("Cursor.exe") || name == "Cursor"
    })
}

pub fn build_gateway_settings_patch(
    base_url: &str,
    api_token: &str,
    model: &str,
) -> Map<String, Value> {
    let mut patch = Map::new();
    patch.insert(
        "openai.apiKey".to_string(),
        Value::String(api_token.to_string()),
    );
    patch.insert(
        "openai.baseUrl".to_string(),
        Value::String(base_url.to_string()),
    );
    patch.insert(
        "cursor.general.openAiKey".to_string(),
        Value::String(api_token.to_string()),
    );
    patch.insert(
        "cursor.general.openAiBaseUrl".to_string(),
        Value::String(base_url.to_string()),
    );
    patch.insert(
        "cursor.model".to_string(),
        Value::String(model.to_string()),
    );
    patch.insert("model".to_string(), Value::String(model.to_string()));
    patch
}

pub fn merge_cursor_settings(existing: &Value, patch: &Map<String, Value>) -> Value {
    let mut root = existing
        .as_object()
        .cloned()
        .unwrap_or_default();
    for (key, value) in patch {
        root.insert(key.clone(), value.clone());
    }
    Value::Object(root)
}

pub fn settings_patch_to_pretty_json(patch: &Map<String, Value>) -> Result<String, String> {
    let value = Value::Object(patch.clone());
    serde_json::to_string_pretty(&value).map_err(|e| e.to_string())
}

pub fn read_cursor_settings() -> Result<(PathBuf, Value), String> {
    let path = detect_cursor_settings_path()?;
    let had_file = path.is_file();
    let content = if had_file {
        std::fs::read_to_string(&path)
            .map_err(|e| format!("Lecture de {} : {e}", path.display()))?
    } else {
        String::new()
    };

    let trimmed = content.trim();
    let value = if trimmed.is_empty() {
        Value::Object(Map::new())
    } else {
        serde_json::from_str(trimmed)
            .map_err(|e| format!("JSON invalide dans {} : {e}", path.display()))?
    };

    Ok((path, value))
}

fn backup_settings_if_needed(path: &Path) -> Result<Option<PathBuf>, String> {
    if !path.is_file() {
        return Ok(None);
    }

    let backup = path
        .parent()
        .ok_or_else(|| "Chemin settings.json sans dossier parent.".to_string())?
        .join("settings.json.bak");

    if backup.is_file() {
        return Ok(Some(backup));
    }

    std::fs::copy(path, &backup)
        .map_err(|e| format!("Sauvegarde {} : {e}", backup.display()))?;
    Ok(Some(backup))
}

pub fn apply_cursor_gateway_config(
    base_url: &str,
    api_token: &str,
    model: &str,
) -> Result<(PathBuf, Option<PathBuf>, bool), String> {
    let (path, existing) = read_cursor_settings()?;
    let had_file = path.is_file();
    let backup_path = backup_settings_if_needed(&path)?;

    let patch = build_gateway_settings_patch(base_url, api_token, model);
    let merged = merge_cursor_settings(&existing, &patch);
    let pretty = serde_json::to_string_pretty(&merged).map_err(|e| e.to_string())?;

    if let Some(parent) = path.parent() {
        std::fs::create_dir_all(parent).map_err(|e| e.to_string())?;
    }
    std::fs::write(&path, format!("{pretty}\n"))
        .map_err(|e| format!("Écriture de {} : {e}", path.display()))?;

    Ok((path, backup_path, had_file))
}

pub fn configure_cursor_one_click(
    base_url: &str,
    api_token: &str,
    model: &str,
    project_dir: Option<&str>,
) -> Result<CursorConfigureResult, String> {
    let (settings_path, backup_path, merged) =
        apply_cursor_gateway_config(base_url, api_token, model)?;
    let cursor_running = is_cursor_running();

    let mcp_path = if let Some(dir) = project_dir.filter(|d| !d.trim().is_empty()) {
        match crate::cursor_mcp::write_cursor_mcp_config(dir) {
            Ok(result) => Some(result.path),
            Err(error) => {
                return Err(format!(
                    "Paramètres Cursor écrits, mais échec MCP : {error}"
                ));
            }
        }
    } else {
        None
    };

    let mut message = String::from(
        "Configuration Cursor appliquée — URL, token et modèle OwnMyOwnAI enregistrés.",
    );
    if let Some(ref mcp) = mcp_path {
        message.push_str(&format!(" MCP ajouté dans {mcp}."));
    }
    if cursor_running {
        message.push_str(
            " Cursor est ouvert : redémarrez-le (ou rechargez la fenêtre) pour prendre en compte les changements.",
        );
    } else {
        message.push_str(" Ouvrez Cursor et sélectionnez le modèle configuré dans Paramètres → Models.");
    }

    Ok(CursorConfigureResult {
        settings_path: settings_path.to_string_lossy().into_owned(),
        backup_path: backup_path.map(|p| p.to_string_lossy().into_owned()),
        merged,
        cursor_running,
        gateway_enabled: true,
        mcp_path,
        message,
    })
}

#[cfg(test)]
mod tests {
    use super::*;
    use std::fs;
    use std::sync::{Mutex, OnceLock};

    static TEST_MUTEX: OnceLock<Mutex<()>> = OnceLock::new();

    fn lock_tests() -> std::sync::MutexGuard<'static, ()> {
        TEST_MUTEX.get_or_init(|| Mutex::new(())).lock().unwrap()
    }

    #[test]
    fn merge_preserves_unrelated_keys() {
        let existing = serde_json::json!({
            "editor.fontSize": 14,
            "workbench.colorTheme": "Default Dark+"
        });
        let patch = build_gateway_settings_patch(
            "http://127.0.0.1:8765/v1",
            "omoa_test_token",
            "qwen2.5:7b",
        );
        let merged = merge_cursor_settings(&existing, &patch);
        let obj = merged.as_object().unwrap();
        assert_eq!(obj["editor.fontSize"], 14);
        assert_eq!(obj["workbench.colorTheme"], "Default Dark+");
        assert_eq!(obj["openai.baseUrl"], "http://127.0.0.1:8765/v1");
        assert_eq!(obj["cursor.model"], "qwen2.5:7b");
    }

    #[test]
    fn merge_overwrites_gateway_keys() {
        let existing = serde_json::json!({
            "openai.baseUrl": "http://old.example/v1",
            "openai.apiKey": "old-key"
        });
        let patch = build_gateway_settings_patch(
            "http://127.0.0.1:8765/v1",
            "omoa_new",
            "llama3.2:3b",
        );
        let merged = merge_cursor_settings(&existing, &patch);
        assert_eq!(merged["openai.baseUrl"], "http://127.0.0.1:8765/v1");
        assert_eq!(merged["openai.apiKey"], "omoa_new");
        assert_eq!(merged["model"], "llama3.2:3b");
    }

    #[test]
    fn merge_on_empty_object() {
        let patch = build_gateway_settings_patch("http://127.0.0.1:8765/v1", "tok", "m");
        let merged = merge_cursor_settings(&Value::Object(Map::new()), &patch);
        for key in GATEWAY_KEYS {
            assert!(merged.get(*key).is_some(), "missing key {key}");
        }
    }

    #[test]
    fn apply_writes_settings_and_backup() {
        let _guard = lock_tests();
        let root = std::env::temp_dir().join(format!("omoa-cursor-cfg-{}", uuid::Uuid::new_v4()));
        let user_dir = root.join("Cursor").join("User");
        fs::create_dir_all(&user_dir).unwrap();
        let settings_path = user_dir.join("settings.json");
        fs::write(&settings_path, r#"{"editor.fontSize": 12}"#).unwrap();

        let existing: Value =
            serde_json::from_str(&fs::read_to_string(&settings_path).unwrap()).unwrap();
        let patch = build_gateway_settings_patch(
            "http://127.0.0.1:8765/v1",
            "omoa_abc",
            "qwen2.5:7b",
        );
        let merged = merge_cursor_settings(&existing, &patch);
        fs::write(
            &settings_path,
            format!("{}\n", serde_json::to_string_pretty(&merged).unwrap()),
        )
        .unwrap();

        let backup = user_dir.join("settings.json.bak");
        fs::copy(&settings_path, &backup).unwrap();
        let written: Value =
            serde_json::from_str(&fs::read_to_string(&settings_path).unwrap()).unwrap();
        assert_eq!(written["openai.baseUrl"], "http://127.0.0.1:8765/v1");
        assert_eq!(written["editor.fontSize"], 12);
        let _ = fs::remove_dir_all(&root);
    }

    #[test]
    fn invalid_json_is_rejected() {
        let raw = "{ not json";
        let err = serde_json::from_str::<Value>(raw).unwrap_err();
        assert!(!err.to_string().is_empty());
    }
}
