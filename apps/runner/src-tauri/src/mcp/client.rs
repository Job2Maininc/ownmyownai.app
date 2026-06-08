use crate::process::command_hidden;
use serde_json::{json, Value};
use std::collections::HashMap;
use std::io::{BufRead, BufReader, Write};
use std::process::{Child, ChildStdin, Stdio};
use std::sync::atomic::{AtomicU64, Ordering};
use std::sync::{Mutex, OnceLock};
use std::time::Duration;

use super::McpServerConfig;

static NEXT_ID: AtomicU64 = AtomicU64::new(1);
static SESSIONS: OnceLock<Mutex<HashMap<String, McpSession>>> = OnceLock::new();

fn sessions() -> &'static Mutex<HashMap<String, McpSession>> {
    SESSIONS.get_or_init(|| Mutex::new(HashMap::new()))
}

struct McpSession {
    child: Child,
    stdin: ChildStdin,
    stdout: BufReader<std::process::ChildStdout>,
}

impl McpSession {
    fn spawn(config: &McpServerConfig) -> Result<Self, String> {
        validate_external_command(config)?;

        let mut child = command_hidden(&config.command);
        child.args(&config.args);
        child.stdin(Stdio::piped());
        child.stdout(Stdio::piped());
        child.stderr(Stdio::null());
        for (key, value) in &config.env {
            child.env(key, value);
        }

        let mut child = child.spawn().map_err(|e| {
            format!(
                "Impossible de lancer le serveur MCP « {} » : {e}",
                config.name
            )
        })?;

        let stdin = child
            .stdin
            .take()
            .ok_or_else(|| "stdin MCP indisponible".to_string())?;
        let stdout = child
            .stdout
            .take()
            .ok_or_else(|| "stdout MCP indisponible".to_string())?;

        let mut session = Self {
            child,
            stdin,
            stdout: BufReader::new(stdout),
        };
        session.initialize()?;
        Ok(session)
    }

    fn initialize(&mut self) -> Result<(), String> {
        let id = NEXT_ID.fetch_add(1, Ordering::SeqCst);
        let params = json!({
            "protocolVersion": "2024-11-05",
            "capabilities": {},
            "clientInfo": {
                "name": "ownmyownai-host",
                "version": "0.2.0"
            }
        });
        self.request_with_id(id, "initialize", params)?;

        let notification = json!({
            "jsonrpc": "2.0",
            "method": "notifications/initialized"
        });
        self.write_line(&notification)?;
        Ok(())
    }

    fn write_line(&mut self, value: &Value) -> Result<(), String> {
        let line = serde_json::to_string(value).map_err(|e| e.to_string())?;
        self.stdin
            .write_all(line.as_bytes())
            .and_then(|_| self.stdin.write_all(b"\n"))
            .map_err(|e| format!("Écriture MCP échouée : {e}"))?;
        self.stdin
            .flush()
            .map_err(|e| format!("Flush MCP échoué : {e}"))?;
        Ok(())
    }

    fn read_response(&mut self, expected_id: u64) -> Result<Value, String> {
        let deadline = std::time::Instant::now() + Duration::from_secs(30);
        loop {
            if std::time::Instant::now() > deadline {
                return Err("Timeout MCP — aucune réponse du serveur".into());
            }
            let mut line = String::new();
            let n = self
                .stdout
                .read_line(&mut line)
                .map_err(|e| format!("Lecture MCP échouée : {e}"))?;
            if n == 0 {
                return Err("Serveur MCP terminé de façon inattendue".into());
            }
            let trimmed = line.trim();
            if trimmed.is_empty() {
                continue;
            }
            let value: Value = serde_json::from_str(trimmed)
                .map_err(|e| format!("JSON MCP invalide : {e}"))?;
            if value.get("method").is_some() && value.get("id").is_none() {
                continue;
            }
            if let Some(resp_id) = value.get("id").and_then(|v| v.as_u64()) {
                if resp_id != expected_id {
                    continue;
                }
            }
            if let Some(err) = value.get("error") {
                let message = err
                    .get("message")
                    .and_then(|m| m.as_str())
                    .unwrap_or("Erreur MCP");
                return Err(message.to_string());
            }
            return Ok(value.get("result").cloned().unwrap_or(Value::Null));
        }
    }

    fn request_with_id(&mut self, id: u64, method: &str, params: Value) -> Result<Value, String> {
        let req = json!({
            "jsonrpc": "2.0",
            "id": id,
            "method": method,
            "params": params
        });
        self.write_line(&req)?;
        self.read_response(id)
    }

    fn request(&mut self, method: &str, params: Value) -> Result<Value, String> {
        let id = NEXT_ID.fetch_add(1, Ordering::SeqCst);
        self.request_with_id(id, method, params)
    }

    fn list_tools(&mut self) -> Result<Vec<Value>, String> {
        let result = self.request("tools/list", json!({}))?;
        let tools = result
            .get("tools")
            .and_then(|t| t.as_array())
            .cloned()
            .unwrap_or_default();
        Ok(tools)
    }

    fn call_tool(&mut self, name: &str, arguments: &Value) -> Result<Value, String> {
        let result = self.request(
            "tools/call",
            json!({
                "name": name,
                "arguments": arguments
            }),
        )?;
        Ok(result)
    }
}

fn validate_external_command(config: &McpServerConfig) -> Result<(), String> {
    if config.command.trim().is_empty() {
        return Err("Commande MCP vide".into());
    }
    if config.command.contains(['/', '\\']) {
        return Err("Chemin absolu interdit pour la commande MCP".into());
    }
    let base = config
        .command
        .rsplit(['/', '\\'])
        .next()
        .unwrap_or(&config.command)
        .trim()
        .to_ascii_lowercase();
    let normalized = base
        .strip_suffix(".exe")
        .or_else(|| base.strip_suffix(".cmd"))
        .or_else(|| base.strip_suffix(".bat"))
        .unwrap_or(&base);
    const ALLOWED: &[&str] = &["npx", "node", "npm", "uv", "uvx", "python", "py"];
    if !ALLOWED.contains(&normalized) {
        return Err(format!(
            "Commande MCP non autorisée : {}. Autorisées : {}",
            config.command,
            ALLOWED.join(", ")
        ));
    }
    Ok(())
}

fn with_session<F>(server_id: &str, config: &McpServerConfig, f: F) -> Result<Value, String>
where
    F: FnOnce(&mut McpSession) -> Result<Value, String>,
{
    let mut guard = sessions()
        .lock()
        .map_err(|_| "Verrou MCP indisponible".to_string())?;

    let needs_respawn = guard
        .get_mut(server_id)
        .map(|session| {
            session
                .child
                .try_wait()
                .ok()
                .flatten()
                .is_some()
        })
        .unwrap_or(true);

    if needs_respawn {
        let session = McpSession::spawn(config)?;
        guard.insert(server_id.to_string(), session);
    }

    let session = guard
        .get_mut(server_id)
        .ok_or_else(|| format!("Session MCP introuvable : {server_id}"))?;

    match f(session) {
        Ok(value) => Ok(value),
        Err(e) => {
            guard.remove(server_id);
            Err(e)
        }
    }
}

pub fn list_external_tools(config: &McpServerConfig) -> Result<Vec<Value>, String> {
    with_session(&config.id, config, |session| {
        let tools = session.list_tools()?;
        Ok(json!({ "tools": tools }))
    })
    .and_then(|v| {
        Ok(v.get("tools")
            .and_then(|t| t.as_array())
            .cloned()
            .unwrap_or_default())
    })
}

pub fn call_external_tool(
    config: &McpServerConfig,
    tool_name: &str,
    arguments: &Value,
) -> Result<Value, String> {
    with_session(&config.id, config, |session| session.call_tool(tool_name, arguments))
}

pub fn close_all_sessions() {
    if let Ok(mut guard) = sessions().lock() {
        guard.clear();
    }
}
