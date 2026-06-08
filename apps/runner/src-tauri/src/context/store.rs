use super::{context_db_path, context_root_dir};
use rusqlite::{params, Connection};
use serde::Serialize;
use std::fs;
use std::path::PathBuf;
use uuid::Uuid;

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct KnowledgeBase {
    pub id: String,
    pub name: String,
    pub description: String,
    pub doc_count: u32,
    pub status: String,
    pub created_at: String,
}

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct DocumentInfo {
    pub id: String,
    pub knowledge_base_id: String,
    pub filename: String,
    pub status: String,
    pub chunk_count: u32,
    pub error_message: Option<String>,
}

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct ChunkPreview {
    pub id: String,
    pub document_id: String,
    pub index: u32,
    pub preview: String,
}

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct ContextSummaryEntry {
    pub id: String,
    pub name: String,
    pub doc_count: u32,
    pub status: String,
}

#[derive(Debug, Clone)]
pub struct ContextLimits {
    pub max_bases: u32,
    pub max_docs_per_base: u32,
    pub max_file_mb: u32,
}

impl Default for ContextLimits {
    fn default() -> Self {
        Self {
            max_bases: 10,
            max_docs_per_base: 50,
            max_file_mb: 10,
        }
    }
}

fn with_db<F, T>(f: F) -> Result<T, String>
where
    F: FnOnce(&Connection) -> Result<T, String>,
{
    let path = context_db_path();
    if let Some(parent) = path.parent() {
        fs::create_dir_all(parent).map_err(|e| e.to_string())?;
    }
    let conn = Connection::open(&path).map_err(|e| e.to_string())?;
    init_db_schema(&conn)?;
    f(&conn)
}

fn init_db_schema(conn: &Connection) -> Result<(), String> {
    conn.execute_batch(
        "
        CREATE TABLE IF NOT EXISTS knowledge_bases (
          id TEXT PRIMARY KEY,
          name TEXT NOT NULL,
          description TEXT NOT NULL DEFAULT '',
          status TEXT NOT NULL DEFAULT 'ready',
          created_at TEXT NOT NULL
        );
        CREATE TABLE IF NOT EXISTS documents (
          id TEXT PRIMARY KEY,
          knowledge_base_id TEXT NOT NULL,
          filename TEXT NOT NULL,
          filepath TEXT NOT NULL,
          status TEXT NOT NULL DEFAULT 'pending',
          error_message TEXT,
          FOREIGN KEY (knowledge_base_id) REFERENCES knowledge_bases(id) ON DELETE CASCADE
        );
        CREATE TABLE IF NOT EXISTS chunks (
          id TEXT PRIMARY KEY,
          document_id TEXT NOT NULL,
          chunk_index INTEGER NOT NULL,
          content TEXT NOT NULL,
          FOREIGN KEY (document_id) REFERENCES documents(id) ON DELETE CASCADE
        );
        CREATE TABLE IF NOT EXISTS embeddings (
          chunk_id TEXT PRIMARY KEY,
          vector BLOB NOT NULL,
          FOREIGN KEY (chunk_id) REFERENCES chunks(id) ON DELETE CASCADE
        );
        ",
    )
    .map_err(|e| e.to_string())
}

pub fn init_db() -> Result<(), String> {
    fs::create_dir_all(context_root_dir()).map_err(|e| e.to_string())?;
    with_db(|_| Ok(()))
}

pub fn create_knowledge_base(name: &str, description: &str, limits: &ContextLimits) -> Result<KnowledgeBase, String> {
    with_db(|conn| {
        let count: u32 = conn
            .query_row("SELECT COUNT(*) FROM knowledge_bases", [], |r| r.get(0))
            .map_err(|e| e.to_string())?;
        if count >= limits.max_bases {
            return Err(format!("Limite de {} bases atteinte", limits.max_bases));
        }
        let id = Uuid::new_v4().to_string();
        let now = chrono::Utc::now().to_rfc3339();
        conn.execute(
            "INSERT INTO knowledge_bases (id, name, description, status, created_at) VALUES (?1, ?2, ?3, 'ready', ?4)",
            params![id, name, description, now],
        )
        .map_err(|e| e.to_string())?;
        Ok(KnowledgeBase {
            id,
            name: name.to_string(),
            description: description.to_string(),
            doc_count: 0,
            status: "ready".into(),
            created_at: now,
        })
    })
}

pub fn list_knowledge_bases() -> Result<Vec<KnowledgeBase>, String> {
    with_db(|conn| {
        let mut stmt = conn
            .prepare(
                "SELECT kb.id, kb.name, kb.description, kb.status, kb.created_at,
                        (SELECT COUNT(*) FROM documents d WHERE d.knowledge_base_id = kb.id) as doc_count
                 FROM knowledge_bases kb ORDER BY kb.created_at DESC",
            )
            .map_err(|e| e.to_string())?;
        let rows = stmt
            .query_map([], |row| {
                Ok(KnowledgeBase {
                    id: row.get(0)?,
                    name: row.get(1)?,
                    description: row.get(2)?,
                    status: row.get(3)?,
                    created_at: row.get(4)?,
                    doc_count: row.get(5)?,
                })
            })
            .map_err(|e| e.to_string())?;
        rows.collect::<Result<Vec<_>, _>>().map_err(|e| e.to_string())
    })
}

pub fn delete_knowledge_base(id: &str) -> Result<(), String> {
    with_db(|conn| {
        let docs: Vec<(String, String)> = conn
            .prepare("SELECT id, filepath FROM documents WHERE knowledge_base_id = ?1")
            .map_err(|e| e.to_string())?
            .query_map(params![id], |row| Ok((row.get(0)?, row.get(1)?)))
            .map_err(|e| e.to_string())?
            .filter_map(|r| r.ok())
            .collect();
        for (_, path) in &docs {
            let _ = fs::remove_file(path);
        }
        conn.execute("DELETE FROM knowledge_bases WHERE id = ?1", params![id])
            .map_err(|e| e.to_string())?;
        Ok(())
    })
}

pub fn add_document_record(
    kb_id: &str,
    filename: &str,
    filepath: &PathBuf,
    limits: &ContextLimits,
) -> Result<String, String> {
    with_db(|conn| {
        let doc_count: u32 = conn
            .query_row(
                "SELECT COUNT(*) FROM documents WHERE knowledge_base_id = ?1",
                params![kb_id],
                |r| r.get(0),
            )
            .map_err(|e| e.to_string())?;
        if doc_count >= limits.max_docs_per_base {
            return Err(format!(
                "Limite de {} documents par base atteinte",
                limits.max_docs_per_base
            ));
        }
        let id = Uuid::new_v4().to_string();
        conn.execute(
            "INSERT INTO documents (id, knowledge_base_id, filename, filepath, status) VALUES (?1, ?2, ?3, ?4, 'indexing')",
            params![id, kb_id, filename, filepath.to_string_lossy().as_ref()],
        )
        .map_err(|e| e.to_string())?;
        Ok(id)
    })
}

pub fn set_document_status(doc_id: &str, status: &str, error: Option<&str>) -> Result<(), String> {
    with_db(|conn| {
        conn.execute(
            "UPDATE documents SET status = ?1, error_message = ?2 WHERE id = ?3",
            params![status, error, doc_id],
        )
        .map_err(|e| e.to_string())?;
        Ok(())
    })
}

pub fn delete_document(doc_id: &str) -> Result<(), String> {
    with_db(|conn| {
        let path: Option<String> = conn
            .query_row(
                "SELECT filepath FROM documents WHERE id = ?1",
                params![doc_id],
                |r| r.get(0),
            )
            .ok();
        conn.execute("DELETE FROM documents WHERE id = ?1", params![doc_id])
            .map_err(|e| e.to_string())?;
        if let Some(p) = path {
            let _ = fs::remove_file(p);
        }
        Ok(())
    })
}

pub fn list_documents(kb_id: &str) -> Result<Vec<DocumentInfo>, String> {
    with_db(|conn| {
        let mut stmt = conn
            .prepare(
                "SELECT d.id, d.knowledge_base_id, d.filename, d.status, d.error_message,
                        (SELECT COUNT(*) FROM chunks c WHERE c.document_id = d.id) as chunk_count
                 FROM documents d WHERE d.knowledge_base_id = ?1 ORDER BY d.filename",
            )
            .map_err(|e| e.to_string())?;
        let rows = stmt
            .query_map(params![kb_id], |row| {
                Ok(DocumentInfo {
                    id: row.get(0)?,
                    knowledge_base_id: row.get(1)?,
                    filename: row.get(2)?,
                    status: row.get(3)?,
                    error_message: row.get(4)?,
                    chunk_count: row.get(5)?,
                })
            })
            .map_err(|e| e.to_string())?;
        rows.collect::<Result<Vec<_>, _>>().map_err(|e| e.to_string())
    })
}

pub fn list_chunks(doc_id: &str) -> Result<Vec<ChunkPreview>, String> {
    with_db(|conn| {
        let mut stmt = conn
            .prepare(
                "SELECT id, document_id, chunk_index, content FROM chunks WHERE document_id = ?1 ORDER BY chunk_index",
            )
            .map_err(|e| e.to_string())?;
        let rows = stmt
            .query_map(params![doc_id], |row| {
                let content: String = row.get(3)?;
                let preview = if content.len() > 200 {
                    format!("{}…", &content[..200])
                } else {
                    content
                };
                Ok(ChunkPreview {
                    id: row.get(0)?,
                    document_id: row.get(1)?,
                    index: row.get(2)?,
                    preview,
                })
            })
            .map_err(|e| e.to_string())?;
        rows.collect::<Result<Vec<_>, _>>().map_err(|e| e.to_string())
    })
}

pub fn insert_chunk(doc_id: &str, index: u32, content: &str) -> Result<String, String> {
    with_db(|conn| {
        let id = Uuid::new_v4().to_string();
        conn.execute(
            "INSERT INTO chunks (id, document_id, chunk_index, content) VALUES (?1, ?2, ?3, ?4)",
            params![id, doc_id, index, content],
        )
        .map_err(|e| e.to_string())?;
        Ok(id)
    })
}

pub fn insert_embedding(chunk_id: &str, vector: &[f32]) -> Result<(), String> {
    let bytes: Vec<u8> = vector.iter().flat_map(|f| f.to_le_bytes()).collect();
    with_db(|conn| {
        conn.execute(
            "INSERT OR REPLACE INTO embeddings (chunk_id, vector) VALUES (?1, ?2)",
            params![chunk_id, bytes],
        )
        .map_err(|e| e.to_string())?;
        Ok(())
    })
}

pub fn get_embeddings_for_bases(kb_ids: &[String]) -> Result<Vec<(String, Vec<f32>)>, String> {
    if kb_ids.is_empty() {
        return Ok(vec![]);
    }
    let mut all = Vec::new();
    for kb_id in kb_ids {
        let mut batch = with_db(|conn| {
            let mut stmt = conn
                .prepare(
                    "SELECT c.content, e.vector FROM chunks c
                     JOIN embeddings e ON e.chunk_id = c.id
                     JOIN documents d ON d.id = c.document_id
                     WHERE d.knowledge_base_id = ?1 AND d.status = 'ready'",
                )
                .map_err(|e| e.to_string())?;
            let rows = stmt
                .query_map(params![kb_id], |row| {
                    let content: String = row.get(0)?;
                    let blob: Vec<u8> = row.get(1)?;
                    let vector: Vec<f32> = blob
                        .chunks_exact(4)
                        .map(|c| f32::from_le_bytes([c[0], c[1], c[2], c[3]]))
                        .collect();
                    Ok((content, vector))
                })
                .map_err(|e| e.to_string())?;
            rows.collect::<Result<Vec<_>, _>>().map_err(|e| e.to_string())
        })?;
        all.append(&mut batch);
    }
    Ok(all)
}

pub fn get_context_summary() -> Vec<ContextSummaryEntry> {
    list_knowledge_bases()
        .unwrap_or_default()
        .into_iter()
        .map(|kb| ContextSummaryEntry {
            id: kb.id,
            name: kb.name,
            doc_count: kb.doc_count,
            status: kb.status,
        })
        .collect()
}

pub fn kb_files_dir(kb_id: &str) -> PathBuf {
    context_root_dir().join(kb_id)
}

pub fn export_knowledge_base(kb_id: &str, dest_zip: &PathBuf) -> Result<(), String> {
    use std::io::Write;
    use zip::write::SimpleFileOptions;
    use zip::ZipWriter;

    let file = fs::File::create(dest_zip).map_err(|e| e.to_string())?;
    let mut zip = ZipWriter::new(file);
    let options = SimpleFileOptions::default();

    let meta = serde_json::json!({
        "knowledge_base_id": kb_id,
        "exported_at": chrono::Utc::now().to_rfc3339(),
    });
    zip.start_file("meta.json", options)
        .map_err(|e| e.to_string())?;
    zip.write_all(meta.to_string().as_bytes())
        .map_err(|e| e.to_string())?;

    let docs = list_documents(kb_id)?;
    for doc in docs {
        let path = kb_files_dir(kb_id).join(&doc.filename);
        if path.exists() {
            let data = fs::read(&path).map_err(|e| e.to_string())?;
            zip.start_file(format!("files/{}", doc.filename), options)
                .map_err(|e| e.to_string())?;
            zip.write_all(&data).map_err(|e| e.to_string())?;
        }
    }
    zip.finish().map_err(|e| e.to_string())?;
    Ok(())
}

pub fn import_knowledge_base(zip_path: &PathBuf, limits: &ContextLimits) -> Result<KnowledgeBase, String> {
    use std::io::Read;
    use zip::ZipArchive;

    let file = fs::File::open(zip_path).map_err(|e| e.to_string())?;
    let mut archive = ZipArchive::new(file).map_err(|e| e.to_string())?;
    let kb = create_knowledge_base("Import", "Base importée", limits)?;
    let dir = kb_files_dir(&kb.id);
    fs::create_dir_all(&dir).map_err(|e| e.to_string())?;

    for i in 0..archive.len() {
        let mut entry = archive.by_index(i).map_err(|e| e.to_string())?;
        let name = entry.name().to_string();
        if name.starts_with("files/") {
            let filename = name.trim_start_matches("files/");
            let dest = dir.join(filename);
            let mut data = Vec::new();
            entry.read_to_end(&mut data).map_err(|e| e.to_string())?;
            fs::write(&dest, &data).map_err(|e| e.to_string())?;
            let _ = add_document_record(&kb.id, filename, &dest, limits);
        }
    }
    Ok(kb)
}
