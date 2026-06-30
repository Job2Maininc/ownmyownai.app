mod builtin;
mod client;

use crate::settings::{get_settings, McpServerConfig};
use serde::Serialize;
use serde_json::{json, Value};

pub use builtin::{is_builtin, BUILTIN_FS_ID, BUILTIN_FS_NAME};
pub use client::{
    close_all_sessions, call_external_tool, list_external_tools, validate_external_command,
};

/// Valide une entrée `mcp_servers` avant persistance.
pub fn validate_external_config(config: &McpServerConfig) -> Result<(), String> {
    if config.builtin {
        return Err("Les serveurs intégrés ne sont pas configurables".into());
    }
    validate_external_command(config)
}

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct McpServerSummary {
    pub id: String,
    pub name: String,
    pub kind: String,
    pub enabled: bool,
    pub command: Option<String>,
    pub args: Vec<String>,
    pub tool_count: u32,
}

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct McpToolDescriptor {
    pub server_id: String,
    pub server_name: String,
    pub name: String,
    pub qualified_name: String,
    pub description: Option<String>,
    pub input_schema: Value,
}

fn enabled_external_servers() -> Vec<McpServerConfig> {
    get_settings()
        .map(|s| {
            s.mcp_servers
                .into_iter()
                .filter(|srv| srv.enabled)
                .collect()
        })
        .unwrap_or_default()
}

fn find_server_config(server_id: &str) -> Option<McpServerConfig> {
    if builtin::is_builtin(server_id) {
        return Some(McpServerConfig {
            id: builtin::BUILTIN_FS_ID.to_string(),
            name: builtin::BUILTIN_FS_NAME.to_string(),
            command: String::new(),
            args: Vec::new(),
            env: std::collections::HashMap::new(),
            enabled: true,
            builtin: true,
        });
    }
    get_settings().ok().and_then(|s| {
        s.mcp_servers
            .into_iter()
            .find(|srv| srv.id == server_id)
    })
}

pub fn list_servers() -> Vec<McpServerSummary> {
    let mut servers = vec![McpServerSummary {
        id: builtin::BUILTIN_FS_ID.to_string(),
        name: builtin::BUILTIN_FS_NAME.to_string(),
        kind: "builtin".to_string(),
        enabled: true,
        command: None,
        args: Vec::new(),
        tool_count: builtin::list_tools().len() as u32,
    }];

    if let Ok(settings) = get_settings() {
        for srv in settings.mcp_servers {
            let tool_count = if srv.enabled {
                list_external_tools(&srv).map(|t| t.len() as u32).unwrap_or(0)
            } else {
                0
            };
            servers.push(McpServerSummary {
                id: srv.id,
                name: srv.name,
                kind: "external".to_string(),
                enabled: srv.enabled,
                command: if srv.command.is_empty() {
                    None
                } else {
                    Some(srv.command)
                },
                args: srv.args,
                tool_count,
            });
        }
    }

    servers
}

pub fn list_all_tools() -> Result<Vec<McpToolDescriptor>, String> {
    let mut out = builtin::list_tools()
        .into_iter()
        .map(|tool| McpToolDescriptor {
            server_id: builtin::BUILTIN_FS_ID.to_string(),
            server_name: builtin::BUILTIN_FS_NAME.to_string(),
            name: tool["name"].as_str().unwrap_or_default().to_string(),
            qualified_name: tool["qualifiedName"]
                .as_str()
                .unwrap_or_default()
                .to_string(),
            description: tool["description"].as_str().map(String::from),
            input_schema: tool["inputSchema"].clone(),
        })
        .collect::<Vec<_>>();

    for srv in enabled_external_servers() {
        let tools = list_external_tools(&srv).unwrap_or_default();
        for tool in tools {
            let name = tool["name"].as_str().unwrap_or_default().to_string();
            out.push(McpToolDescriptor {
                server_id: srv.id.clone(),
                server_name: srv.name.clone(),
                name: name.clone(),
                qualified_name: format!("mcp/{}/{}", srv.id, name),
                description: tool["description"].as_str().map(String::from),
                input_schema: tool
                    .get("inputSchema")
                    .cloned()
                    .unwrap_or_else(|| json!({ "type": "object" })),
            });
        }
    }

    Ok(out)
}

pub async fn call_tool(
    qualified_name: &str,
    arguments: &Value,
    context_ids: &[String],
) -> Result<Value, String> {
    let (server_id, tool_name) = builtin::parse_qualified_name(qualified_name)
        .ok_or_else(|| format!("Nom d'outil MCP invalide : {qualified_name}"))?;

    let config = find_server_config(&server_id)
        .ok_or_else(|| format!("Serveur MCP inconnu : {server_id}"))?;

    if !config.enabled {
        return Err(format!("Serveur MCP désactivé : {}", config.name));
    }

    if builtin::is_builtin(&server_id) {
        return builtin::call_tool(&tool_name, arguments, context_ids).await;
    }

    call_external_tool(&config, &tool_name, arguments)
}

pub fn agent_tool_definitions() -> Vec<Value> {
    let mut defs = builtin::agent_tool_definitions();
    for srv in enabled_external_servers() {
        if let Ok(tools) = list_external_tools(&srv) {
            for tool in tools {
                let name = tool["name"].as_str().unwrap_or_default();
                let qualified = format!("mcp/{}/{}", srv.id, name);
                let description = tool["description"]
                    .as_str()
                    .map(|d| format!("{d} (MCP {})", srv.name))
                    .unwrap_or_else(|| format!("Outil MCP {}", srv.name));
                defs.push(json!({
                    "type": "function",
                    "function": {
                        "name": qualified,
                        "description": description,
                        "parameters": tool.get("inputSchema").cloned().unwrap_or_else(|| json!({ "type": "object" }))
                    }
                }));
            }
        }
    }
    defs
}

pub async fn execute_qualified_tool(
    name: &str,
    args: &Value,
    roots: &[std::path::PathBuf],
    context_ids: &[String],
) -> Result<Value, String> {
    if let Some((server_id, tool_name)) = builtin::parse_qualified_name(name) {
        return call_tool(
            &format!("mcp/{server_id}/{tool_name}"),
            args,
            context_ids,
        )
        .await;
    }
    crate::agent::execute_tool(name, args, roots, context_ids).await
}
