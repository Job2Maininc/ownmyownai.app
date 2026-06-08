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
    #[serde(default = "default_source_type")]
    pub source_type: String,
    pub link_id: Option<String>,
    pub relative_path: Option<String>,
    pub external_path: Option<String>,
    pub source_mtime: Option<i64>,
    pub source_size: Option<u64>,
}

fn default_source_type() -> String {
    "upload".into()
}

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct ContextLink {
    pub id: String,
    pub knowledge_base_id: String,
    pub link_type: String,
    pub path: String,
    pub recursive: bool,
    pub enabled: bool,
    pub last_sync_at: Option<String>,
    pub last_sync_status: String,
    pub last_sync_error: Option<String>,
    pub doc_count: u32,
}

#[derive(Debug, Clone)]
pub struct DocumentRecord {
    pub id: String,
    pub knowledge_base_id: String,
    pub filename: String,
    pub filepath: String,
    pub source_type: String,
    pub link_id: Option<String>,
    pub relative_path: Option<String>,
    pub source_mtime: Option<i64>,
    pub source_size: Option<u64>,
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
    pub linked_doc_count: u32,
    pub status: String,
    pub sync_status: String,
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
        CREATE TABLE IF NOT EXISTS context_links (
          id TEXT PRIMARY KEY,
          knowledge_base_id TEXT NOT NULL,
          link_type TEXT NOT NULL,
          path TEXT NOT NULL,
          recursive INTEGER NOT NULL DEFAULT 1,
          enabled INTEGER NOT NULL DEFAULT 1,
          last_sync_at TEXT,
          last_sync_status TEXT NOT NULL DEFAULT 'pending',
          last_sync_error TEXT,
          FOREIGN KEY (knowledge_base_id) REFERENCES knowledge_bases(id) ON DELETE CASCADE
        );
        CREATE UNIQUE INDEX IF NOT EXISTS idx_documents_link_relative
          ON documents(link_id, relative_path)
          WHERE link_id IS NOT NULL AND relative_path IS NOT NULL;
        ",
    )
    .map_err(|e| e.to_string())?;
    migrate_schema_v2(conn)
}

fn migrate_schema_v2(conn: &Connection) -> Result<(), String> {
    let alters = [
        "ALTER TABLE documents ADD COLUMN source_type TEXT NOT NULL DEFAULT 'upload'",
        "ALTER TABLE documents ADD COLUMN link_id TEXT",
        "ALTER TABLE documents ADD COLUMN relative_path TEXT",
        "ALTER TABLE documents ADD COLUMN source_mtime INTEGER",
        "ALTER TABLE documents ADD COLUMN source_size INTEGER",
    ];
    for sql in alters {
        let _ = conn.execute(sql, []);
    }
    Ok(())
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
        let docs: Vec<(String, String, String)> = conn
            .prepare("SELECT id, filepath, source_type FROM documents WHERE knowledge_base_id = ?1")
            .map_err(|e| e.to_string())?
            .query_map(params![id], |row| Ok((row.get(0)?, row.get(1)?, row.get(2)?)))
            .map_err(|e| e.to_string())?
            .filter_map(|r| r.ok())
            .collect();
        for (_, path, source_type) in &docs {
            if source_type == "upload" {
                let _ = fs::remove_file(path);
            }
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
            "INSERT INTO documents (id, knowledge_base_id, filename, filepath, status, source_type) VALUES (?1, ?2, ?3, ?4, 'indexing', 'upload')",
            params![id, kb_id, filename, filepath.to_string_lossy().as_ref()],
        )
        .map_err(|e| e.to_string())?;
        Ok(id)
    })
}

pub fn upsert_linked_document(
    kb_id: &str,
    link_id: &str,
    filepath: &PathBuf,
    relative_path: &str,
    mtime: i64,
    size: u64,
    limits: &ContextLimits,
) -> Result<String, String> {
    with_db(|conn| {
        let existing: Option<String> = conn
            .query_row(
                "SELECT id FROM documents WHERE link_id = ?1 AND relative_path = ?2",
                params![link_id, relative_path],
                |r| r.get(0),
            )
            .ok();

        if let Some(id) = existing {
            conn.execute(
                "UPDATE documents SET filepath = ?1, filename = ?2, source_mtime = ?3, source_size = ?4, status = 'indexing', error_message = NULL WHERE id = ?5",
                params![
                    filepath.to_string_lossy().as_ref(),
                    filepath.file_name().and_then(|n| n.to_str()).unwrap_or(relative_path),
                    mtime,
                    size,
                    id
                ],
            )
            .map_err(|e| e.to_string())?;
            return Ok(id);
        }

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
        let filename = filepath
            .file_name()
            .and_then(|n| n.to_str())
            .unwrap_or(relative_path);
        conn.execute(
            "INSERT INTO documents (id, knowledge_base_id, filename, filepath, status, source_type, link_id, relative_path, source_mtime, source_size)
             VALUES (?1, ?2, ?3, ?4, 'indexing', 'linked', ?5, ?6, ?7, ?8)",
            params![
                id,
                kb_id,
                filename,
                filepath.to_string_lossy().as_ref(),
                link_id,
                relative_path,
                mtime,
                size
            ],
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
        let row: Option<(String, String)> = conn
            .query_row(
                "SELECT filepath, source_type FROM documents WHERE id = ?1",
                params![doc_id],
                |r| Ok((r.get(0)?, r.get(1)?)),
            )
            .ok();
        delete_document_chunks(conn, doc_id)?;
        conn.execute("DELETE FROM documents WHERE id = ?1", params![doc_id])
            .map_err(|e| e.to_string())?;
        if let Some((path, source_type)) = row {
            if source_type == "upload" {
                let _ = fs::remove_file(path);
            }
        }
        Ok(())
    })
}

pub fn delete_documents_for_link(link_id: &str) -> Result<(), String> {
    with_db(|conn| {
        let ids: Vec<String> = conn
            .prepare("SELECT id FROM documents WHERE link_id = ?1")
            .map_err(|e| e.to_string())?
            .query_map(params![link_id], |r| r.get(0))
            .map_err(|e| e.to_string())?
            .filter_map(|r| r.ok())
            .collect();
        for id in ids {
            delete_document_chunks(conn, &id)?;
            conn.execute("DELETE FROM documents WHERE id = ?1", params![id])
                .map_err(|e| e.to_string())?;
        }
        Ok(())
    })
}

pub fn clear_document_index(doc_id: &str) -> Result<(), String> {
    with_db(|conn| delete_document_chunks(conn, doc_id))
}

fn delete_document_chunks(conn: &Connection, doc_id: &str) -> Result<(), String> {
    conn.execute(
        "DELETE FROM embeddings WHERE chunk_id IN (SELECT id FROM chunks WHERE document_id = ?1)",
        params![doc_id],
    )
    .map_err(|e| e.to_string())?;
    conn.execute("DELETE FROM chunks WHERE document_id = ?1", params![doc_id])
        .map_err(|e| e.to_string())?;
    Ok(())
}

pub fn get_document_record(doc_id: &str) -> Result<DocumentRecord, String> {
    with_db(|conn| {
        conn.query_row(
            "SELECT id, knowledge_base_id, filename, filepath, source_type, link_id, relative_path, source_mtime, source_size
             FROM documents WHERE id = ?1",
            params![doc_id],
            |row| {
                Ok(DocumentRecord {
                    id: row.get(0)?,
                    knowledge_base_id: row.get(1)?,
                    filename: row.get(2)?,
                    filepath: row.get(3)?,
                    source_type: row.get(4)?,
                    link_id: row.get(5)?,
                    relative_path: row.get(6)?,
                    source_mtime: row.get(7)?,
                    source_size: row.get(8)?,
                })
            },
        )
        .map_err(|e| e.to_string())
    })
}

pub fn list_documents_for_link(link_id: &str) -> Result<Vec<DocumentRecord>, String> {
    with_db(|conn| {
        let mut stmt = conn
            .prepare(
                "SELECT id, knowledge_base_id, filename, filepath, source_type, link_id, relative_path, source_mtime, source_size
                 FROM documents WHERE link_id = ?1",
            )
            .map_err(|e| e.to_string())?;
        let rows = stmt
            .query_map(params![link_id], |row| {
                Ok(DocumentRecord {
                    id: row.get(0)?,
                    knowledge_base_id: row.get(1)?,
                    filename: row.get(2)?,
                    filepath: row.get(3)?,
                    source_type: row.get(4)?,
                    link_id: row.get(5)?,
                    relative_path: row.get(6)?,
                    source_mtime: row.get(7)?,
                    source_size: row.get(8)?,
                })
            })
            .map_err(|e| e.to_string())?;
        rows.collect::<Result<Vec<_>, _>>().map_err(|e| e.to_string())
    })
}

pub fn remove_stale_linked_documents(link_id: &str, keep_paths: &[String]) -> Result<Vec<String>, String> {
    with_db(|conn| {
        let mut stmt = conn
            .prepare("SELECT id, relative_path FROM documents WHERE link_id = ?1")
            .map_err(|e| e.to_string())?;
        let rows: Vec<(String, Option<String>)> = stmt
            .query_map(params![link_id], |r| Ok((r.get(0)?, r.get(1)?)))
            .map_err(|e| e.to_string())?
            .filter_map(|r| r.ok())
            .collect();
        let mut removed = Vec::new();
        for (id, rel) in rows {
            let rel = rel.unwrap_or_default();
            if !keep_paths.contains(&rel) {
                delete_document_chunks(conn, &id)?;
                conn.execute("DELETE FROM documents WHERE id = ?1", params![id])
                    .map_err(|e| e.to_string())?;
                removed.push(id);
            }
        }
        Ok(removed)
    })
}

pub fn list_documents(kb_id: &str) -> Result<Vec<DocumentInfo>, String> {
    with_db(|conn| {
        let mut stmt = conn
            .prepare(
                "SELECT d.id, d.knowledge_base_id, d.filename, d.status, d.error_message,
                        (SELECT COUNT(*) FROM chunks c WHERE c.document_id = d.id) as chunk_count,
                        d.source_type, d.link_id, d.relative_path, d.filepath, d.source_mtime, d.source_size
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
                    source_type: row.get(6)?,
                    link_id: row.get(7)?,
                    relative_path: row.get(8)?,
                    external_path: row.get(9)?,
                    source_mtime: row.get(10)?,
                    source_size: row.get(11)?,
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
        .map(|kb| {
            let linked_doc_count = list_documents(&kb.id)
                .unwrap_or_default()
                .into_iter()
                .filter(|d| d.source_type == "linked")
                .count() as u32;
            let sync_status = list_context_links(&kb.id)
                .ok()
                .and_then(|links| {
                    if links.is_empty() {
                        None
                    } else if links.iter().any(|l| l.last_sync_status == "syncing") {
                        Some("syncing".to_string())
                    } else if links.iter().any(|l| l.last_sync_status == "error") {
                        Some("error".to_string())
                    } else {
                        Some("ready".to_string())
                    }
                })
                .unwrap_or_else(|| "ready".to_string());
            ContextSummaryEntry {
                id: kb.id,
                name: kb.name,
                doc_count: kb.doc_count,
                linked_doc_count,
                status: kb.status,
                sync_status,
            }
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

pub fn create_context_link(
    kb_id: &str,
    link_type: &str,
    path: &str,
    recursive: bool,
) -> Result<ContextLink, String> {
    with_db(|conn| {
        let id = Uuid::new_v4().to_string();
        conn.execute(
            "INSERT INTO context_links (id, knowledge_base_id, link_type, path, recursive, enabled, last_sync_status)
             VALUES (?1, ?2, ?3, ?4, ?5, 1, 'pending')",
            params![id, kb_id, link_type, path, recursive as i32],
        )
        .map_err(|e| e.to_string())?;
        Ok(ContextLink {
            id,
            knowledge_base_id: kb_id.to_string(),
            link_type: link_type.to_string(),
            path: path.to_string(),
            recursive,
            enabled: true,
            last_sync_at: None,
            last_sync_status: "pending".into(),
            last_sync_error: None,
            doc_count: 0,
        })
    })
}

pub fn list_context_links(kb_id: &str) -> Result<Vec<ContextLink>, String> {
    with_db(|conn| {
        let mut stmt = conn
            .prepare(
                "SELECT cl.id, cl.knowledge_base_id, cl.link_type, cl.path, cl.recursive, cl.enabled,
                        cl.last_sync_at, cl.last_sync_status, cl.last_sync_error,
                        (SELECT COUNT(*) FROM documents d WHERE d.link_id = cl.id) as doc_count
                 FROM context_links cl WHERE cl.knowledge_base_id = ?1 ORDER BY cl.path",
            )
            .map_err(|e| e.to_string())?;
        let rows = stmt
            .query_map(params![kb_id], |row| {
                Ok(ContextLink {
                    id: row.get(0)?,
                    knowledge_base_id: row.get(1)?,
                    link_type: row.get(2)?,
                    path: row.get(3)?,
                    recursive: row.get::<_, i32>(4)? != 0,
                    enabled: row.get::<_, i32>(5)? != 0,
                    last_sync_at: row.get(6)?,
                    last_sync_status: row.get(7)?,
                    last_sync_error: row.get(8)?,
                    doc_count: row.get(9)?,
                })
            })
            .map_err(|e| e.to_string())?;
        rows.collect::<Result<Vec<_>, _>>().map_err(|e| e.to_string())
    })
}

pub fn list_all_context_links() -> Result<Vec<ContextLink>, String> {
    with_db(|conn| {
        let mut stmt = conn
            .prepare(
                "SELECT cl.id, cl.knowledge_base_id, cl.link_type, cl.path, cl.recursive, cl.enabled,
                        cl.last_sync_at, cl.last_sync_status, cl.last_sync_error,
                        (SELECT COUNT(*) FROM documents d WHERE d.link_id = cl.id) as doc_count
                 FROM context_links cl ORDER BY cl.path",
            )
            .map_err(|e| e.to_string())?;
        let rows = stmt
            .query_map([], |row| {
                Ok(ContextLink {
                    id: row.get(0)?,
                    knowledge_base_id: row.get(1)?,
                    link_type: row.get(2)?,
                    path: row.get(3)?,
                    recursive: row.get::<_, i32>(4)? != 0,
                    enabled: row.get::<_, i32>(5)? != 0,
                    last_sync_at: row.get(6)?,
                    last_sync_status: row.get(7)?,
                    last_sync_error: row.get(8)?,
                    doc_count: row.get(9)?,
                })
            })
            .map_err(|e| e.to_string())?;
        rows.collect::<Result<Vec<_>, _>>().map_err(|e| e.to_string())
    })
}

pub fn get_context_link(link_id: &str) -> Result<ContextLink, String> {
    with_db(|conn| {
        conn.query_row(
            "SELECT cl.id, cl.knowledge_base_id, cl.link_type, cl.path, cl.recursive, cl.enabled,
                    cl.last_sync_at, cl.last_sync_status, cl.last_sync_error,
                    (SELECT COUNT(*) FROM documents d WHERE d.link_id = cl.id) as doc_count
             FROM context_links cl WHERE cl.id = ?1",
            params![link_id],
            |row| {
                Ok(ContextLink {
                    id: row.get(0)?,
                    knowledge_base_id: row.get(1)?,
                    link_type: row.get(2)?,
                    path: row.get(3)?,
                    recursive: row.get::<_, i32>(4)? != 0,
                    enabled: row.get::<_, i32>(5)? != 0,
                    last_sync_at: row.get(6)?,
                    last_sync_status: row.get(7)?,
                    last_sync_error: row.get(8)?,
                    doc_count: row.get(9)?,
                })
            },
        )
        .map_err(|e| e.to_string())
    })
}

pub fn set_context_link_enabled(link_id: &str, enabled: bool) -> Result<(), String> {
    with_db(|conn| {
        conn.execute(
            "UPDATE context_links SET enabled = ?1 WHERE id = ?2",
            params![enabled as i32, link_id],
        )
        .map_err(|e| e.to_string())?;
        Ok(())
    })
}

pub fn update_context_link_sync(
    link_id: &str,
    status: &str,
    error: Option<&str>,
) -> Result<(), String> {
    with_db(|conn| {
        let now = chrono::Utc::now().to_rfc3339();
        conn.execute(
            "UPDATE context_links SET last_sync_at = ?1, last_sync_status = ?2, last_sync_error = ?3 WHERE id = ?4",
            params![now, status, error, link_id],
        )
        .map_err(|e| e.to_string())?;
        Ok(())
    })
}

pub fn delete_context_link(link_id: &str) -> Result<(), String> {
    delete_documents_for_link(link_id)?;
    with_db(|conn| {
        conn.execute("DELETE FROM context_links WHERE id = ?1", params![link_id])
            .map_err(|e| e.to_string())?;
        Ok(())
    })
}
