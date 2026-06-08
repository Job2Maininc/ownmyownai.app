use super::sandbox::collect_allowed_roots;
use crate::mcp::{agent_tool_definitions, execute_qualified_tool};
use crate::ollama::chat_with_tools;
use serde_json::json;
use std::sync::Arc;

pub const MAX_AGENT_STEPS: u32 = 10;

pub struct AgentConfig {
    pub model: String,
    pub messages: Vec<serde_json::Value>,
    pub context_ids: Vec<String>,
    pub on_step: Arc<dyn Fn(u32, &str, &str) + Send + Sync>,
    pub is_cancelled: Arc<dyn Fn() -> bool + Send + Sync>,
}

pub async fn run_agent_loop(config: AgentConfig) -> Result<String, String> {
    let tools = agent_tool_definitions();
    let roots = collect_allowed_roots();
    let mut messages = config.messages;

    for step in 1..=MAX_AGENT_STEPS {
        if (config.is_cancelled)() {
            return Err("Annulé".into());
        }
        (config.on_step)(step, "réflexion", "en cours");

        let response = chat_with_tools(&config.model, &messages, &tools).await?;

        if let Some(calls) = response.tool_calls {
            let tool_calls_json: Vec<serde_json::Value> = calls
                .iter()
                .enumerate()
                .map(|(i, tc)| {
                    json!({
                        "id": format!("call_{step}_{i}"),
                        "type": "function",
                        "function": {
                            "name": tc.name,
                            "arguments": tc.arguments
                        }
                    })
                })
                .collect();

            messages.push(json!({
                "role": "assistant",
                "content": response.content.unwrap_or_default(),
                "tool_calls": tool_calls_json
            }));

            for (i, tc) in calls.iter().enumerate() {
                (config.on_step)(step, &tc.name, "exécution");
                let content = match execute_qualified_tool(
                    &tc.name,
                    &tc.arguments,
                    &roots,
                    &config.context_ids,
                )
                .await
                {
                    Ok(result) => result.to_string(),
                    Err(e) => json!({ "error": e }).to_string(),
                };
                messages.push(json!({
                    "role": "tool",
                    "content": content,
                    "tool_call_id": format!("call_{step}_{i}")
                }));
            }
            continue;
        }

        if let Some(content) = response.content {
            let trimmed = content.trim();
            if !trimmed.is_empty() {
                return Ok(content);
            }
        }
        return Err("Le modèle n'a pas produit de réponse".into());
    }

    Err(format!("Limite de {MAX_AGENT_STEPS} étapes atteinte"))
}
