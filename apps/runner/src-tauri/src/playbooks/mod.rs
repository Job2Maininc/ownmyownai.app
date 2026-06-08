use crate::agent::{run_agent_loop, AgentConfig};
use crate::context::{get_context_link, list_all_context_links, list_context_links};
use serde::Serialize;
use serde_json::json;
use std::sync::Arc;
use tokio::sync::mpsc::UnboundedSender;

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct PlaybookSummary {
    pub id: String,
    pub name: String,
    pub description: String,
    pub requires_link: bool,
}

struct PlaybookDef {
    id: &'static str,
    name: &'static str,
    description: &'static str,
    requires_link: bool,
    task_template: &'static str,
}

const BUILTIN: &[PlaybookDef] = &[PlaybookDef {
    id: "summarize-folder",
    name: "Résumer dossier",
    description: "Explore un dossier lié et produit un résumé structuré en français.",
    requires_link: true,
    task_template: "Résume le dossier lié : {path}\n\
        Commence par list_dir sur ce chemin, lis les fichiers importants avec read_file, \
        puis fournis un résumé structuré en français (objectif, fichiers clés, thèmes, points d'attention).",
}];

pub fn list_playbooks() -> Vec<PlaybookSummary> {
    BUILTIN
        .iter()
        .map(|p| PlaybookSummary {
            id: p.id.to_string(),
            name: p.name.to_string(),
            description: p.description.to_string(),
            requires_link: p.requires_link,
        })
        .collect()
}

fn find_playbook(id: &str) -> Option<&'static PlaybookDef> {
    BUILTIN.iter().find(|p| p.id == id)
}

pub struct PlaybookRunParams {
    pub playbook_id: String,
    pub context_ids: Vec<String>,
    pub link_id: Option<String>,
    pub path: Option<String>,
    pub model: String,
}

fn resolve_target_path(params: &PlaybookRunParams) -> Result<String, String> {
    if let Some(path) = params.path.as_ref().filter(|p| !p.is_empty()) {
        return Ok(path.clone());
    }
    if let Some(link_id) = params.link_id.as_ref().filter(|id| !id.is_empty()) {
        let link = get_context_link(link_id)?;
        return Ok(link.path);
    }
    for kb_id in &params.context_ids {
        let links = list_context_links(kb_id)?;
        if let Some(link) = links.into_iter().find(|l| l.enabled && l.link_type != "file") {
            return Ok(link.path);
        }
    }
    list_all_context_links()?
        .into_iter()
        .find(|l| l.enabled && l.link_type != "file")
        .map(|l| l.path)
        .ok_or_else(|| {
            "Aucun dossier lié — liez un dossier dans l'app Host ou sélectionnez un lien.".into()
        })
}

fn push_delta(tx: &UnboundedSender<String>, text: &str) {
    let _ = tx.send(text.to_string());
}

pub async fn run_playbook(
    params: PlaybookRunParams,
    is_cancelled: Arc<dyn Fn() -> bool + Send + Sync>,
    delta_tx: UnboundedSender<String>,
) -> Result<(), String> {
    let def = find_playbook(&params.playbook_id)
        .ok_or_else(|| format!("Playbook inconnu : {}", params.playbook_id))?;

    let target_path = if def.requires_link {
        Some(resolve_target_path(&params)?)
    } else {
        params.path.clone()
    };

    let user_task = match params.playbook_id.as_str() {
        "summarize-folder" => {
            let path = target_path.ok_or("Chemin du dossier requis")?;
            def.task_template.replace("{path}", &path)
        }
        _ => return Err("Playbook non implémenté".into()),
    };

    push_delta(&delta_tx, &format!("**Playbook : {}**\n\n", def.name));

    let tx_step = delta_tx.clone();
    let on_step = Arc::new(move |step: u32, tool: &str, status: &str| {
        push_delta(&tx_step, &format!("Étape {step} — `{tool}` ({status})…\n"));
    });

    let answer = run_agent_loop(AgentConfig {
        model: params.model,
        messages: vec![json!({ "role": "user", "content": user_task })],
        context_ids: params.context_ids,
        on_step,
        is_cancelled: is_cancelled.clone(),
    })
    .await?;

    if is_cancelled() {
        return Ok(());
    }

    if !answer.is_empty() {
        push_delta(&delta_tx, &format!("\n\n---\n\n{answer}"));
    }

    crate::notifications::notify_task_done(
        crate::notifications::TaskDoneKind::Agent,
        &format!("Playbook « {} » terminé.", def.name),
    );

    Ok(())
}
