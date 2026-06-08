use super::ingest::reindex_document;
use super::store::{get_document_record, DocumentRecord};
use crate::ollama::{complete_chat, ensure_ollama_running, model_exists};
use crate::settings::resolved_default_model;
use std::fs;
use std::path::Path;

#[derive(Debug, Clone, serde::Serialize)]
#[serde(rename_all = "camelCase")]
pub struct InlineEditPreview {
    pub document_id: String,
    pub filename: String,
    pub filepath: String,
    pub original_text: String,
    pub selected_text: String,
    pub proposed_text: String,
}

fn validate_linked_md(record: &DocumentRecord) -> Result<(), String> {
    if record.source_type != "linked" {
        return Err("Seuls les documents liés peuvent être modifiés inline.".into());
    }
    if !record.filename.to_lowercase().ends_with(".md") {
        return Err("L'édition inline est disponible uniquement pour les fichiers .md.".into());
    }
    Ok(())
}

fn read_source_text(record: &DocumentRecord) -> Result<String, String> {
    let path = Path::new(&record.filepath);
    if !path.is_file() {
        return Err("Fichier source introuvable sur ce PC.".into());
    }
    fs::read_to_string(path).map_err(|e| format!("Impossible de lire le fichier : {e}"))
}

fn ensure_selection_in_content(content: &str, selected: &str) -> Result<(), String> {
    if selected.trim().is_empty() {
        return Err("Sélection vide.".into());
    }
    if !content.contains(selected) {
        return Err(
            "Le texte sélectionné est introuvable dans le fichier source (fichier modifié ?)."
                .into(),
        );
    }
    Ok(())
}

pub async fn preview_inline_edit(
    document_id: &str,
    selected_text: &str,
    instruction: &str,
    model: Option<&str>,
) -> Result<InlineEditPreview, String> {
    let record = get_document_record(document_id)?;
    validate_linked_md(&record)?;

    let content = read_source_text(&record)?;
    ensure_selection_in_content(&content, selected_text)?;

    ensure_ollama_running(None).await?;

    let default_model = resolved_default_model();
    let model_name = model
        .filter(|m| !m.is_empty())
        .unwrap_or(default_model.as_str());
    if !model_exists(model_name) {
        return Err(format!(
            "Le modèle « {model_name} » n'est pas installé sur ce PC."
        ));
    }

    let prompt = format!(
        "Tu es un assistant d'édition de documents Markdown.\n\
         Instruction de l'utilisateur : {instruction}\n\n\
         Texte sélectionné à reformuler :\n\
         ---\n\
         {selected_text}\n\
         ---\n\n\
         Réponds UNIQUEMENT avec le texte reformulé, sans commentaire, sans guillemets, \
         sans balises markdown supplémentaires autour du résultat."
    );

    let messages = vec![serde_json::json!({
        "role": "user",
        "content": prompt,
    })];

    let proposed = complete_chat(model_name, &messages).await?;
    let proposed_text = proposed.trim().to_string();
    if proposed_text.is_empty() {
        return Err("Le modèle n'a pas produit de texte reformulé.".into());
    }

    Ok(InlineEditPreview {
        document_id: document_id.to_string(),
        filename: record.filename.clone(),
        filepath: record.filepath.clone(),
        original_text: content,
        selected_text: selected_text.to_string(),
        proposed_text,
    })
}

pub async fn apply_inline_edit(
    document_id: &str,
    selected_text: &str,
    proposed_text: &str,
) -> Result<(), String> {
    let record = get_document_record(document_id)?;
    validate_linked_md(&record)?;

    let content = read_source_text(&record)?;
    ensure_selection_in_content(&content, selected_text)?;

    let updated = content.replacen(selected_text, proposed_text, 1);
    if updated == content {
        return Err("Aucune modification à appliquer.".into());
    }

    fs::write(&record.filepath, &updated).map_err(|e| format!("Écriture impossible : {e}"))?;
    reindex_document(document_id).await?;
    Ok(())
}
