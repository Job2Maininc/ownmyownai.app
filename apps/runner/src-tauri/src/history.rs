use rusqlite::{params, Connection};
use serde::Serialize;
use std::fs;
use std::path::PathBuf;
use uuid::Uuid;

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct ChatMessageRecord {
    pub role: String,
    pub content: String,
}

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct ChatThreadDetail {
    pub id: String,
    pub title: String,
    pub model: Option<String>,
    pub context_ids: Vec<String>,
    pub created_at: String,
    pub message_count: u32,
    pub updated_at: String,
    pub parent_thread_id: Option<String>,
    pub fork_at_index: Option<u32>,
    pub root_thread_id: Option<String>,
}

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct ChatThreadSummary {
    pub id: String,
    pub title: String,
    pub model: Option<String>,
    pub message_count: u32,
    pub updated_at: String,
    pub parent_thread_id: Option<String>,
    pub fork_at_index: Option<u32>,
    pub root_thread_id: Option<String>,
}

fn history_db_path() -> PathBuf {
    crate::settings::resolved_history_db_path()
}

fn with_db<F, T>(f: F) -> Result<T, String>
where
    F: FnOnce(&Connection) -> Result<T, String>,
{
    let path = history_db_path();
    if let Some(parent) = path.parent() {
        fs::create_dir_all(parent).map_err(|e| e.to_string())?;
    }
    let conn = Connection::open(&path).map_err(|e| e.to_string())?;
    init_schema(&conn)?;
    f(&conn)
}

fn init_schema(conn: &Connection) -> Result<(), String> {
    conn.execute_batch(
        "
        CREATE TABLE IF NOT EXISTS threads (
          id TEXT PRIMARY KEY,
          title TEXT NOT NULL,
          model TEXT,
          context_ids TEXT NOT NULL DEFAULT '[]',
          parent_thread_id TEXT,
          fork_at_index INTEGER,
          root_thread_id TEXT,
          created_at TEXT NOT NULL,
          updated_at TEXT NOT NULL
        );
        CREATE TABLE IF NOT EXISTS messages (
          id TEXT PRIMARY KEY,
          thread_id TEXT NOT NULL,
          role TEXT NOT NULL,
          content TEXT NOT NULL,
          sort_index INTEGER NOT NULL,
          FOREIGN KEY (thread_id) REFERENCES threads(id) ON DELETE CASCADE
        );
        CREATE INDEX IF NOT EXISTS idx_messages_thread ON messages(thread_id, sort_index);
        ",
    )
    .map_err(|e| e.to_string())
}

pub fn init_history_db() -> Result<(), String> {
    with_db(|_| Ok(()))
}

pub fn list_threads(limit: u32) -> Result<Vec<ChatThreadSummary>, String> {
    with_db(|conn| {
        let mut stmt = conn
            .prepare(
                "SELECT t.id, t.title, t.model, t.parent_thread_id, t.fork_at_index, t.root_thread_id, t.updated_at,
                        (SELECT COUNT(*) FROM messages m WHERE m.thread_id = t.id) AS message_count
                 FROM threads t
                 ORDER BY t.updated_at DESC
                 LIMIT ?1",
            )
            .map_err(|e| e.to_string())?;
        let rows = stmt
            .query_map(params![limit], |row| {
                Ok(ChatThreadSummary {
                    id: row.get(0)?,
                    title: row.get(1)?,
                    model: row.get(2)?,
                    parent_thread_id: row.get(3)?,
                    fork_at_index: row.get(4)?,
                    root_thread_id: row.get(5)?,
                    updated_at: row.get(6)?,
                    message_count: row.get(7)?,
                })
            })
            .map_err(|e| e.to_string())?;
        rows.collect::<Result<Vec<_>, _>>().map_err(|e| e.to_string())
    })
}

pub fn get_thread(thread_id: &str) -> Result<(ChatThreadDetail, Vec<ChatMessageRecord>), String> {
    with_db(|conn| {
        let detail: ChatThreadDetail = conn
            .query_row(
                "SELECT id, title, model, context_ids, created_at, parent_thread_id, fork_at_index, root_thread_id, updated_at,
                        (SELECT COUNT(*) FROM messages m WHERE m.thread_id = threads.id) AS message_count
                 FROM threads WHERE id = ?1",
                params![thread_id],
                |row| {
                    let context_raw: String = row.get(3)?;
                    let context_ids: Vec<String> =
                        serde_json::from_str(&context_raw).unwrap_or_default();
                    Ok(ChatThreadDetail {
                        id: row.get(0)?,
                        title: row.get(1)?,
                        model: row.get(2)?,
                        context_ids,
                        created_at: row.get(4)?,
                        parent_thread_id: row.get(5)?,
                        fork_at_index: row.get(6)?,
                        root_thread_id: row.get(7)?,
                        updated_at: row.get(8)?,
                        message_count: row.get(9)?,
                    })
                },
            )
            .map_err(|_| "Conversation introuvable".to_string())?;

        let mut stmt = conn
            .prepare(
                "SELECT role, content FROM messages WHERE thread_id = ?1 ORDER BY sort_index ASC",
            )
            .map_err(|e| e.to_string())?;
        let messages = stmt
            .query_map(params![thread_id], |row| {
                Ok(ChatMessageRecord {
                    role: row.get(0)?,
                    content: row.get(1)?,
                })
            })
            .map_err(|e| e.to_string())?
            .collect::<Result<Vec<_>, _>>()
            .map_err(|e| e.to_string())?;

        Ok((detail, messages))
    })
}

pub fn save_thread(
    thread_id: Option<&str>,
    title: Option<&str>,
    model: Option<&str>,
    context_ids: &[String],
    pairs: &[(String, String)],
) -> Result<String, String> {
    if pairs.is_empty() {
        return Err("Aucun message à enregistrer".into());
    }

    with_db(|conn| {
        let id = thread_id
            .filter(|s| !s.is_empty())
            .map(String::from)
            .unwrap_or_else(|| Uuid::new_v4().to_string());
        let now = chrono::Utc::now().to_rfc3339();
        let resolved_title = title
            .filter(|t| !t.trim().is_empty())
            .map(str::trim)
            .map(str::to_string)
            .unwrap_or_else(|| {
                pairs
                    .iter()
                    .find(|(role, _)| role == "user")
                    .map(|(_, content)| content.chars().take(60).collect())
                    .unwrap_or_else(|| "Conversation".into())
            });
        let context_json =
            serde_json::to_string(context_ids).unwrap_or_else(|_| "[]".to_string());

        let exists: bool = conn
            .query_row(
                "SELECT 1 FROM threads WHERE id = ?1",
                params![id],
                |_| Ok(()),
            )
            .is_ok();

        if exists {
            conn.execute(
                "UPDATE threads SET title = ?1, model = ?2, context_ids = ?3, updated_at = ?4 WHERE id = ?5",
                params![resolved_title, model, context_json, now, id],
            )
            .map_err(|e| e.to_string())?;
            conn.execute("DELETE FROM messages WHERE thread_id = ?1", params![id])
                .map_err(|e| e.to_string())?;
        } else {
            conn.execute(
                "INSERT INTO threads (id, title, model, context_ids, root_thread_id, created_at, updated_at)
                 VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7)",
                params![id, resolved_title, model, context_json, id, now, now],
            )
            .map_err(|e| e.to_string())?;
        }

        for (index, (role, content)) in pairs.iter().enumerate() {
            conn.execute(
                "INSERT INTO messages (id, thread_id, role, content, sort_index) VALUES (?1, ?2, ?3, ?4, ?5)",
                params![
                    Uuid::new_v4().to_string(),
                    id,
                    role,
                    content,
                    index as i64
                ],
            )
            .map_err(|e| e.to_string())?;
        }

        Ok(id)
    })
}

pub fn delete_thread(thread_id: &str) -> Result<(), String> {
    with_db(|conn| {
        conn.execute("DELETE FROM messages WHERE thread_id = ?1", params![thread_id])
            .map_err(|e| e.to_string())?;
        conn.execute("DELETE FROM threads WHERE id = ?1", params![thread_id])
            .map_err(|e| e.to_string())?;
        Ok(())
    })
}

pub fn fork_thread(
    parent_thread_id: &str,
    fork_at_index: u32,
    model: Option<&str>,
    context_ids: &[String],
) -> Result<String, String> {
    let (parent, messages) = get_thread(parent_thread_id)?;
    let pairs: Vec<(String, String)> = messages
        .into_iter()
        .take(fork_at_index as usize + 1)
        .map(|m| (m.role, m.content))
        .collect();

    let child_id = with_db(|conn| {
        let id = Uuid::new_v4().to_string();
        let now = chrono::Utc::now().to_rfc3339();
        let root = parent
            .root_thread_id
            .clone()
            .unwrap_or_else(|| parent.id.clone());
        let context_json = if context_ids.is_empty() {
            serde_json::to_string(&parent.context_ids).unwrap_or_else(|_| "[]".to_string())
        } else {
            serde_json::to_string(context_ids).unwrap_or_else(|_| "[]".to_string())
        };
        let resolved_model = model.or(parent.model.as_deref());

        conn.execute(
            "INSERT INTO threads (id, title, model, context_ids, parent_thread_id, fork_at_index, root_thread_id, created_at, updated_at)
             VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8, ?9)",
            params![
                id,
                format!("{} (branche)", parent.title),
                resolved_model,
                context_json,
                parent_thread_id,
                fork_at_index,
                root,
                now,
                now
            ],
        )
        .map_err(|e| e.to_string())?;

        for (index, (role, content)) in pairs.iter().enumerate() {
            conn.execute(
                "INSERT INTO messages (id, thread_id, role, content, sort_index) VALUES (?1, ?2, ?3, ?4, ?5)",
                params![
                    Uuid::new_v4().to_string(),
                    id,
                    role,
                    content,
                    index as i64
                ],
            )
            .map_err(|e| e.to_string())?;
        }

        Ok(id)
    })?;

    Ok(child_id)
}

pub fn list_thread_branches(root_thread_id: &str) -> Result<Vec<ChatThreadSummary>, String> {
    with_db(|conn| {
        let mut stmt = conn
            .prepare(
                "SELECT t.id, t.title, t.model, t.parent_thread_id, t.fork_at_index, t.root_thread_id, t.updated_at,
                        (SELECT COUNT(*) FROM messages m WHERE m.thread_id = t.id) AS message_count
                 FROM threads t
                 WHERE t.id = ?1 OR t.root_thread_id = ?1
                 ORDER BY t.updated_at ASC",
            )
            .map_err(|e| e.to_string())?;
        let rows = stmt
            .query_map(params![root_thread_id], |row| {
                Ok(ChatThreadSummary {
                    id: row.get(0)?,
                    title: row.get(1)?,
                    model: row.get(2)?,
                    parent_thread_id: row.get(3)?,
                    fork_at_index: row.get(4)?,
                    root_thread_id: row.get(5)?,
                    updated_at: row.get(6)?,
                    message_count: row.get(7)?,
                })
            })
            .map_err(|e| e.to_string())?;
        rows.collect::<Result<Vec<_>, _>>().map_err(|e| e.to_string())
    })
}
