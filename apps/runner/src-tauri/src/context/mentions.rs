use super::store::{list_knowledge_bases, KnowledgeBase};
use regex::Regex;
use std::sync::OnceLock;

#[derive(Debug, Clone, Default, PartialEq, Eq)]
pub struct ParsedMentions {
    pub base_names: Vec<String>,
    pub file_hints: Vec<String>,
    pub folder_hints: Vec<String>,
}

impl ParsedMentions {
    pub fn has_any(&self) -> bool {
        !self.base_names.is_empty() || !self.file_hints.is_empty() || !self.folder_hints.is_empty()
    }
}

fn mention_regex() -> &'static Regex {
    static RE: OnceLock<Regex> = OnceLock::new();
    RE.get_or_init(|| Regex::new(r"(?i)@(base|fichier|dossier):([^\s@]+)").expect("mention regex"))
}

pub fn parse_mentions(text: &str) -> ParsedMentions {
    let mut parsed = ParsedMentions::default();
    for cap in mention_regex().captures_iter(text) {
        let kind = cap.get(1).map(|m| m.as_str().to_lowercase()).unwrap_or_default();
        let value = cap
            .get(2)
            .map(|m| m.as_str().trim().to_string())
            .unwrap_or_default();
        if value.is_empty() {
            continue;
        }
        match kind.as_str() {
            "base" => parsed.base_names.push(value),
            "fichier" => parsed.file_hints.push(value),
            "dossier" => parsed.folder_hints.push(value),
            _ => {}
        }
    }
    parsed
}

pub fn strip_mentions(text: &str) -> String {
    let stripped = mention_regex().replace_all(text, "");
    stripped.split_whitespace().collect::<Vec<_>>().join(" ")
}

pub fn resolve_knowledge_base_ids_by_names(names: &[String]) -> Result<Vec<String>, String> {
    if names.is_empty() {
        return Ok(vec![]);
    }
    let bases = list_knowledge_bases()?;
    let mut ids = Vec::new();
    for name in names {
        if let Some(kb) = bases.iter().find(|kb| kb.name.eq_ignore_ascii_case(name)) {
            if !ids.contains(&kb.id) {
                ids.push(kb.id.clone());
            }
        }
    }
    Ok(ids)
}

pub fn resolve_rag_kb_ids(
    mentions: &ParsedMentions,
    active_context_ids: &[String],
) -> Result<Vec<String>, String> {
    if !mentions.base_names.is_empty() {
        return resolve_knowledge_base_ids_by_names(&mentions.base_names);
    }
    Ok(active_context_ids.to_vec())
}

pub fn parse_mention_scope_payload(payload: &serde_json::Value) -> ParsedMentions {
    let mut parsed = ParsedMentions::default();
    let Some(scope) = payload.get("mentionScope").and_then(|v| v.as_object()) else {
        return parsed;
    };

    for key in ["baseNames", "fileHints", "folderHints"] {
        if let Some(values) = scope.get(key).and_then(|v| v.as_array()) {
            for value in values {
                if let Some(text) = value.as_str() {
                    let trimmed = text.trim().to_string();
                    if trimmed.is_empty() {
                        continue;
                    }
                    match key {
                        "baseNames" => parsed.base_names.push(trimmed),
                        "fileHints" => parsed.file_hints.push(trimmed),
                        "folderHints" => parsed.folder_hints.push(trimmed),
                        _ => {}
                    }
                }
            }
        }
    }
    parsed
}

pub fn extract_mentions_from_chat(
    payload: &serde_json::Value,
    last_user_message: &str,
) -> ParsedMentions {
    let from_message = parse_mentions(last_user_message);
    if from_message.has_any() {
        return from_message;
    }
    parse_mention_scope_payload(payload)
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn parses_base_mention() {
        let parsed = parse_mentions("@base:Notes Résume les dernières entrées");
        assert_eq!(parsed.base_names, vec!["Notes"]);
        assert!(parsed.file_hints.is_empty());
        assert!(parsed.folder_hints.is_empty());
    }

    #[test]
    fn parses_file_and_folder_mentions() {
        let parsed = parse_mentions("@fichier:README.md dans @dossier:docs");
        assert_eq!(parsed.file_hints, vec!["README.md"]);
        assert_eq!(parsed.folder_hints, vec!["docs"]);
    }

    #[test]
    fn strips_mentions_from_message() {
        let cleaned = strip_mentions("@base:Notes Quelle est la dernière note ?");
        assert_eq!(cleaned, "Quelle est la dernière note ?");
    }

    #[test]
    fn extracts_mention_scope_from_payload_when_message_stripped() {
        let payload = serde_json::json!({
            "mentionScope": {
                "baseNames": ["Notes"],
                "fileHints": ["readme.md"]
            }
        });
        let mentions = extract_mentions_from_chat(&payload, "Quelle est la dernière note ?");
        assert_eq!(mentions.base_names, vec!["Notes"]);
        assert_eq!(mentions.file_hints, vec!["readme.md"]);
    }
}
