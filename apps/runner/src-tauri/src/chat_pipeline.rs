//! Pipeline partagé d'enrichissement des messages chat (RAG, règles projet, mémoire).
//! Utilisé par le relay WebSocket et la passerelle OpenAI locale (Cursor).

use crate::assistant_output;
use crate::context::{
    build_codebase_context, build_rag_bundle_scoped, collect_kb_system_instructions,
    extract_mentions_from_chat, find_relevant_image_paths, load_project_rules, log_audit,
    parse_mentions, resolve_rag_kb_ids, strip_mentions, AuditAction, RagScope,
};
use crate::ollama::{attach_images_to_last_user_message, is_vision_model};
use crate::projects::{get_project, resolve_project_context_ids};
use crate::settings;
use crate::user_memory::build_memory_context;

/// Résout les identifiants de bases de connaissances : explicites ou dérivés du projet actif.
pub fn resolve_context_ids(
    explicit_context_ids: &[String],
    project_id: Option<&str>,
) -> Vec<String> {
    if !explicit_context_ids.is_empty() {
        return explicit_context_ids.to_vec();
    }
    if let Some(pid) = project_id {
        if let Ok(ids) = resolve_project_context_ids(pid) {
            return ids;
        }
    }
    Vec::new()
}

/// Dernier message utilisateur dans l'historique.
pub fn last_user_content(messages: &[serde_json::Value]) -> String {
    messages
        .iter()
        .rev()
        .find(|m| m.get("role").and_then(|r| r.as_str()) == Some("user"))
        .and_then(|m| m.get("content").and_then(|c| c.as_str()))
        .unwrap_or("")
        .to_string()
}

pub struct ChatPipelineInput<'a> {
    pub model: &'a str,
    pub project_id: Option<&'a str>,
    pub context_ids: &'a [String],
    /// Payload optionnel pour `mentionScope` (relay web) ; sinon mentions parsées du texte seul.
    pub mention_payload: Option<&'a serde_json::Value>,
    pub audit_source: &'static str,
    pub audit_request_id: Option<&'a str>,
}

pub struct ChatPipelineResult {
    pub messages: Vec<serde_json::Value>,
    pub citations: Vec<serde_json::Value>,
    pub rag_kb_ids: Vec<String>,
}

/// Injecte format de sortie, mémoire, instructions projet, RAG et contexte codebase.
pub async fn enrich_messages(
    mut messages: Vec<serde_json::Value>,
    input: ChatPipelineInput<'_>,
) -> Result<ChatPipelineResult, String> {
    let last_user = last_user_content(&messages);

    let mut prepend_system: Vec<serde_json::Value> = Vec::new();
    prepend_system.push(assistant_output::output_format_system_message());

    if settings::user_memory_enabled() {
        if let Some(mem) = build_memory_context(&last_user) {
            prepend_system.push(serde_json::json!({ "role": "system", "content": mem }));
        }
    }

    if let Some(pid) = input.project_id {
        if let Ok(project) = get_project(pid, input.project_id) {
            let instr = project.system_instruction.trim();
            if !instr.is_empty() {
                prepend_system.push(serde_json::json!({ "role": "system", "content": instr }));
            }
        }
    }

    let mentions = match input.mention_payload {
        Some(payload) => extract_mentions_from_chat(payload, &last_user),
        None => parse_mentions(&last_user),
    };
    let rag_kb_ids = resolve_rag_kb_ids(&mentions, input.context_ids).unwrap_or_default();
    let rag_query = if mentions.has_any() {
        strip_mentions(&last_user)
    } else {
        last_user.clone()
    };

    if mentions.has_any() {
        if let Some(idx) = messages.iter().rposition(|m| {
            m.get("role").and_then(|r| r.as_str()) == Some("user")
        }) {
            messages[idx] = serde_json::json!({ "role": "user", "content": rag_query });
        }
    }

    let mut rag_injected = false;
    let mut codebase_injected = false;
    let mut citations = Vec::new();

    if !rag_kb_ids.is_empty() {
        if let Ok(kb_instrs) = collect_kb_system_instructions(&rag_kb_ids) {
            for instr in kb_instrs {
                prepend_system.push(serde_json::json!({ "role": "system", "content": instr }));
            }
        }
        if let Ok(Some(rules)) = load_project_rules(&rag_kb_ids) {
            prepend_system.push(serde_json::json!({ "role": "system", "content": rules }));
        }

        let scope = RagScope {
            kb_ids: rag_kb_ids.clone(),
            file_hints: mentions.file_hints.clone(),
            folder_hints: mentions.folder_hints.clone(),
        };

        if let Ok(Some(bundle)) = build_rag_bundle_scoped(&scope, &rag_query).await {
            prepend_system.push(serde_json::json!({ "role": "system", "content": bundle.context }));
            rag_injected = true;
            citations = bundle.citations;
        }

        if let Ok(Some(code_ctx)) = build_codebase_context(&rag_kb_ids, &rag_query).await {
            prepend_system.push(serde_json::json!({ "role": "system", "content": code_ctx }));
            codebase_injected = true;
        }
    }

    log_audit(
        AuditAction::AgentAccess,
        Some(input.audit_source),
        input.audit_request_id,
        Some(serde_json::json!({
            "contextIds": rag_kb_ids,
            "model": input.model,
            "projectId": input.project_id,
            "ragInjected": rag_injected,
            "codebaseInjected": codebase_injected,
            "mentionScope": {
                "baseNames": mentions.base_names,
                "fileHints": mentions.file_hints,
                "folderHints": mentions.folder_hints,
            },
        })),
    );

    for (i, sys) in prepend_system.into_iter().enumerate() {
        messages.insert(i, sys);
    }

    if is_vision_model(input.model) && !rag_kb_ids.is_empty() {
        if let Ok(paths) = find_relevant_image_paths(&rag_kb_ids, &rag_query, 3).await {
            let _ = attach_images_to_last_user_message(&mut messages, &paths);
        }
    }

    Ok(ChatPipelineResult {
        messages,
        citations,
        rag_kb_ids,
    })
}
