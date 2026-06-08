use super::store::with_context_db;
use rusqlite::{params, Connection};
use serde::Serialize;
use uuid::Uuid;

const MAX_AUDIT_ENTRIES: u32 = 2000;

#[derive(Debug, Clone, Copy)]
pub enum AuditAction {
    Index,
    IndexError,
    Delete,
    AgentAccess,
}

impl AuditAction {
    fn as_str(self) -> &'static str {
        match self {
            Self::Index => "index",
            Self::IndexError => "index_error",
            Self::Delete => "delete",
            Self::AgentAccess => "agent_access",
        }
    }
}

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct AuditEntry {
    pub id: String,
    pub action: String,
    pub target_type: Option<String>,
    pub target_id: Option<String>,
    pub details: Option<String>,
    pub created_at: String,
}

/// Fire-and-forget audit logging — never fails the caller.
pub fn log_audit(
    action: AuditAction,
    target_type: Option<&str>,
    target_id: Option<&str>,
    details: Option<serde_json::Value>,
) {
    let _ = try_log_audit(action, target_type, target_id, details);
}

fn try_log_audit(
    action: AuditAction,
    target_type: Option<&str>,
    target_id: Option<&str>,
    details: Option<serde_json::Value>,
) -> Result<(), String> {
    with_context_db(|conn| {
        let id = Uuid::new_v4().to_string();
        let now = chrono::Utc::now().to_rfc3339();
        let details_str = details.map(|d| d.to_string());
        conn.execute(
            "INSERT INTO audit_log (id, action, target_type, target_id, details, created_at)
             VALUES (?1, ?2, ?3, ?4, ?5, ?6)",
            params![
                id,
                action.as_str(),
                target_type,
                target_id,
                details_str,
                now
            ],
        )
        .map_err(|e| e.to_string())?;
        prune_old_entries(conn)?;
        Ok(())
    })
}

fn prune_old_entries(conn: &Connection) -> Result<(), String> {
    conn.execute(
        "DELETE FROM audit_log WHERE id NOT IN (
            SELECT id FROM audit_log ORDER BY created_at DESC LIMIT ?1
         )",
        [MAX_AUDIT_ENTRIES],
    )
    .map_err(|e| e.to_string())?;
    Ok(())
}

pub fn list_audit_log(limit: u32, action_filter: Option<&str>) -> Result<Vec<AuditEntry>, String> {
    let cap = limit.min(500);
    with_context_db(|conn| {
        if let Some(action) = action_filter {
            let action = action.to_string();
            list_audit_log_filtered(conn, &action, cap)
        } else {
            list_audit_log_all(conn, cap)
        }
    })
}

fn list_audit_log_filtered(
    conn: &Connection,
    action: &str,
    cap: u32,
) -> Result<Vec<AuditEntry>, String> {
    let mut stmt = conn
        .prepare(
            "SELECT id, action, target_type, target_id, details, created_at
             FROM audit_log WHERE action = ?1
             ORDER BY created_at DESC LIMIT ?2",
        )
        .map_err(|e| e.to_string())?;
    let rows = stmt
        .query_map(params![action, cap], map_audit_row)
        .map_err(|e| e.to_string())?
        .collect::<Result<Vec<_>, _>>()
        .map_err(|e| e.to_string())?;
    Ok(rows)
}

fn list_audit_log_all(conn: &Connection, cap: u32) -> Result<Vec<AuditEntry>, String> {
    let mut stmt = conn
        .prepare(
            "SELECT id, action, target_type, target_id, details, created_at
             FROM audit_log ORDER BY created_at DESC LIMIT ?1",
        )
        .map_err(|e| e.to_string())?;
    let rows = stmt
        .query_map([cap], map_audit_row)
        .map_err(|e| e.to_string())?
        .collect::<Result<Vec<_>, _>>()
        .map_err(|e| e.to_string())?;
    Ok(rows)
}

fn map_audit_row(row: &rusqlite::Row<'_>) -> rusqlite::Result<AuditEntry> {
    Ok(AuditEntry {
        id: row.get(0)?,
        action: row.get(1)?,
        target_type: row.get(2)?,
        target_id: row.get(3)?,
        details: row.get(4)?,
        created_at: row.get(5)?,
    })
}
