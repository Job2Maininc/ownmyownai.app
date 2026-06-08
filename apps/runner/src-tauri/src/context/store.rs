use super::audit::{log_audit, AuditAction};
use super::vision::{document_media_type, is_image_filename};
use super::db_crypto::{
    ensure_decrypted_working_db, migrate_plain_to_encrypted_if_needed,
    persist_encrypted_working_db,
};
use super::{context_db_path, context_root_dir};
use crate::settings::{
    default_allowed_extensions_list, normalize_allowed_extensions, resolved_default_allowed_extensions,
};
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
    #[serde(default)]
    pub system_instruction: String,
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
    #[serde(default = "default_media_type")]
    pub media_type: String,
}

fn default_media_type() -> String {
    "text".into()
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
    pub symbol_count: u32,
    pub allowed_extensions: Vec<String>,
}

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct CodeSymbolHit {
    pub name: String,
    pub kind: String,
    pub relative_path: String,
    pub line_number: u32,
    pub signature: String,
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
    pub content_hash: Option<String>,
    pub canonical_document_id: Option<String>,
}

/// SHA-256 hex digest of raw file bytes for cross-link deduplication.
pub fn compute_content_hash(data: &[u8]) -> String {
    use sha2::{Digest, Sha256};
    let digest = Sha256::digest(data);
    format!("{digest:x}")
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

    migrate_plain_to_encrypted_if_needed()?;
    ensure_decrypted_working_db()?;

    let conn = Connection::open(&path).map_err(|e| e.to_string())?;
    init_db_schema(&conn)?;
    let result = f(&conn);

    let _ = conn.execute_batch("PRAGMA wal_checkpoint(TRUNCATE);");
    drop(conn);
    if let Err(e) = persist_encrypted_working_db() {
        if result.is_ok() {
            return Err(e);
        }
        eprintln!("context.db DPAPI persist failed: {e}");
    }

    result
}

/// Public alias used by other Host modules (e.g. projects).
pub fn with_context_db<F, T>(f: F) -> Result<T, String>
where
    F: FnOnce(&Connection) -> Result<T, String>,
{
    with_db(f)
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
    migrate_schema_v2(conn)?;
    migrate_schema_v3_projects(conn)?;
    migrate_schema_v4_codebase_index(conn)?;
    migrate_schema_v4_kb_system_instruction(conn)?;
    migrate_schema_v5_user_memory(conn)?;
    migrate_schema_v6_content_dedup(conn)?;
    migrate_schema_v7_audit(conn)?;
    migrate_schema_v8_extension_policy(conn)?;
    init_fts_schema(conn)?;
    backfill_fts_if_empty(conn)
}

fn migrate_schema_v8_extension_policy(conn: &Connection) -> Result<(), String> {
    let _ = conn.execute(
        "ALTER TABLE context_links ADD COLUMN allowed_extensions TEXT",
        [],
    );
    let default_json = serde_json::to_string(&default_allowed_extensions_list())
        .unwrap_or_else(|_| r#"["txt","md","pdf","docx","png","jpg","jpeg"]"#.into());
    conn.execute(
        "UPDATE context_links SET allowed_extensions = ?1 WHERE allowed_extensions IS NULL",
        params![default_json],
    )
    .ok();
    Ok(())
}

fn parse_allowed_extensions(raw: Option<String>) -> Vec<String> {
    match raw {
        Some(json) if !json.is_empty() => serde_json::from_str(&json)
            .ok()
            .and_then(|v: Vec<String>| normalize_allowed_extensions(&v).ok())
            .unwrap_or_else(resolved_default_allowed_extensions),
        _ => resolved_default_allowed_extensions(),
    }
}

fn row_to_context_link(row: &rusqlite::Row<'_>) -> Result<ContextLink, rusqlite::Error> {
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
        symbol_count: row.get(10)?,
        allowed_extensions: parse_allowed_extensions(row.get(11).ok()),
    })
}

fn migrate_schema_v7_audit(conn: &Connection) -> Result<(), String> {
    conn.execute_batch(
        "
        CREATE TABLE IF NOT EXISTS audit_log (
          id TEXT PRIMARY KEY,
          action TEXT NOT NULL,
          target_type TEXT,
          target_id TEXT,
          details TEXT,
          created_at TEXT NOT NULL
        );
        CREATE INDEX IF NOT EXISTS idx_audit_log_created
          ON audit_log(created_at DESC);
        ",
    )
    .map_err(|e| e.to_string())
}

fn migrate_schema_v6_content_dedup(conn: &Connection) -> Result<(), String> {
    let alters = [
        "ALTER TABLE documents ADD COLUMN content_hash TEXT",
        "ALTER TABLE documents ADD COLUMN canonical_document_id TEXT",
    ];
    for sql in alters {
        let _ = conn.execute(sql, []);
    }
    conn.execute_batch(
        "
        CREATE INDEX IF NOT EXISTS idx_documents_kb_content_hash
          ON documents(knowledge_base_id, content_hash)
          WHERE content_hash IS NOT NULL AND canonical_document_id IS NULL;
        ",
    )
    .map_err(|e| e.to_string())
}

fn migrate_schema_v5_user_memory(conn: &Connection) -> Result<(), String> {
    conn.execute_batch(
        "
        CREATE TABLE IF NOT EXISTS user_memory (
          id TEXT PRIMARY KEY,
          content TEXT NOT NULL,
          created_at TEXT NOT NULL,
          updated_at TEXT NOT NULL
        );
        ",
    )
    .map_err(|e| e.to_string())
}

fn migrate_schema_v4_codebase_index(conn: &Connection) -> Result<(), String> {
    conn.execute_batch(
        "
        CREATE TABLE IF NOT EXISTS code_symbols (
          id TEXT PRIMARY KEY,
          link_id TEXT NOT NULL,
          document_id TEXT,
          relative_path TEXT NOT NULL,
          name TEXT NOT NULL,
          kind TEXT NOT NULL,
          line_number INTEGER NOT NULL,
          signature TEXT NOT NULL DEFAULT '',
          FOREIGN KEY (link_id) REFERENCES context_links(id) ON DELETE CASCADE,
          FOREIGN KEY (document_id) REFERENCES documents(id) ON DELETE CASCADE
        );
        CREATE INDEX IF NOT EXISTS idx_code_symbols_link_name ON code_symbols(link_id, name);
        CREATE INDEX IF NOT EXISTS idx_code_symbols_name ON code_symbols(name);
        ",
    )
    .map_err(|e| e.to_string())
}

fn migrate_schema_v4_kb_system_instruction(conn: &Connection) -> Result<(), String> {
    let _ = conn.execute(
        "ALTER TABLE knowledge_bases ADD COLUMN system_instruction TEXT NOT NULL DEFAULT ''",
        [],
    );
    Ok(())
}

fn migrate_schema_v3_projects(conn: &Connection) -> Result<(), String> {
    conn.execute_batch(
        "
        CREATE TABLE IF NOT EXISTS projects (
          id TEXT PRIMARY KEY,
          name TEXT NOT NULL,
          description TEXT NOT NULL DEFAULT '',
          system_instruction TEXT NOT NULL DEFAULT '',
          created_at TEXT NOT NULL,
          updated_at TEXT NOT NULL
        );
        CREATE TABLE IF NOT EXISTS project_knowledge_bases (
          project_id TEXT NOT NULL,
          knowledge_base_id TEXT NOT NULL,
          PRIMARY KEY (project_id, knowledge_base_id),
          FOREIGN KEY (project_id) REFERENCES projects(id) ON DELETE CASCADE,
          FOREIGN KEY (knowledge_base_id) REFERENCES knowledge_bases(id) ON DELETE CASCADE
        );
        ",
    )
    .map_err(|e| e.to_string())
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

fn init_fts_schema(conn: &Connection) -> Result<(), String> {
    conn.execute_batch(
        "
        CREATE VIRTUAL TABLE IF NOT EXISTS chunks_fts USING fts5(
            content,
            filename,
            chunk_id UNINDEXED,
            document_id UNINDEXED,
            knowledge_base_id UNINDEXED,
            tokenize='unicode61'
        );
        CREATE TRIGGER IF NOT EXISTS chunks_fts_ai AFTER INSERT ON chunks BEGIN
            INSERT INTO chunks_fts(content, filename, chunk_id, document_id, knowledge_base_id)
            SELECT NEW.content, d.filename, NEW.id, NEW.document_id, d.knowledge_base_id
            FROM documents d WHERE d.id = NEW.document_id;
        END;
        CREATE TRIGGER IF NOT EXISTS chunks_fts_ad AFTER DELETE ON chunks BEGIN
            DELETE FROM chunks_fts WHERE chunk_id = OLD.id;
        END;
        CREATE TRIGGER IF NOT EXISTS chunks_fts_au AFTER UPDATE OF content ON chunks BEGIN
            DELETE FROM chunks_fts WHERE chunk_id = OLD.id;
            INSERT INTO chunks_fts(content, filename, chunk_id, document_id, knowledge_base_id)
            SELECT NEW.content, d.filename, NEW.id, NEW.document_id, d.knowledge_base_id
            FROM documents d WHERE d.id = NEW.document_id;
        END;
        ",
    )
    .map_err(|e| e.to_string())
}

fn backfill_fts_if_empty(conn: &Connection) -> Result<(), String> {
    let count: i32 = conn
        .query_row("SELECT COUNT(*) FROM chunks_fts", [], |r| r.get(0))
        .unwrap_or(0);
    if count > 0 {
        return Ok(());
    }
    conn.execute(
        "INSERT INTO chunks_fts(content, filename, chunk_id, document_id, knowledge_base_id)
         SELECT c.content, d.filename, c.id, c.document_id, d.knowledge_base_id
         FROM chunks c
         JOIN documents d ON d.id = c.document_id
         WHERE d.status = 'ready'",
        [],
    )
    .map_err(|e| e.to_string())?;
    Ok(())
}

fn build_fts_query(user_query: &str) -> Option<String> {
    let terms: Vec<String> = user_query
        .split_whitespace()
        .filter(|t| !t.is_empty())
        .map(|t| {
            let escaped = t.replace('"', "\"\"");
            format!("\"{escaped}\"")
        })
        .collect();
    if terms.is_empty() {
        None
    } else {
        Some(terms.join(" "))
    }
}

fn search_chunks_fts_conn(
    conn: &Connection,
    kb_ids: &[String],
    query: &str,
    limit: usize,
) -> Result<Vec<String>, String> {
    if kb_ids.is_empty() || query.trim().is_empty() || limit == 0 {
        return Ok(vec![]);
    }
    let fts_query = match build_fts_query(query) {
        Some(q) => q,
        None => return Ok(vec![]),
    };

    let placeholders = kb_ids
        .iter()
        .map(|_| "?")
        .collect::<Vec<_>>()
        .join(", ");
    let sql = format!(
        "SELECT content FROM chunks_fts
         WHERE knowledge_base_id IN ({placeholders})
         AND chunks_fts MATCH ?
         ORDER BY bm25(chunks_fts)
         LIMIT ?"
    );

    let mut stmt = conn.prepare(&sql).map_err(|e| e.to_string())?;
    let limit_i = limit as i64;
    let mut params: Vec<Box<dyn rusqlite::ToSql>> = kb_ids
        .iter()
        .map(|id| Box::new(id.clone()) as Box<dyn rusqlite::ToSql>)
        .collect();
    params.push(Box::new(fts_query));
    params.push(Box::new(limit_i));
    let param_refs: Vec<&dyn rusqlite::ToSql> = params.iter().map(|p| p.as_ref()).collect();

    let rows = stmt
        .query_map(param_refs.as_slice(), |row| row.get::<_, String>(0))
        .map_err(|e| e.to_string())?;
    rows.collect::<Result<Vec<_>, _>>().map_err(|e| e.to_string())
}

pub fn document_matches_mention_scope(
    filepath: &str,
    filename_or_relative: &str,
    file_hints: &[String],
    folder_hints: &[String],
) -> bool {
    if file_hints.is_empty() && folder_hints.is_empty() {
        return true;
    }

    let filepath_lc = filepath.to_lowercase();
    let display_lc = filename_or_relative.to_lowercase();

    let file_match = file_hints.iter().any(|hint| {
        let h = hint.to_lowercase();
        display_lc == h
            || display_lc.ends_with(&h)
            || filepath_lc.contains(&h)
            || filepath_lc.ends_with(&h)
    });

    let folder_match = folder_hints.iter().any(|hint| {
        let h = hint.to_lowercase().replace('/', "\\");
        filepath_lc.contains(&h) || display_lc.starts_with(&h) || display_lc.contains(&h)
    });

    match (file_hints.is_empty(), folder_hints.is_empty()) {
        (true, true) => true,
        (false, true) => file_match,
        (true, false) => folder_match,
        (false, false) => file_match && folder_match,
    }
}

pub fn search_chunks_fts_scoped(
    kb_ids: &[String],
    query: &str,
    limit: usize,
    file_hints: &[String],
    folder_hints: &[String],
) -> Result<Vec<String>, String> {
    if file_hints.is_empty() && folder_hints.is_empty() {
        return search_chunks_fts(kb_ids, query, limit);
    }

    with_db(|conn| {
        if kb_ids.is_empty() || query.trim().is_empty() || limit == 0 {
            return Ok(vec![]);
        }
        let fts_query = match build_fts_query(query) {
            Some(q) => q,
            None => return Ok(vec![]),
        };

        let placeholders = kb_ids
            .iter()
            .map(|_| "?")
            .collect::<Vec<_>>()
            .join(", ");
        let sql = format!(
            "SELECT cf.content, d.filepath, d.filename, d.relative_path
             FROM chunks_fts cf
             JOIN documents d ON d.id = cf.document_id
             WHERE cf.knowledge_base_id IN ({placeholders})
             AND cf MATCH ?
             ORDER BY bm25(cf)
             LIMIT ?"
        );

        let mut stmt = conn.prepare(&sql).map_err(|e| e.to_string())?;
        let fetch_limit = (limit * 4).max(limit) as i64;
        let mut params: Vec<Box<dyn rusqlite::ToSql>> = kb_ids
            .iter()
            .map(|id| Box::new(id.clone()) as Box<dyn rusqlite::ToSql>)
            .collect();
        params.push(Box::new(fts_query));
        params.push(Box::new(fetch_limit));
        let param_refs: Vec<&dyn rusqlite::ToSql> = params.iter().map(|p| p.as_ref()).collect();

        let rows = stmt
            .query_map(param_refs.as_slice(), |row| {
                Ok((
                    row.get::<_, String>(0)?,
                    row.get::<_, String>(1)?,
                    row.get::<_, String>(2)?,
                    row.get::<_, Option<String>>(3)?,
                ))
            })
            .map_err(|e| e.to_string())?;

        let mut out = Vec::new();
        for row in rows {
            let (content, filepath, filename, relative_path) = row.map_err(|e| e.to_string())?;
            let display = relative_path
                .filter(|p| !p.is_empty())
                .unwrap_or_else(|| filename.clone());
            if document_matches_mention_scope(&filepath, &display, file_hints, folder_hints) {
                out.push(content);
                if out.len() >= limit {
                    break;
                }
            }
        }
        Ok(out)
    })
}

#[derive(Debug, Clone)]
pub struct RagChunkHit {
    pub chunk_id: String,
    pub document_id: String,
    pub content: String,
    pub source: String,
    pub source_full: String,
    pub score: f32,
}

fn truncate_source_label(label: &str, max_chars: usize) -> String {
    let chars: Vec<char> = label.chars().collect();
    if chars.len() <= max_chars {
        return label.to_string();
    }
    let tail: String = chars[chars.len().saturating_sub(max_chars - 1)..].iter().collect();
    format!("…{tail}")
}

fn display_source(_filepath: &str, filename: &str, relative_path: &Option<String>) -> (String, String) {
    let full = relative_path
        .as_ref()
        .filter(|p| !p.is_empty())
        .cloned()
        .unwrap_or_else(|| filename.to_string());
    let short = truncate_source_label(&full, 48);
    (short, full)
}

pub fn search_rag_hits_scoped(
    kb_ids: &[String],
    query: &str,
    limit: usize,
    file_hints: &[String],
    folder_hints: &[String],
) -> Result<Vec<RagChunkHit>, String> {
    with_db(|conn| {
        if kb_ids.is_empty() || query.trim().is_empty() || limit == 0 {
            return Ok(vec![]);
        }
        let fts_query = match build_fts_query(query) {
            Some(q) => q,
            None => return Ok(vec![]),
        };

        let placeholders = kb_ids
            .iter()
            .map(|_| "?")
            .collect::<Vec<_>>()
            .join(", ");
        let sql = format!(
            "SELECT cf.content, cf.chunk_id, cf.document_id, d.filepath, d.filename, d.relative_path
             FROM chunks_fts cf
             JOIN documents d ON d.id = cf.document_id
             WHERE cf.knowledge_base_id IN ({placeholders})
             AND cf MATCH ?
             ORDER BY bm25(cf)
             LIMIT ?"
        );

        let mut stmt = conn.prepare(&sql).map_err(|e| e.to_string())?;
        let fetch_limit = (limit * 4).max(limit) as i64;
        let mut params: Vec<Box<dyn rusqlite::ToSql>> = kb_ids
            .iter()
            .map(|id| Box::new(id.clone()) as Box<dyn rusqlite::ToSql>)
            .collect();
        params.push(Box::new(fts_query));
        params.push(Box::new(fetch_limit));
        let param_refs: Vec<&dyn rusqlite::ToSql> = params.iter().map(|p| p.as_ref()).collect();

        let rows = stmt
            .query_map(param_refs.as_slice(), |row| {
                Ok((
                    row.get::<_, String>(0)?,
                    row.get::<_, String>(1)?,
                    row.get::<_, String>(2)?,
                    row.get::<_, String>(3)?,
                    row.get::<_, String>(4)?,
                    row.get::<_, Option<String>>(5)?,
                ))
            })
            .map_err(|e| e.to_string())?;

        let mut out = Vec::new();
        for (rank, row) in rows.enumerate() {
            let (content, chunk_id, document_id, filepath, filename, relative_path) =
                row.map_err(|e| e.to_string())?;
            let (source, source_full) =
                display_source(&filepath, &filename, &relative_path);
            if !document_matches_mention_scope(&filepath, &source_full, file_hints, folder_hints) {
                continue;
            }
            let score = 1.0 - (rank as f32 / fetch_limit as f32).min(0.95);
            out.push(RagChunkHit {
                chunk_id,
                document_id,
                content,
                source,
                source_full,
                score,
            });
            if out.len() >= limit {
                break;
            }
        }
        Ok(out)
    })
}

pub fn get_embedding_hits_for_scope(
    kb_ids: &[String],
    file_hints: &[String],
    folder_hints: &[String],
) -> Result<Vec<(RagChunkHit, Vec<f32>)>, String> {
    if kb_ids.is_empty() {
        return Ok(vec![]);
    }

    let mut all = Vec::new();
    for kb_id in kb_ids {
        let batch = with_db(|conn| {
            let mut stmt = conn
                .prepare(
                    "SELECT c.id, c.document_id, c.content, e.vector, d.filepath, d.filename, d.relative_path
                     FROM chunks c
                     JOIN embeddings e ON e.chunk_id = c.id
                     JOIN documents d ON d.id = c.document_id
                     WHERE d.knowledge_base_id = ?1 AND d.status = 'ready'
                       AND d.canonical_document_id IS NULL",
                )
                .map_err(|e| e.to_string())?;
            let rows = stmt
                .query_map(params![kb_id], |row| {
                    let chunk_id: String = row.get(0)?;
                    let document_id: String = row.get(1)?;
                    let content: String = row.get(2)?;
                    let blob: Vec<u8> = row.get(3)?;
                    let filepath: String = row.get(4)?;
                    let filename: String = row.get(5)?;
                    let relative_path: Option<String> = row.get(6)?;
                    let vector: Vec<f32> = blob
                        .chunks_exact(4)
                        .map(|c| f32::from_le_bytes([c[0], c[1], c[2], c[3]]))
                        .collect();
                    let (source, source_full) =
                        display_source(&filepath, &filename, &relative_path);
                    Ok((
                        RagChunkHit {
                            chunk_id,
                            document_id,
                            content,
                            source,
                            source_full,
                            score: 0.0,
                        },
                        vector,
                    ))
                })
                .map_err(|e| e.to_string())?;
            rows.collect::<Result<Vec<_>, _>>().map_err(|e| e.to_string())
        })?;

        for (hit, vector) in batch {
            let matches = if file_hints.is_empty() && folder_hints.is_empty() {
                true
            } else {
                document_matches_mention_scope(
                    &hit.source_full,
                    &hit.source,
                    file_hints,
                    folder_hints,
                )
            };
            if matches {
                all.push((hit, vector));
            }
        }
    }
    Ok(all)
}

pub fn search_chunks_fts(
    kb_ids: &[String],
    query: &str,
    limit: usize,
) -> Result<Vec<String>, String> {
    with_db(|conn| search_chunks_fts_conn(conn, kb_ids, query, limit))
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
            system_instruction: String::new(),
            doc_count: 0,
            status: "ready".into(),
            created_at: now,
        })
    })
}

pub fn set_knowledge_base_system_instruction(kb_id: &str, instruction: &str) -> Result<(), String> {
    with_db(|conn| {
        let exists: bool = conn
            .query_row(
                "SELECT 1 FROM knowledge_bases WHERE id = ?1",
                params![kb_id],
                |_| Ok(true),
            )
            .unwrap_or(false);
        if !exists {
            return Err("Base de contexte introuvable".into());
        }
        conn.execute(
            "UPDATE knowledge_bases SET system_instruction = ?1 WHERE id = ?2",
            params![instruction, kb_id],
        )
        .map_err(|e| e.to_string())?;
        Ok(())
    })
}

pub fn get_knowledge_base_system_instructions(kb_ids: &[String]) -> Result<Vec<String>, String> {
    if kb_ids.is_empty() {
        return Ok(vec![]);
    }
    with_db(|conn| {
        let mut blocks = Vec::new();
        for kb_id in kb_ids {
            let instr: String = conn
                .query_row(
                    "SELECT system_instruction FROM knowledge_bases WHERE id = ?1",
                    params![kb_id],
                    |row| row.get(0),
                )
                .unwrap_or_default();
            let trimmed = instr.trim();
            if !trimmed.is_empty() {
                blocks.push(trimmed.to_string());
            }
        }
        Ok(blocks)
    })
}

pub fn list_knowledge_bases() -> Result<Vec<KnowledgeBase>, String> {
    with_db(|conn| {
        let mut stmt = conn
            .prepare(
                "SELECT kb.id, kb.name, kb.description, kb.system_instruction, kb.status, kb.created_at,
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
                    system_instruction: row.get(3)?,
                    status: row.get(4)?,
                    created_at: row.get(5)?,
                    doc_count: row.get(6)?,
                })
            })
            .map_err(|e| e.to_string())?;
        rows.collect::<Result<Vec<_>, _>>().map_err(|e| e.to_string())
    })
}

pub fn delete_knowledge_base(id: &str) -> Result<(), String> {
    let doc_count = with_db(|conn| {
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
        Ok(docs.len())
    })?;
    log_audit(
        AuditAction::Delete,
        Some("knowledge_base"),
        Some(id),
        Some(serde_json::json!({ "documentCount": doc_count })),
    );
    Ok(())
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
                "UPDATE documents SET filepath = ?1, filename = ?2, source_mtime = ?3, source_size = ?4,
                 status = 'indexing', error_message = NULL, content_hash = NULL, canonical_document_id = NULL
                 WHERE id = ?5",
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

/// Returns the id of an indexed canonical document with the same content hash in this KB.
pub fn find_canonical_by_content_hash(
    kb_id: &str,
    content_hash: &str,
    exclude_doc_id: Option<&str>,
) -> Option<String> {
    with_db(|conn| {
        let sql = if exclude_doc_id.is_some() {
            "SELECT id FROM documents
             WHERE knowledge_base_id = ?1 AND content_hash = ?2
               AND canonical_document_id IS NULL AND status = 'ready' AND id != ?3
             LIMIT 1"
        } else {
            "SELECT id FROM documents
             WHERE knowledge_base_id = ?1 AND content_hash = ?2
               AND canonical_document_id IS NULL AND status = 'ready'
             LIMIT 1"
        };
        let id: Option<String> = if let Some(exclude) = exclude_doc_id {
            conn.query_row(sql, params![kb_id, content_hash, exclude], |r| r.get(0)).ok()
        } else {
            conn.query_row(sql, params![kb_id, content_hash], |r| r.get(0)).ok()
        };
        Ok(id)
    })
    .ok()
    .flatten()
}

pub fn set_document_content_hash(doc_id: &str, content_hash: &str) -> Result<(), String> {
    with_db(|conn| {
        conn.execute(
            "UPDATE documents SET content_hash = ?1, canonical_document_id = NULL WHERE id = ?2",
            params![content_hash, doc_id],
        )
        .map_err(|e| e.to_string())?;
        Ok(())
    })
}

/// Registers a linked path as an alias of an already-indexed document (no chunk duplication).
pub fn upsert_linked_document_alias(
    kb_id: &str,
    link_id: &str,
    filepath: &PathBuf,
    relative_path: &str,
    mtime: i64,
    size: u64,
    content_hash: &str,
    canonical_document_id: &str,
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

        let filename = filepath
            .file_name()
            .and_then(|n| n.to_str())
            .unwrap_or(relative_path);

        if let Some(id) = existing {
            conn.execute(
                "UPDATE documents SET filepath = ?1, filename = ?2, source_mtime = ?3, source_size = ?4,
                 content_hash = ?5, canonical_document_id = ?6, status = 'ready', error_message = NULL
                 WHERE id = ?7",
                params![
                    filepath.to_string_lossy().as_ref(),
                    filename,
                    mtime,
                    size,
                    content_hash,
                    canonical_document_id,
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
        conn.execute(
            "INSERT INTO documents (id, knowledge_base_id, filename, filepath, status, source_type,
             link_id, relative_path, source_mtime, source_size, content_hash, canonical_document_id)
             VALUES (?1, ?2, ?3, ?4, 'ready', 'linked', ?5, ?6, ?7, ?8, ?9, ?10)",
            params![
                id,
                kb_id,
                filename,
                filepath.to_string_lossy().as_ref(),
                link_id,
                relative_path,
                mtime,
                size,
                content_hash,
                canonical_document_id
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
    let meta = with_db(|conn| {
        let audit_meta: Option<(String, String, String)> = conn
            .query_row(
                "SELECT filename, source_type, knowledge_base_id FROM documents WHERE id = ?1",
                params![doc_id],
                |r| Ok((r.get(0)?, r.get(1)?, r.get(2)?)),
            )
            .ok();
        let row: Option<(String, String, Option<String>)> = conn
            .query_row(
                "SELECT filepath, source_type, canonical_document_id FROM documents WHERE id = ?1",
                params![doc_id],
                |r| Ok((r.get(0)?, r.get(1)?, r.get(2)?)),
            )
            .ok();

        if row.as_ref().and_then(|(_, _, c)| c.as_ref()).is_some() {
            conn.execute("DELETE FROM documents WHERE id = ?1", params![doc_id])
                .map_err(|e| e.to_string())?;
            return Ok(audit_meta);
        }

        conn.execute(
            "DELETE FROM documents WHERE canonical_document_id = ?1",
            params![doc_id],
        )
        .map_err(|e| e.to_string())?;
        delete_document_chunks(conn, doc_id)?;
        conn.execute("DELETE FROM documents WHERE id = ?1", params![doc_id])
            .map_err(|e| e.to_string())?;
        if let Some((path, source_type, _)) = row {
            if source_type == "upload" {
                let _ = fs::remove_file(path);
            }
        }
        Ok(audit_meta)
    })?;
    if let Some((filename, source_type, kb_id)) = meta {
        log_audit(
            AuditAction::Delete,
            Some("document"),
            Some(doc_id),
            Some(serde_json::json!({
                "filename": filename,
                "sourceType": source_type,
                "knowledgeBaseId": kb_id,
            })),
        );
    }
    Ok(())
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
    let is_alias: bool = conn
        .query_row(
            "SELECT canonical_document_id IS NOT NULL FROM documents WHERE id = ?1",
            params![doc_id],
            |r| r.get(0),
        )
        .unwrap_or(false);
    if is_alias {
        return Ok(());
    }
    conn.execute(
        "DELETE FROM embeddings WHERE chunk_id IN (SELECT id FROM chunks WHERE document_id = ?1)",
        params![doc_id],
    )
    .map_err(|e| e.to_string())?;
    conn.execute("DELETE FROM code_symbols WHERE document_id = ?1", params![doc_id])
        .map_err(|e| e.to_string())?;
    conn.execute("DELETE FROM chunks WHERE document_id = ?1", params![doc_id])
        .map_err(|e| e.to_string())?;
    Ok(())
}

pub fn clear_symbols_for_document(doc_id: &str) -> Result<(), String> {
    with_db(|conn| {
        conn.execute("DELETE FROM code_symbols WHERE document_id = ?1", params![doc_id])
            .map_err(|e| e.to_string())?;
        Ok(())
    })
}

pub fn insert_symbol(
    link_id: &str,
    document_id: Option<&str>,
    relative_path: &str,
    name: &str,
    kind: &str,
    line_number: u32,
    signature: &str,
) -> Result<(), String> {
    with_db(|conn| {
        let id = Uuid::new_v4().to_string();
        conn.execute(
            "INSERT INTO code_symbols (id, link_id, document_id, relative_path, name, kind, line_number, signature)
             VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8)",
            params![
                id,
                link_id,
                document_id,
                relative_path,
                name,
                kind,
                line_number,
                signature
            ],
        )
        .map_err(|e| e.to_string())?;
        Ok(())
    })
}

pub fn get_repo_link_ids_for_bases(kb_ids: &[String]) -> Result<Vec<String>, String> {
    if kb_ids.is_empty() {
        return Ok(vec![]);
    }
    with_db(|conn| {
        let mut ids = Vec::new();
        for kb_id in kb_ids {
            let mut stmt = conn
                .prepare(
                    "SELECT id FROM context_links WHERE knowledge_base_id = ?1 AND link_type = 'repo' AND enabled = 1",
                )
                .map_err(|e| e.to_string())?;
            let rows = stmt
                .query_map(params![kb_id], |r| r.get::<_, String>(0))
                .map_err(|e| e.to_string())?;
            for row in rows.flatten() {
                ids.push(row);
            }
        }
        Ok(ids)
    })
}

pub fn search_code_symbols(
    link_ids: &[String],
    query: &str,
    limit: u32,
) -> Result<Vec<CodeSymbolHit>, String> {
    if link_ids.is_empty() || query.trim().is_empty() {
        return Ok(vec![]);
    }
    let pattern = format!("%{}%", query.trim().to_lowercase());
    with_db(|conn| {
        let mut hits = Vec::new();
        for link_id in link_ids {
            let mut stmt = conn
                .prepare(
                    "SELECT name, kind, relative_path, line_number, signature
                     FROM code_symbols
                     WHERE link_id = ?1 AND (LOWER(name) LIKE ?2 OR LOWER(relative_path) LIKE ?2)
                     ORDER BY line_number
                     LIMIT ?3",
                )
                .map_err(|e| e.to_string())?;
            let rows = stmt
                .query_map(params![link_id, pattern, limit], |row| {
                    Ok(CodeSymbolHit {
                        name: row.get(0)?,
                        kind: row.get(1)?,
                        relative_path: row.get(2)?,
                        line_number: row.get(3)?,
                        signature: row.get(4)?,
                    })
                })
                .map_err(|e| e.to_string())?;
            for row in rows.flatten() {
                hits.push(row);
            }
        }
        hits.truncate(limit as usize);
        Ok(hits)
    })
}

pub fn search_code_files(link_ids: &[String], query: &str, limit: u32) -> Result<Vec<String>, String> {
    if link_ids.is_empty() || query.trim().is_empty() {
        return Ok(vec![]);
    }
    let pattern = format!("%{}%", query.trim().to_lowercase());
    with_db(|conn| {
        let mut paths = Vec::new();
        for link_id in link_ids {
            let mut stmt = conn
                .prepare(
                    "SELECT DISTINCT relative_path FROM documents
                     WHERE link_id = ?1 AND status = 'ready' AND LOWER(relative_path) LIKE ?2
                     ORDER BY relative_path
                     LIMIT ?3",
                )
                .map_err(|e| e.to_string())?;
            let rows = stmt
                .query_map(params![link_id, pattern, limit], |row| row.get::<_, String>(0))
                .map_err(|e| e.to_string())?;
            for row in rows.flatten() {
                if !paths.contains(&row) {
                    paths.push(row);
                }
            }
        }
        paths.truncate(limit as usize);
        Ok(paths)
    })
}

const DOCUMENT_RECORD_COLUMNS: &str =
    "id, knowledge_base_id, filename, filepath, source_type, link_id, relative_path, source_mtime, source_size, content_hash, canonical_document_id";

fn map_document_record(row: &rusqlite::Row<'_>) -> rusqlite::Result<DocumentRecord> {
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
        content_hash: row.get(9)?,
        canonical_document_id: row.get(10)?,
    })
}

pub fn get_document_record(doc_id: &str) -> Result<DocumentRecord, String> {
    with_db(|conn| {
        let sql = format!("SELECT {DOCUMENT_RECORD_COLUMNS} FROM documents WHERE id = ?1");
        conn.query_row(&sql, params![doc_id], map_document_record)
            .map_err(|e| e.to_string())
    })
}

pub fn list_documents_for_link(link_id: &str) -> Result<Vec<DocumentRecord>, String> {
    with_db(|conn| {
        let sql = format!(
            "SELECT {DOCUMENT_RECORD_COLUMNS} FROM documents WHERE link_id = ?1"
        );
        let mut stmt = conn.prepare(&sql).map_err(|e| e.to_string())?;
        let rows = stmt
            .query_map(params![link_id], map_document_record)
            .map_err(|e| e.to_string())?;
        rows.collect::<Result<Vec<_>, _>>().map_err(|e| e.to_string())
    })
}

pub fn remove_stale_linked_documents(link_id: &str, keep_paths: &[String]) -> Result<Vec<String>, String> {
    let removed = with_db(|conn| {
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
                removed.push((id, rel));
            }
        }
        Ok(removed)
    })?;
    for (id, rel) in &removed {
        log_audit(
            AuditAction::Delete,
            Some("document"),
            Some(id),
            Some(serde_json::json!({
                "reason": "stale_link_sync",
                "relativePath": rel,
                "linkId": link_id,
            })),
        );
    }
    Ok(removed.into_iter().map(|(id, _)| id).collect())
}

pub fn list_documents(kb_id: &str) -> Result<Vec<DocumentInfo>, String> {
    with_db(|conn| {
        let mut stmt = conn
            .prepare(
                "SELECT d.id, d.knowledge_base_id, d.filename, d.status, d.error_message,
                        (SELECT COUNT(*) FROM chunks c
                         WHERE c.document_id = COALESCE(d.canonical_document_id, d.id)) as chunk_count,
                        d.source_type, d.link_id, d.relative_path, d.filepath, d.source_mtime, d.source_size
                 FROM documents d WHERE d.knowledge_base_id = ?1 ORDER BY d.filename",
            )
            .map_err(|e| e.to_string())?;
        let rows = stmt
            .query_map(params![kb_id], |row| {
                let filename: String = row.get(2)?;
                Ok(DocumentInfo {
                    id: row.get(0)?,
                    knowledge_base_id: row.get(1)?,
                    filename: filename.clone(),
                    status: row.get(3)?,
                    error_message: row.get(4)?,
                    chunk_count: row.get(5)?,
                    source_type: row.get(6)?,
                    link_id: row.get(7)?,
                    relative_path: row.get(8)?,
                    external_path: row.get(9)?,
                    source_mtime: row.get(10)?,
                    source_size: row.get(11)?,
                    media_type: document_media_type(&filename).to_string(),
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

pub fn get_embeddings_for_scope(
    kb_ids: &[String],
    file_hints: &[String],
    folder_hints: &[String],
) -> Result<Vec<(String, Vec<f32>)>, String> {
    if file_hints.is_empty() && folder_hints.is_empty() {
        return get_embeddings_for_bases(kb_ids);
    }

    if kb_ids.is_empty() {
        return Ok(vec![]);
    }

    let mut all = Vec::new();
    for kb_id in kb_ids {
        let mut batch = with_db(|conn| {
            let mut stmt = conn
                .prepare(
                    "SELECT c.content, e.vector, d.filepath, d.filename, d.relative_path
                     FROM chunks c
                     JOIN embeddings e ON e.chunk_id = c.id
                     JOIN documents d ON d.id = c.document_id
                     WHERE d.knowledge_base_id = ?1 AND d.status = 'ready'
                       AND d.canonical_document_id IS NULL",
                )
                .map_err(|e| e.to_string())?;
            let rows = stmt
                .query_map(params![kb_id], |row| {
                    let content: String = row.get(0)?;
                    let blob: Vec<u8> = row.get(1)?;
                    let filepath: String = row.get(2)?;
                    let filename: String = row.get(3)?;
                    let relative_path: Option<String> = row.get(4)?;
                    let vector: Vec<f32> = blob
                        .chunks_exact(4)
                        .map(|c| f32::from_le_bytes([c[0], c[1], c[2], c[3]]))
                        .collect();
                    let display = relative_path
                        .filter(|p| !p.is_empty())
                        .unwrap_or(filename);
                    Ok((content, vector, filepath, display))
                })
                .map_err(|e| e.to_string())?;
            rows.collect::<Result<Vec<_>, _>>().map_err(|e| e.to_string())
        })?;

        for (content, vector, filepath, display) in batch {
            if document_matches_mention_scope(&filepath, &display, file_hints, folder_hints) {
                all.push((content, vector));
            }
        }
    }
    Ok(all)
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
                     WHERE d.knowledge_base_id = ?1 AND d.status = 'ready'
                       AND d.canonical_document_id IS NULL",
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

/// Embeddings des documents image (`.png`/`.jpg`) avec chemin fichier pour le chat vision.
pub fn get_image_embeddings_for_bases(
    kb_ids: &[String],
) -> Result<Vec<(Vec<f32>, String)>, String> {
    if kb_ids.is_empty() {
        return Ok(vec![]);
    }
    let mut all = Vec::new();
    for kb_id in kb_ids {
        let mut batch = with_db(|conn| {
            let mut stmt = conn
                .prepare(
                    "SELECT e.vector, d.filepath, d.filename FROM chunks c
                     JOIN embeddings e ON e.chunk_id = c.id
                     JOIN documents d ON d.id = c.document_id
                     WHERE d.knowledge_base_id = ?1 AND d.status = 'ready'
                       AND d.canonical_document_id IS NULL",
                )
                .map_err(|e| e.to_string())?;
            let rows = stmt
                .query_map(params![kb_id], |row| {
                    let blob: Vec<u8> = row.get(0)?;
                    let filepath: String = row.get(1)?;
                    let filename: String = row.get(2)?;
                    let vector: Vec<f32> = blob
                        .chunks_exact(4)
                        .map(|c| f32::from_le_bytes([c[0], c[1], c[2], c[3]]))
                        .collect();
                    Ok((vector, filepath, filename))
                })
                .map_err(|e| e.to_string())?;
            rows.collect::<Result<Vec<_>, _>>().map_err(|e| e.to_string())
        })?;
        for (vector, filepath, filename) in batch {
            if is_image_filename(&filename) {
                all.push((vector, filepath));
            }
        }
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
    allowed_extensions: Option<Vec<String>>,
) -> Result<ContextLink, String> {
    let extensions = match allowed_extensions {
        Some(exts) => normalize_allowed_extensions(&exts)?,
        None => resolved_default_allowed_extensions(),
    };
    let extensions_json = serde_json::to_string(&extensions).map_err(|e| e.to_string())?;

    with_db(|conn| {
        let id = Uuid::new_v4().to_string();
        conn.execute(
            "INSERT INTO context_links (id, knowledge_base_id, link_type, path, recursive, enabled, last_sync_status, allowed_extensions)
             VALUES (?1, ?2, ?3, ?4, ?5, 1, 'pending', ?6)",
            params![id, kb_id, link_type, path, recursive as i32, extensions_json],
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
            symbol_count: 0,
            allowed_extensions: extensions,
        })
    })
}

pub fn list_context_links(kb_id: &str) -> Result<Vec<ContextLink>, String> {
    with_db(|conn| {
        let mut stmt = conn
            .prepare(
                "SELECT cl.id, cl.knowledge_base_id, cl.link_type, cl.path, cl.recursive, cl.enabled,
                        cl.last_sync_at, cl.last_sync_status, cl.last_sync_error,
                        (SELECT COUNT(*) FROM documents d WHERE d.link_id = cl.id) as doc_count,
                        (SELECT COUNT(*) FROM code_symbols cs WHERE cs.link_id = cl.id) as symbol_count,
                        cl.allowed_extensions
                 FROM context_links cl WHERE cl.knowledge_base_id = ?1 ORDER BY cl.path",
            )
            .map_err(|e| e.to_string())?;
        let rows = stmt
            .query_map(params![kb_id], row_to_context_link)
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
                        (SELECT COUNT(*) FROM documents d WHERE d.link_id = cl.id) as doc_count,
                        (SELECT COUNT(*) FROM code_symbols cs WHERE cs.link_id = cl.id) as symbol_count,
                        cl.allowed_extensions
                 FROM context_links cl ORDER BY cl.path",
            )
            .map_err(|e| e.to_string())?;
        let rows = stmt
            .query_map([], row_to_context_link)
            .map_err(|e| e.to_string())?;
        rows.collect::<Result<Vec<_>, _>>().map_err(|e| e.to_string())
    })
}

pub fn get_context_link(link_id: &str) -> Result<ContextLink, String> {
    with_db(|conn| {
        conn.query_row(
            "SELECT cl.id, cl.knowledge_base_id, cl.link_type, cl.path, cl.recursive, cl.enabled,
                    cl.last_sync_at, cl.last_sync_status, cl.last_sync_error,
                    (SELECT COUNT(*) FROM documents d WHERE d.link_id = cl.id) as doc_count,
                    (SELECT COUNT(*) FROM code_symbols cs WHERE cs.link_id = cl.id) as symbol_count,
                    cl.allowed_extensions
             FROM context_links cl WHERE cl.id = ?1",
            params![link_id],
            row_to_context_link,
        )
        .map_err(|e| e.to_string())
    })
}

pub fn update_context_link_extensions(
    link_id: &str,
    extensions: &[String],
) -> Result<ContextLink, String> {
    let normalized = normalize_allowed_extensions(extensions)?;
    let json = serde_json::to_string(&normalized).map_err(|e| e.to_string())?;
    with_db(|conn| {
        let updated = conn.execute(
            "UPDATE context_links SET allowed_extensions = ?1 WHERE id = ?2",
            params![json, link_id],
        )
        .map_err(|e| e.to_string())?;
        if updated == 0 {
            return Err("Lien introuvable".into());
        }
        Ok(())
    })?;
    get_context_link(link_id)
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
    let link = get_context_link(link_id).ok();
    delete_documents_for_link(link_id)?;
    with_db(|conn| {
        conn.execute("DELETE FROM context_links WHERE id = ?1", params![link_id])
            .map_err(|e| e.to_string())?;
        Ok(())
    })?;
    log_audit(
        AuditAction::Delete,
        Some("context_link"),
        Some(link_id),
        Some(serde_json::json!({
            "path": link.as_ref().map(|l| &l.path),
            "linkType": link.as_ref().map(|l| &l.link_type),
            "knowledgeBaseId": link.as_ref().map(|l| &l.knowledge_base_id),
        })),
    );
    Ok(())
}

#[cfg(test)]
mod tests {
    use super::*;

    fn setup_test_db() -> Connection {
        let conn = Connection::open_in_memory().unwrap();
        init_db_schema(&conn).unwrap();
        let now = chrono::Utc::now().to_rfc3339();
        conn.execute(
            "INSERT INTO knowledge_bases (id, name, description, status, created_at) VALUES ('kb1', 'Test', '', 'ready', ?1)",
            params![now],
        )
        .unwrap();
        conn.execute(
            "INSERT INTO documents (id, knowledge_base_id, filename, filepath, status, source_type)
             VALUES ('doc1', 'kb1', 'contrat-2024.pdf', '/tmp/contrat-2024.pdf', 'ready', 'upload')",
            [],
        )
        .unwrap();
        conn.execute(
            "INSERT INTO chunks (id, document_id, chunk_index, content)
             VALUES ('chunk1', 'doc1', 0, 'Le contrat signé en 2024 prévoit une clause de résiliation.')",
            [],
        )
        .unwrap();
        conn
    }

    #[test]
    fn fts_finds_keyword_match_without_semantic_similarity() {
        let conn = setup_test_db();
        let results =
            search_chunks_fts_conn(&conn, &["kb1".to_string()], "contrat 2024", 5).unwrap();
        assert_eq!(results.len(), 1);
        assert!(results[0].contains("contrat"));
        assert!(results[0].contains("2024"));
    }

    #[test]
    fn fts_matches_filename() {
        let conn = setup_test_db();
        let results =
            search_chunks_fts_conn(&conn, &["kb1".to_string()], "contrat-2024", 5).unwrap();
        assert_eq!(results.len(), 1);
    }

    #[test]
    fn fts_returns_empty_for_unrelated_query() {
        let conn = setup_test_db();
        let results =
            search_chunks_fts_conn(&conn, &["kb1".to_string()], "facture mars", 5).unwrap();
        assert!(results.is_empty());
    }

    #[test]
    fn content_hash_is_deterministic() {
        let h1 = compute_content_hash(b"same content");
        let h2 = compute_content_hash(b"same content");
        let h3 = compute_content_hash(b"different");
        assert_eq!(h1, h2);
        assert_ne!(h1, h3);
        assert_eq!(h1.len(), 64);
    }

    #[test]
    fn find_canonical_by_content_hash_skips_aliases() {
        let conn = Connection::open_in_memory().unwrap();
        init_db_schema(&conn).unwrap();
        let now = chrono::Utc::now().to_rfc3339();
        conn.execute(
            "INSERT INTO knowledge_bases (id, name, description, status, created_at) VALUES ('kb1', 'Test', '', 'ready', ?1)",
            params![now],
        )
        .unwrap();
        conn.execute(
            "INSERT INTO context_links (id, knowledge_base_id, link_type, path, recursive, enabled, last_sync_status)
             VALUES ('link1', 'kb1', 'folder', '/tmp', 1, 1, 'ready')",
            [],
        )
        .unwrap();
        let hash = compute_content_hash(b"shared file");
        conn.execute(
            "INSERT INTO documents (id, knowledge_base_id, filename, filepath, status, source_type, link_id, relative_path, content_hash)
             VALUES ('canon', 'kb1', 'a.md', '/tmp/a.md', 'ready', 'linked', 'link1', 'a.md', ?1)",
            params![hash],
        )
        .unwrap();
        conn.execute(
            "INSERT INTO chunks (id, document_id, chunk_index, content) VALUES ('c1', 'canon', 0, 'hello')",
            [],
        )
        .unwrap();
        conn.execute(
            "INSERT INTO documents (id, knowledge_base_id, filename, filepath, status, source_type, link_id, relative_path, content_hash, canonical_document_id)
             VALUES ('alias', 'kb1', 'b.md', '/other/b.md', 'ready', 'linked', 'link1', 'b.md', ?1, 'canon')",
            params![hash],
        )
        .unwrap();

        let found: Option<String> = conn
            .query_row(
                "SELECT id FROM documents WHERE knowledge_base_id = 'kb1' AND content_hash = ?1
                 AND canonical_document_id IS NULL AND status = 'ready' LIMIT 1",
                params![hash],
                |r| r.get(0),
            )
            .ok();
        assert_eq!(found.as_deref(), Some("canon"));

        let alias_chunks: i32 = conn
            .query_row(
                "SELECT COUNT(*) FROM chunks WHERE document_id = 'alias'",
                [],
                |r| r.get(0),
            )
            .unwrap();
        assert_eq!(alias_chunks, 0);
    }
}
