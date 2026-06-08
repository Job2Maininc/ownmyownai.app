use crate::history::{get_thread, ChatMessageRecord};

/// Returns only user/assistant turns for ephemeral share links (no RAG / system context).
pub fn messages_for_share(records: &[ChatMessageRecord]) -> Vec<(String, String)> {
    records
        .iter()
        .filter_map(|m| sanitize_role_content(&m.role, &m.content))
        .collect()
}

pub fn sanitize_role_content(role: &str, content: &str) -> Option<(String, String)> {
    if role != "user" && role != "assistant" {
        return None;
    }
    if content.trim().is_empty() {
        return None;
    }
    Some((role.to_string(), content.to_string()))
}

/// Loads a persisted thread and strips context metadata — conversation content only.
pub fn thread_messages_for_share(thread_id: &str) -> Result<Vec<(String, String)>, String> {
    let (_detail, messages) = get_thread(thread_id)?;
    Ok(messages_for_share(&messages))
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn strips_system_and_empty_messages() {
        let records = vec![
            ChatMessageRecord {
                role: "system".into(),
                content: "RAG context".into(),
            },
            ChatMessageRecord {
                role: "user".into(),
                content: "Bonjour".into(),
            },
            ChatMessageRecord {
                role: "assistant".into(),
                content: "   ".into(),
            },
        ];
        let out = messages_for_share(&records);
        assert_eq!(out.len(), 1);
        assert_eq!(out[0].0, "user");
    }
}
