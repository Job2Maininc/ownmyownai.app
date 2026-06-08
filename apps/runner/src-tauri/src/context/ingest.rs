use super::store::{
    add_document_record, insert_chunk, insert_embedding, kb_files_dir, set_document_status,
    ContextLimits,
};
use crate::ollama::{create_embedding, EMBEDDING_MODEL};
use std::fs;
use std::path::PathBuf;

#[derive(Debug, Clone, serde::Serialize)]
#[serde(rename_all = "camelCase")]
pub struct IngestProgress {
    pub document_id: String,
    pub phase: String,
    pub percent: f64,
    pub message: String,
}

const CHUNK_SIZE: usize = 1500;

pub async fn ingest_document(
    kb_id: &str,
    filename: &str,
    data: &[u8],
    limits: &ContextLimits,
) -> Result<String, String> {
    let max_bytes = limits.max_file_mb as usize * 1024 * 1024;
    if data.len() > max_bytes {
        return Err(format!(
            "Fichier trop volumineux (max {} Mo)",
            limits.max_file_mb
        ));
    }

    let dir = kb_files_dir(kb_id);
    fs::create_dir_all(&dir).map_err(|e| e.to_string())?;
    let filepath = dir.join(filename);
    fs::write(&filepath, data).map_err(|e| e.to_string())?;

    let doc_id = add_document_record(kb_id, filename, &filepath, limits)?;

    let text = extract_text(filename, data)?;
    let chunks = chunk_text(&text);

    for (index, chunk) in chunks.iter().enumerate() {
        let chunk_id = insert_chunk(&doc_id, index as u32, chunk)?;
        match create_embedding(EMBEDDING_MODEL, chunk).await {
            Ok(vector) => insert_embedding(&chunk_id, &vector)?,
            Err(e) => {
                set_document_status(&doc_id, "error", Some(&e))?;
                return Err(e);
            }
        }
    }

    set_document_status(&doc_id, "ready", None)?;
    Ok(doc_id)
}

fn extract_text(filename: &str, data: &[u8]) -> Result<String, String> {
    let lower = filename.to_lowercase();
    if lower.ends_with(".txt") || lower.ends_with(".md") {
        return String::from_utf8(data.to_vec())
            .map_err(|_| "Fichier texte invalide (UTF-8 requis)".into());
    }
    if lower.ends_with(".pdf") {
        return extract_pdf_text(data);
    }
    Err(format!("Format non supporté : {filename}"))
}

fn extract_pdf_text(data: &[u8]) -> Result<String, String> {
    let text = String::from_utf8_lossy(data);
    let mut out = String::new();
    for line in text.lines() {
        if line.starts_with("BT") || line.contains("Tj") {
            if let Some(start) = line.find('(') {
                if let Some(end) = line.rfind(')') {
                    if end > start {
                        out.push_str(&line[start + 1..end]);
                        out.push(' ');
                    }
                }
            }
        }
    }
    if out.trim().is_empty() {
        return Err("Impossible d'extraire le texte du PDF — essayez un fichier .txt ou .md".into());
    }
    Ok(out)
}

fn chunk_text(text: &str) -> Vec<String> {
    let normalized = text.split_whitespace().collect::<Vec<_>>().join(" ");
    if normalized.is_empty() {
        return vec![];
    }
    let mut chunks = Vec::new();
    let mut start = 0;
    while start < normalized.len() {
        let end = (start + CHUNK_SIZE).min(normalized.len());
        let slice = &normalized[start..end];
        chunks.push(slice.to_string());
        if end >= normalized.len() {
            break;
        }
        start = end.saturating_sub(100);
    }
    chunks
}

pub fn save_uploaded_file(kb_id: &str, filename: &str, data: &[u8]) -> Result<PathBuf, String> {
    let dir = kb_files_dir(kb_id);
    fs::create_dir_all(&dir).map_err(|e| e.to_string())?;
    let path = dir.join(filename);
    fs::write(&path, data).map_err(|e| e.to_string())?;
    Ok(path)
}
