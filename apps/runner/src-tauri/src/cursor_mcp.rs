use crate::paths::{settings_dir, context_db_path_for};
use crate::settings::resolved_data_dir;
use serde::Serialize;
use serde_json::{json, Map, Value};
use std::path::{Path, PathBuf};

pub const OMOA_MCP_SERVER_KEY: &str = "omoa";
const MCP_ENTRY_SCRIPT: &str = "dist/index.js";
const MCP_PACKAGE_REL: &str = "packages/omoa-mcp-server";

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct CursorMcpPreview {
    pub config_json: String,
    pub server_path: Option<String>,
    pub server_found: bool,
    pub data_dir: String,
    pub context_db_path: String,
}

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct CursorMcpWriteResult {
    pub path: String,
    pub merged: bool,
    pub config_json: String,
}

fn walk_up_for_mcp_script(start: &Path) -> Option<PathBuf> {
    let mut current = start.to_path_buf();
    for _ in 0..12 {
        let candidate = current.join(MCP_PACKAGE_REL).join(MCP_ENTRY_SCRIPT);
        if candidate.is_file() {
            return Some(candidate);
        }
        if !current.pop() {
            break;
        }
    }
    None
}

/// Résout le script `dist/index.js` du serveur MCP OMOA.
pub fn resolve_omoa_mcp_server_script() -> Option<PathBuf> {
    if let Ok(path) = std::env::var("OMOA_MCP_SERVER_SCRIPT") {
        let trimmed = path.trim();
        if !trimmed.is_empty() {
            let candidate = PathBuf::from(trimmed);
            if candidate.is_file() {
                return Some(candidate);
            }
        }
    }

    let bundled = settings_dir()
        .join("bin")
        .join("omoa-mcp-server")
        .join(MCP_ENTRY_SCRIPT);
    if bundled.is_file() {
        return Some(bundled);
    }

    if let Ok(exe) = std::env::current_exe() {
        if let Some(exe_dir) = exe.parent() {
            for relative in [
                PathBuf::from("omoa-mcp-server").join(MCP_ENTRY_SCRIPT),
                PathBuf::from("resources")
                    .join("omoa-mcp-server")
                    .join(MCP_ENTRY_SCRIPT),
            ] {
                let candidate = exe_dir.join(relative);
                if candidate.is_file() {
                    return Some(candidate);
                }
            }
            if let Some(found) = walk_up_for_mcp_script(exe_dir) {
                return Some(found);
            }
        }
    }

    if let Ok(cwd) = std::env::current_dir() {
        if let Some(found) = walk_up_for_mcp_script(&cwd) {
            return Some(found);
        }
    }

    None
}

fn omoa_mcp_server_entry(server_script: &Path, data_dir: &Path) -> Value {
    let context_db = context_db_path_for(data_dir);
    let mut env = Map::new();
    env.insert(
        "OMOA_DATA_DIR".to_string(),
        json!(data_dir.to_string_lossy()),
    );
    if context_db.is_file() {
        env.insert(
            "OMOA_CONTEXT_DB".to_string(),
            json!(context_db.to_string_lossy()),
        );
    }

    json!({
        "command": "node",
        "args": [server_script.to_string_lossy()],
        "env": Value::Object(env),
    })
}

pub fn build_cursor_mcp_document() -> Result<Value, String> {
    let server_script = resolve_omoa_mcp_server_script().ok_or_else(|| {
        String::from(
            "Serveur MCP introuvable — exécutez « npm run build --workspace=@ownmyownai/omoa-mcp-server ».",
        )
    })?;
    let data_dir = resolved_data_dir();
    let entry = omoa_mcp_server_entry(&server_script, &data_dir);
    Ok(json!({
        "mcpServers": {
            OMOA_MCP_SERVER_KEY: entry
        }
    }))
}

pub fn preview_cursor_mcp_config() -> CursorMcpPreview {
    let data_dir = resolved_data_dir();
    let context_db = context_db_path_for(&data_dir);
    let server_path = resolve_omoa_mcp_server_script();
    let server_found = server_path.is_some();

    let config_json = if let Some(script) = server_path.as_ref() {
        let doc = json!({
            "mcpServers": {
                OMOA_MCP_SERVER_KEY: omoa_mcp_server_entry(script, &data_dir)
            }
        });
        serde_json::to_string_pretty(&doc).unwrap_or_default()
    } else {
        String::from(
            "{\n  \"mcpServers\": {\n    \"omoa\": {\n      \"error\": \"Serveur MCP non trouvé — build requis\"\n    }\n  }\n}",
        )
    };

    CursorMcpPreview {
        config_json,
        server_path: server_path.map(|p| p.to_string_lossy().into_owned()),
        server_found,
        data_dir: data_dir.to_string_lossy().into_owned(),
        context_db_path: context_db.to_string_lossy().into_owned(),
    }
}

fn merge_mcp_documents(existing: &Value, omoa_entry: Value) -> Value {
    let mut root = existing.as_object().cloned().unwrap_or_default();
    let mut servers = root
        .get("mcpServers")
        .and_then(|v| v.as_object().cloned())
        .unwrap_or_default();
    servers.insert(OMOA_MCP_SERVER_KEY.to_string(), omoa_entry);
    root.insert("mcpServers".to_string(), Value::Object(servers));
    Value::Object(root)
}

pub fn write_cursor_mcp_config(project_dir: &str) -> Result<CursorMcpWriteResult, String> {
    let project = PathBuf::from(project_dir.trim());
    if project.as_os_str().is_empty() {
        return Err("Dossier projet requis.".into());
    }
    if !project.is_dir() {
        return Err(format!("Dossier introuvable : {}", project.display()));
    }

    let server_script = resolve_omoa_mcp_server_script().ok_or_else(|| {
        String::from(
            "Serveur MCP introuvable — exécutez « npm run build --workspace=@ownmyownai/omoa-mcp-server ».",
        )
    })?;
    let data_dir = resolved_data_dir();
    let omoa_entry = omoa_mcp_server_entry(&server_script, &data_dir);

    let cursor_dir = project.join(".cursor");
    std::fs::create_dir_all(&cursor_dir).map_err(|e| {
        format!(
            "Impossible de créer {} : {e}",
            cursor_dir.display()
        )
    })?;

    let mcp_path = cursor_dir.join("mcp.json");
    let merged = mcp_path.is_file();
    let document = if merged {
        let raw = std::fs::read_to_string(&mcp_path)
            .map_err(|e| format!("Lecture {} : {e}", mcp_path.display()))?;
        let existing: Value = serde_json::from_str(&raw)
            .map_err(|e| format!("JSON invalide dans {} : {e}", mcp_path.display()))?;
        merge_mcp_documents(&existing, omoa_entry)
    } else {
        json!({
            "mcpServers": {
                OMOA_MCP_SERVER_KEY: omoa_entry
            }
        })
    };

    let config_json = serde_json::to_string_pretty(&document)
        .map_err(|e| format!("Sérialisation JSON : {e}"))?;
    std::fs::write(&mcp_path, format!("{config_json}\n"))
        .map_err(|e| format!("Écriture {} : {e}", mcp_path.display()))?;

    Ok(CursorMcpWriteResult {
        path: mcp_path.to_string_lossy().into_owned(),
        merged,
        config_json,
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
    fn merge_preserves_other_servers() {
        let existing = json!({
            "mcpServers": {
                "other": { "command": "echo", "args": ["hi"] }
            }
        });
        let omoa = json!({ "command": "node", "args": ["server.js"], "env": {} });
        let merged = merge_mcp_documents(&existing, omoa);
        let servers = merged["mcpServers"].as_object().unwrap();
        assert!(servers.contains_key("other"));
        assert!(servers.contains_key(OMOA_MCP_SERVER_KEY));
        assert_eq!(servers[OMOA_MCP_SERVER_KEY]["command"], "node");
    }

    #[test]
    fn write_creates_cursor_mcp_json() {
        let _guard = lock_tests();
        let dir = std::env::temp_dir().join(format!("omoa-mcp-wizard-{}", uuid::Uuid::new_v4()));
        fs::create_dir_all(&dir).unwrap();

        let script_dir = dir.join("packages/omoa-mcp-server/dist");
        fs::create_dir_all(&script_dir).unwrap();
        let script_path = script_dir.join("index.js");
        fs::write(&script_path, "// test").unwrap();

        let prev = std::env::var("OMOA_MCP_SERVER_SCRIPT").ok();
        std::env::set_var("OMOA_MCP_SERVER_SCRIPT", script_path.to_string_lossy().as_ref());

        let result = write_cursor_mcp_config(dir.to_str().unwrap());
        std::env::remove_var("OMOA_MCP_SERVER_SCRIPT");
        if let Some(value) = prev {
            std::env::set_var("OMOA_MCP_SERVER_SCRIPT", value);
        }

        let result = result.expect("write should succeed");
        assert!(!result.merged);
        assert!(result.path.ends_with(".cursor\\mcp.json") || result.path.ends_with(".cursor/mcp.json"));
        let written = fs::read_to_string(&result.path).unwrap();
        assert!(written.contains("\"omoa\""));
        assert!(written.contains("OMOA_DATA_DIR"));
        let _ = fs::remove_dir_all(&dir);
    }
}
