use crate::agent::{collect_allowed_roots, execute_tool, tool_definitions, LOCAL_TOOL_NAMES};
use serde_json::{json, Value};
use std::path::PathBuf;

pub const BUILTIN_FS_ID: &str = "builtin-fs";
pub const BUILTIN_FS_NAME: &str = "Fichiers locaux (sandbox)";

pub fn is_builtin(server_id: &str) -> bool {
    server_id == BUILTIN_FS_ID
}

pub fn list_tools() -> Vec<Value> {
    tool_definitions()
        .into_iter()
        .map(|tool| {
            let name = tool["function"]["name"]
                .as_str()
                .unwrap_or_default()
                .to_string();
            json!({
                "name": name,
                "description": tool["function"]["description"],
                "inputSchema": tool["function"]["parameters"],
                "serverId": BUILTIN_FS_ID,
                "qualifiedName": qualified_tool_name(&name),
            })
        })
        .collect()
}

pub fn qualified_tool_name(tool_name: &str) -> String {
    format!("mcp/{BUILTIN_FS_ID}/{tool_name}")
}

pub fn parse_qualified_name(qualified: &str) -> Option<(String, String)> {
    let rest = qualified.strip_prefix("mcp/")?;
    let (server_id, tool_name) = rest.split_once('/')?;
    Some((server_id.to_string(), tool_name.to_string()))
}

pub async fn call_tool(
    tool_name: &str,
    arguments: &Value,
    context_ids: &[String],
) -> Result<Value, String> {
    if !LOCAL_TOOL_NAMES.contains(&tool_name) {
        return Err(format!("Outil builtin inconnu : {tool_name}"));
    }
    let roots: Vec<PathBuf> = collect_allowed_roots();
    execute_tool(tool_name, arguments, &roots, context_ids).await
}

pub fn agent_tool_definitions() -> Vec<Value> {
    tool_definitions()
        .into_iter()
        .map(|mut tool| {
            if let Some(name) = tool["function"]["name"].as_str() {
                tool["function"]["name"] = json!(qualified_tool_name(name));
                if let Some(desc) = tool["function"]["description"].as_str() {
                    tool["function"]["description"] =
                        json!(format!("{desc} (MCP {BUILTIN_FS_NAME})"));
                }
            }
            tool
        })
        .collect()
}
