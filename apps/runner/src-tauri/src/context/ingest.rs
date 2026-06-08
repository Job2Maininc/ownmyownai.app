use super::store::{
    add_document_record, clear_document_index, get_document_record, insert_chunk, insert_embedding,
    kb_files_dir, set_document_status, upsert_linked_document, ContextLimits,
};
use crate::ollama::{create_embedding, EMBEDDING_MODEL};
use crate::settings::resolved_rag_chunk_tokens;
use std::fs;
use std::io::Read;
use std::path::{Path, PathBuf};

#[derive(Debug, Clone, serde::Serialize)]
#[serde(rename_all = "camelCase")]
pub struct IngestProgress {
    pub document_id: String,
    pub phase: String,
    pub percent: f64,
    pub message: String,
}

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
    index_document_content(&doc_id, filename, data).await
}

pub async fn ingest_from_path(
    kb_id: &str,
    path: &Path,
    link_id: Option<&str>,
    relative_path: Option<&str>,
    limits: &ContextLimits,
) -> Result<String, String> {
    if !path.is_file() {
        return Err(format!("Fichier introuvable : {}", path.display()));
    }

    let meta = fs::metadata(path).map_err(|e| e.to_string())?;
    let max_bytes = limits.max_file_mb as usize * 1024 * 1024;
    if meta.len() as usize > max_bytes {
        return Err(format!(
            "Fichier trop volumineux (max {} Mo) : {}",
            limits.max_file_mb,
            path.display()
        ));
    }

    let data = fs::read(path).map_err(|e| e.to_string())?;
    let filename = path
        .file_name()
        .and_then(|n| n.to_str())
        .unwrap_or("document");

    let doc_id = if let (Some(lid), Some(rel)) = (link_id, relative_path) {
        let mtime = file_mtime(path)?;
        upsert_linked_document(kb_id, lid, &path.to_path_buf(), rel, mtime, meta.len(), limits)?
    } else {
        add_document_record(kb_id, filename, &path.to_path_buf(), limits)?
    };

    index_document_content(&doc_id, filename, &data).await
}

pub async fn reindex_document(doc_id: &str) -> Result<(), String> {
    let record = get_document_record(doc_id)?;
    let path = PathBuf::from(&record.filepath);
    if !path.is_file() {
        set_document_status(doc_id, "error", Some("Fichier source introuvable"))?;
        return Err("Fichier source introuvable".into());
    }

    let data = fs::read(&path).map_err(|e| e.to_string())?;
    clear_document_index(doc_id)?;
    let _ = index_document_content(doc_id, &record.filename, &data).await?;
    Ok(())
}

pub async fn reindex_uploaded_documents(kb_id: &str) -> Result<u32, String> {
    let docs = super::store::list_documents(kb_id)?;
    let mut count = 0u32;
    for doc in docs {
        if doc.source_type == "upload" && doc.status != "indexing" {
            if reindex_document(&doc.id).await.is_ok() {
                count += 1;
            }
        }
    }
    Ok(count)
}

async fn index_document_content(
    doc_id: &str,
    filename: &str,
    data: &[u8],
) -> Result<String, String> {
    set_document_status(doc_id, "indexing", None)?;

    let text = match extract_text(filename, data) {
        Ok(t) => t,
        Err(e) => {
            set_document_status(doc_id, "error", Some(&e))?;
            return Err(e);
        }
    };

    let chunks = chunk_text_by_tokens(&text, resolved_rag_chunk_tokens());
    if chunks.is_empty() {
        let msg = "Aucun texte extractible dans ce fichier";
        set_document_status(doc_id, "error", Some(msg))?;
        return Err(msg.into());
    }

    for (index, chunk) in chunks.iter().enumerate() {
        let chunk_id = insert_chunk(doc_id, index as u32, chunk)?;
        match create_embedding(EMBEDDING_MODEL, chunk).await {
            Ok(vector) => insert_embedding(&chunk_id, &vector)?,
            Err(e) => {
                set_document_status(doc_id, "error", Some(&e))?;
                return Err(e);
            }
        }
    }

    set_document_status(doc_id, "ready", None)?;
    Ok(doc_id.to_string())
}

pub fn file_mtime(path: &Path) -> Result<i64, String> {
    let meta = fs::metadata(path).map_err(|e| e.to_string())?;
    let modified = meta.modified().map_err(|e| e.to_string())?;
    Ok(modified
        .duration_since(std::time::UNIX_EPOCH)
        .map_err(|e| e.to_string())?
        .as_secs() as i64)
}

pub fn is_supported_extension(path: &Path) -> bool {
    let ext = path
        .extension()
        .and_then(|e| e.to_str())
        .unwrap_or("")
        .to_lowercase();
    matches!(ext.as_str(), "txt" | "md" | "pdf" | "docx")
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
    if lower.ends_with(".docx") {
        return extract_docx_text(data);
    }
    Err(format!(
        "Format non supporté : {filename}. Formats acceptés : .txt, .md, .pdf, .docx"
    ))
}

fn extract_pdf_text(data: &[u8]) -> Result<String, String> {
    match pdf_extract::extract_text_from_mem(data) {
        Ok(text) => {
            let cleaned = text.split_whitespace().collect::<Vec<_>>().join(" ");
            if cleaned.len() < 20 {
                Err(
                    "Impossible d'extraire suffisamment de texte de ce PDF. Exportez en .txt ou .md."
                        .into(),
                )
            } else {
                Ok(cleaned)
            }
        }
        Err(_) => extract_pdf_text_legacy(data),
    }
}

fn extract_pdf_text_legacy(data: &[u8]) -> Result<String, String> {
    if !data.starts_with(b"%PDF") {
        return Err("Fichier PDF invalide ou corrompu.".into());
    }
    let text = String::from_utf8_lossy(data);
    let mut out = String::new();
    for line in text.lines() {
        if line.contains("Tj") || line.contains("TJ") {
            for segment in line.split('(') {
                if let Some(end) = segment.find(')') {
                    let fragment = segment[..end].trim();
                    if !fragment.is_empty() && fragment.chars().any(|c| c.is_alphanumeric()) {
                        out.push_str(fragment);
                        out.push(' ');
                    }
                }
            }
        }
    }
    let cleaned = out.split_whitespace().collect::<Vec<_>>().join(" ");
    if cleaned.len() < 40 {
        return Err(
            "Impossible d'extraire suffisamment de texte de ce PDF (probablement scanné ou protégé)."
                .into(),
        );
    }
    Ok(cleaned)
}

fn extract_docx_text(data: &[u8]) -> Result<String, String> {
    use std::io::Cursor;
    let cursor = Cursor::new(data);
    let mut archive = zip::ZipArchive::new(cursor).map_err(|e| e.to_string())?;
    let mut doc = archive
        .by_name("word/document.xml")
        .map_err(|_| "DOCX invalide (document.xml introuvable)")?;
    let mut xml = String::new();
    doc.read_to_string(&mut xml).map_err(|e| e.to_string())?;
    let text = strip_xml_text(&xml);
    if text.len() < 20 {
        return Err("DOCX vide ou illisible.".into());
    }
    Ok(text)
}

fn strip_xml_text(xml: &str) -> String {
    let mut out = String::new();
    let mut in_tag = false;
    for ch in xml.chars() {
        match ch {
            '<' => in_tag = true,
            '>' => in_tag = false,
            _ if !in_tag => out.push(ch),
            _ => {}
        }
    }
    out.split_whitespace().collect::<Vec<_>>().join(" ")
}

/// Découpe approximative par tokens (~4 caractères par token).
fn chunk_text_by_tokens(text: &str, max_tokens: usize) -> Vec<String> {
    let normalized = text.split_whitespace().collect::<Vec<_>>().join(" ");
    if normalized.is_empty() {
        return vec![];
    }
    let chunk_chars = max_tokens.saturating_mul(4).max(200);
    let overlap_chars = chunk_chars / 10;
    let mut chunks = Vec::new();
    let mut start = 0;
    while start < normalized.len() {
        let end = (start + chunk_chars).min(normalized.len());
        let slice = &normalized[start..end];
        chunks.push(slice.to_string());
        if end >= normalized.len() {
            break;
        }
        start = end.saturating_sub(overlap_chars);
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
