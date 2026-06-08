use crate::ollama::model_exists;
use crate::providers::{is_available_model, is_cloud_model};
use crate::settings::{get_settings, FALLBACK_DEFAULT_MODEL};

fn model_available(model: &str) -> bool {
    if is_cloud_model(model) {
        is_available_model(model)
    } else {
        model_exists(model)
    }
}

#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub enum ChatTaskIntent {
    Summary,
    Writing,
}

impl ChatTaskIntent {
    pub fn from_str(s: &str) -> Option<Self> {
        match s.trim().to_lowercase().as_str() {
            "summary" | "summarize" | "resume" | "résumé" | "resumé" => Some(Self::Summary),
            "writing" | "write" | "compose" | "redaction" | "rédaction" => Some(Self::Writing),
            _ => None,
        }
    }

    pub fn label_fr(self) -> &'static str {
        match self {
            Self::Summary => "résumé",
            Self::Writing => "rédaction",
        }
    }
}

#[derive(Debug, Clone, PartialEq, Eq)]
pub struct ResolvedChatModel {
    pub model: String,
    pub intent: Option<ChatTaskIntent>,
    pub fallback_used: bool,
}

pub fn detect_task_intent(user_message: &str) -> Option<ChatTaskIntent> {
    let lower = user_message.to_lowercase();
    let summary_markers = [
        "résume",
        "resumé",
        "resume ",
        "résumé",
        "resumé ",
        "synthèse",
        "synthese",
        "synthétise",
        "synthetise",
        "condense",
        "summarize",
        "summary",
        "tl;dr",
        "tldr",
        "en bref",
        "points clés",
        "points cles",
    ];
    let writing_markers = [
        "rédige",
        "redige",
        "écris",
        "ecris",
        "rédaction",
        "redaction",
        "compose",
        "rédiger",
        "rediger",
        "écrire",
        "ecrire",
        "write ",
        "draft",
        "letter",
        "email",
        "mail",
        "article",
        "rapport",
        "blog",
    ];

    let summary_score = summary_markers
        .iter()
        .filter(|m| lower.contains(*m))
        .count();
    let writing_score = writing_markers
        .iter()
        .filter(|m| lower.contains(*m))
        .count();

    match (summary_score, writing_score) {
        (s, w) if s > w && s > 0 => Some(ChatTaskIntent::Summary),
        (s, w) if w > s && w > 0 => Some(ChatTaskIntent::Writing),
        (s, w) if s > 0 && s == w => Some(ChatTaskIntent::Summary),
        _ => None,
    }
}

fn model_for_intent(intent: ChatTaskIntent) -> Option<String> {
    let settings = get_settings().ok()?;
    match intent {
        ChatTaskIntent::Summary => settings.model_routing.summary_model.clone(),
        ChatTaskIntent::Writing => settings.model_routing.writing_model.clone(),
    }
    .filter(|m| !m.is_empty())
}

fn fallback_candidates(preferred: &str) -> Vec<String> {
    let settings = get_settings().unwrap_or_default();
    let mut candidates = vec![preferred.to_string()];
    if !settings.default_model.is_empty() {
        candidates.push(settings.default_model.clone());
    }
    candidates.extend(settings.selected_models.clone());
    candidates.push(FALLBACK_DEFAULT_MODEL.to_string());
    candidates
}

fn first_installed(candidates: &[String]) -> Option<String> {
    candidates
        .iter()
        .find(|m| model_available(m))
        .cloned()
}

pub fn resolve_chat_model(
    explicit_model: Option<&str>,
    task_intent: Option<ChatTaskIntent>,
    user_message: &str,
) -> ResolvedChatModel {
    if let Some(model) = explicit_model.filter(|m| !m.is_empty()) {
        if model_available(model) {
            return ResolvedChatModel {
                model: model.to_string(),
                intent: None,
                fallback_used: false,
            };
        }
        let candidates = fallback_candidates(model);
        let installed = first_installed(&candidates);
        let fallback_used = installed.as_deref() != Some(model);
        return ResolvedChatModel {
            model: installed.unwrap_or_else(|| model.to_string()),
            intent: None,
            fallback_used,
        };
    }

    let intent = task_intent.or_else(|| detect_task_intent(user_message));
    if let Some(intent) = intent {
        if let Some(mapped) = model_for_intent(intent) {
            if model_available(&mapped) {
                return ResolvedChatModel {
                    model: mapped,
                    intent: Some(intent),
                    fallback_used: false,
                };
            }
            let candidates = fallback_candidates(&mapped);
            let installed = first_installed(&candidates);
            return ResolvedChatModel {
                model: installed.unwrap_or(mapped),
                intent: Some(intent),
                fallback_used: true,
            };
        }
    }

    let settings = get_settings().unwrap_or_default();
    let default = settings.default_model;
    if model_available(&default) {
        return ResolvedChatModel {
            model: default,
            intent: None,
            fallback_used: false,
        };
    }

    let candidates = fallback_candidates(&default);
    let installed = first_installed(&candidates);
    let fallback_used = installed.is_some();
    ResolvedChatModel {
        model: installed.unwrap_or(default),
        intent: None,
        fallback_used,
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn detect_summary_intent_fr() {
        assert_eq!(
            detect_task_intent("Peux-tu résumer ce document ?"),
            Some(ChatTaskIntent::Summary)
        );
    }

    #[test]
    fn detect_writing_intent_fr() {
        assert_eq!(
            detect_task_intent("Rédige un email professionnel"),
            Some(ChatTaskIntent::Writing)
        );
    }

    #[test]
    fn parse_task_intent_values() {
        assert_eq!(
            ChatTaskIntent::from_str("summary"),
            Some(ChatTaskIntent::Summary)
        );
        assert_eq!(
            ChatTaskIntent::from_str("rédaction"),
            Some(ChatTaskIntent::Writing)
        );
        assert!(ChatTaskIntent::from_str("chat").is_none());
    }
}
