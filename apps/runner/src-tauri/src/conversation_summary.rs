use crate::ollama::complete_chat;
use crate::settings::{get_settings, resolved_default_model, FALLBACK_DEFAULT_MODEL};
use serde_json::Value;

/// Approximate token count (~4 characters per token, same heuristic as RAG chunking).
pub fn estimate_tokens(text: &str) -> usize {
    let chars = text.chars().count();
    (chars / 4).max(1)
}

pub fn estimate_messages_tokens(messages: &[Value]) -> usize {
    messages
        .iter()
        .filter_map(|m| m.get("content").and_then(|c| c.as_str()))
        .map(estimate_tokens)
        .sum()
}

#[derive(Debug, Clone, Copy)]
pub struct CompactionConfig {
    pub token_threshold: usize,
    pub recent_messages: usize,
}

impl Default for CompactionConfig {
    fn default() -> Self {
        Self {
            token_threshold: 6_000,
            recent_messages: 12,
        }
    }
}

pub fn resolved_compaction_config() -> CompactionConfig {
    get_settings()
        .map(|s| CompactionConfig {
            token_threshold: s.chat_token_threshold.max(1_000) as usize,
            recent_messages: s.chat_recent_messages.max(4) as usize,
        })
        .unwrap_or_default()
}

fn resolved_summary_model(fallback: &str) -> String {
    get_settings()
        .ok()
        .and_then(|s| s.model_routing.summary_model.clone())
        .filter(|m| !m.trim().is_empty())
        .unwrap_or_else(|| fallback.to_string())
}

fn chat_role(msg: &Value) -> Option<&str> {
    msg.get("role").and_then(|r| r.as_str())
}

fn chat_content(msg: &Value) -> Option<&str> {
    msg.get("content").and_then(|c| c.as_str())
}

/// Keep only user/assistant turns (system messages from the client are ignored).
pub fn filter_chat_turns(messages: &[Value]) -> Vec<Value> {
    messages
        .iter()
        .filter(|m| {
            matches!(
                chat_role(m),
                Some("user") | Some("assistant")
            )
        })
        .cloned()
        .collect()
}

fn format_turns_for_summary(messages: &[Value]) -> String {
    messages
        .iter()
        .filter_map(|m| {
            let role = chat_role(m)?;
            let content = chat_content(m)?.trim();
            if content.is_empty() {
                return None;
            }
            let label = match role {
                "user" => "Utilisateur",
                "assistant" => "Assistant",
                _ => return None,
            };
            Some(format!("{label}: {content}"))
        })
        .collect::<Vec<_>>()
        .join("\n\n")
}

const SUMMARY_SYSTEM_PROMPT: &str = "Tu résumes une longue conversation pour préserver le contexte. \
Inclus le sujet principal, les décisions, les faits importants (noms, fichiers, détails techniques) \
et les questions ouvertes. Sois concis (environ 400 mots maximum). Réponds en français.";

async fn summarize_older_turns(model: &str, older: &[Value]) -> Result<String, String> {
    if older.is_empty() {
        return Ok(String::new());
    }

    let transcript = format_turns_for_summary(older);
    if transcript.is_empty() {
        return Ok(String::new());
    }

    let summary_messages = vec![
        serde_json::json!({
            "role": "system",
            "content": SUMMARY_SYSTEM_PROMPT,
        }),
        serde_json::json!({
            "role": "user",
            "content": format!(
                "Voici l'historique à résumer ({count} messages) :\n\n{transcript}",
                count = older.len(),
            ),
        }),
    ];

    let summary = complete_chat(model, &summary_messages).await?;
    Ok(summary.trim().to_string())
}

/// Compact conversation history when estimated tokens exceed the configured threshold.
/// Older turns are summarized into a single system message; recent turns are kept verbatim.
pub async fn compact_messages_for_chat(
    chat_model: &str,
    messages: Vec<Value>,
) -> Result<Vec<Value>, String> {
    let config = resolved_compaction_config();
    let turns = filter_chat_turns(&messages);

    if turns.is_empty() {
        return Ok(turns);
    }

    if estimate_messages_tokens(&turns) <= config.token_threshold {
        return Ok(turns);
    }

    let recent_count = config.recent_messages.min(turns.len());
    let split_at = turns.len().saturating_sub(recent_count);
    let older = &turns[..split_at];
    let recent = &turns[split_at..];

    if older.is_empty() {
        return Ok(turns);
    }

    let summary_model = resolved_summary_model(chat_model);
    let summary = summarize_older_turns(&summary_model, older).await?;

    if summary.is_empty() {
        return Ok(turns);
    }

    let summary_message = serde_json::json!({
        "role": "system",
        "content": format!(
            "[Résumé de la conversation précédente — {older_count} messages condensés]\n\n{summary}",
            older_count = older.len(),
        ),
    });

    let mut compacted = vec![summary_message];
    compacted.extend(recent.iter().cloned());
    Ok(compacted)
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn estimate_tokens_uses_char_heuristic() {
        assert_eq!(estimate_tokens(""), 1);
        assert_eq!(estimate_tokens("abcd"), 1);
        assert_eq!(estimate_tokens("a".repeat(40)), 10);
    }

    #[test]
    fn filter_chat_turns_drops_system_messages() {
        let input = vec![
            serde_json::json!({ "role": "system", "content": "secret" }),
            serde_json::json!({ "role": "user", "content": "hello" }),
            serde_json::json!({ "role": "assistant", "content": "hi" }),
        ];
        let out = filter_chat_turns(&input);
        assert_eq!(out.len(), 2);
        assert_eq!(chat_role(&out[0]), Some("user"));
    }

    #[test]
    fn skips_compaction_under_threshold() {
        let messages = vec![
            serde_json::json!({ "role": "user", "content": "short" }),
            serde_json::json!({ "role": "assistant", "content": "ok" }),
        ];
        assert!(estimate_messages_tokens(&messages) <= CompactionConfig::default().token_threshold);
    }

    #[test]
    fn resolved_compaction_config_has_sane_defaults() {
        let cfg = resolved_compaction_config();
        assert!(cfg.token_threshold >= 1_000);
        assert!(cfg.recent_messages >= 4);
    }

    #[test]
    fn format_turns_skips_empty_content() {
        let messages = vec![
            serde_json::json!({ "role": "user", "content": "   " }),
            serde_json::json!({ "role": "assistant", "content": "réponse" }),
        ];
        let text = format_turns_for_summary(&messages);
        assert!(text.contains("Assistant: réponse"));
        assert!(!text.contains("Utilisateur"));
    }

    #[test]
    fn summary_model_falls_back_to_chat_model() {
        let model = resolved_summary_model(FALLBACK_DEFAULT_MODEL);
        assert!(!model.is_empty());
        let _ = resolved_default_model();
    }
}
