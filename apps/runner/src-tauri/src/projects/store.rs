use crate::context::store::with_context_db;
use rusqlite::{params, Connection};
use serde::Serialize;
use uuid::Uuid;

const MAX_PROJECTS: u32 = 50;

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct ProjectSummary {
    pub id: String,
    pub name: String,
    pub description: String,
    pub system_instruction: String,
    pub knowledge_base_ids: Vec<String>,
    pub created_at: String,
    pub updated_at: String,
    pub is_active: bool,
}

fn row_to_project(
    row: &rusqlite::Row<'_>,
    kbase_ids: Vec<String>,
    active_id: Option<&str>,
) -> Result<ProjectSummary, rusqlite::Error> {
    let id: String = row.get(0)?;
    Ok(ProjectSummary {
        id: id.clone(),
        name: row.get(1)?,
        description: row.get(2)?,
        system_instruction: row.get(3)?,
        knowledge_base_ids: kbase_ids,
        created_at: row.get(4)?,
        updated_at: row.get(5)?,
        is_active: active_id == Some(id.as_str()),
    })
}

fn load_kbase_ids(conn: &Connection, project_id: &str) -> Result<Vec<String>, String> {
    let mut stmt = conn
        .prepare(
            "SELECT knowledge_base_id FROM project_knowledge_bases WHERE project_id = ?1 ORDER BY knowledge_base_id",
        )
        .map_err(|e| e.to_string())?;
    let rows = stmt
        .query_map(params![project_id], |row| row.get(0))
        .map_err(|e| e.to_string())?;
    rows.collect::<Result<Vec<_>, _>>().map_err(|e| e.to_string())
}

fn replace_kbase_ids(
    conn: &Connection,
    project_id: &str,
    kbase_ids: &[String],
) -> Result<(), String> {
    conn.execute(
        "DELETE FROM project_knowledge_bases WHERE project_id = ?1",
        params![project_id],
    )
    .map_err(|e| e.to_string())?;
    for kb_id in kbase_ids {
        let exists: bool = conn
            .query_row(
                "SELECT 1 FROM knowledge_bases WHERE id = ?1",
                params![kb_id],
                |_| Ok(true),
            )
            .unwrap_or(false);
        if !exists {
            return Err(format!("Base de contexte introuvable : {kb_id}"));
        }
        conn.execute(
            "INSERT INTO project_knowledge_bases (project_id, knowledge_base_id) VALUES (?1, ?2)",
            params![project_id, kb_id],
        )
        .map_err(|e| e.to_string())?;
    }
    Ok(())
}

pub fn list_projects(active_id: Option<&str>) -> Result<Vec<ProjectSummary>, String> {
    with_context_db(|conn| {
        let mut stmt = conn
            .prepare(
                "SELECT id, name, description, system_instruction, created_at, updated_at
                 FROM projects ORDER BY updated_at DESC",
            )
            .map_err(|e| e.to_string())?;
        let rows = stmt
            .query_map([], |row| {
                let id: String = row.get(0)?;
                Ok(id)
            })
            .map_err(|e| e.to_string())?;
        let ids: Vec<String> = rows
            .filter_map(|r| r.ok())
            .collect();
        let mut projects = Vec::new();
        for id in ids {
            let mut stmt = conn
                .prepare(
                    "SELECT id, name, description, system_instruction, created_at, updated_at
                     FROM projects WHERE id = ?1",
                )
                .map_err(|e| e.to_string())?;
            let project = stmt
                .query_row(params![id], |row| {
                    let kbase_ids = load_kbase_ids(conn, &id).unwrap_or_default();
                    row_to_project(row, kbase_ids, active_id)
                })
                .map_err(|e| e.to_string())?;
            projects.push(project);
        }
        Ok(projects)
    })
}

pub fn get_project(id: &str, active_id: Option<&str>) -> Result<ProjectSummary, String> {
    with_context_db(|conn| {
        conn.query_row(
            "SELECT id, name, description, system_instruction, created_at, updated_at
             FROM projects WHERE id = ?1",
            params![id],
            |row| {
                let kbase_ids = load_kbase_ids(conn, id).unwrap_or_default();
                row_to_project(row, kbase_ids, active_id)
            },
        )
        .map_err(|e| e.to_string())
    })
}

pub fn create_project(
    name: &str,
    description: &str,
    knowledge_base_ids: &[String],
) -> Result<ProjectSummary, String> {
    with_context_db(|conn| {
        let count: u32 = conn
            .query_row("SELECT COUNT(*) FROM projects", [], |r| r.get(0))
            .map_err(|e| e.to_string())?;
        if count >= MAX_PROJECTS {
            return Err(format!("Limite de {MAX_PROJECTS} projets atteinte"));
        }
        let id = Uuid::new_v4().to_string();
        let now = chrono::Utc::now().to_rfc3339();
        conn.execute(
            "INSERT INTO projects (id, name, description, system_instruction, created_at, updated_at)
             VALUES (?1, ?2, ?3, '', ?4, ?4)",
            params![id, name, description, now],
        )
        .map_err(|e| e.to_string())?;
        replace_kbase_ids(conn, &id, knowledge_base_ids)?;
        let kbase_ids = load_kbase_ids(conn, &id)?;
        Ok(ProjectSummary {
            id,
            name: name.to_string(),
            description: description.to_string(),
            system_instruction: String::new(),
            knowledge_base_ids: kbase_ids,
            created_at: now.clone(),
            updated_at: now,
            is_active: false,
        })
    })
}

pub fn update_project(
    id: &str,
    name: Option<&str>,
    description: Option<&str>,
    system_instruction: Option<&str>,
    knowledge_base_ids: Option<&[String]>,
    active_id: Option<&str>,
) -> Result<ProjectSummary, String> {
    with_context_db(|conn| {
        let now = chrono::Utc::now().to_rfc3339();
        if let Some(n) = name {
            conn.execute(
                "UPDATE projects SET name = ?1, updated_at = ?2 WHERE id = ?3",
                params![n, now, id],
            )
            .map_err(|e| e.to_string())?;
        }
        if let Some(d) = description {
            conn.execute(
                "UPDATE projects SET description = ?1, updated_at = ?2 WHERE id = ?3",
                params![d, now, id],
            )
            .map_err(|e| e.to_string())?;
        }
        if let Some(instr) = system_instruction {
            conn.execute(
                "UPDATE projects SET system_instruction = ?1, updated_at = ?2 WHERE id = ?3",
                params![instr, now, id],
            )
            .map_err(|e| e.to_string())?;
        }
        if let Some(ids) = knowledge_base_ids {
            replace_kbase_ids(conn, id, ids)?;
            conn.execute(
                "UPDATE projects SET updated_at = ?1 WHERE id = ?2",
                params![now, id],
            )
            .map_err(|e| e.to_string())?;
        }
        get_project(id, active_id)
    })
}

pub fn set_project_knowledge_bases(
    id: &str,
    knowledge_base_ids: &[String],
    active_id: Option<&str>,
) -> Result<ProjectSummary, String> {
    update_project(id, None, None, None, Some(knowledge_base_ids), active_id)
}

pub fn delete_project(id: &str) -> Result<(), String> {
    with_context_db(|conn| {
        conn.execute("DELETE FROM projects WHERE id = ?1", params![id])
            .map_err(|e| e.to_string())?;
        Ok(())
    })
}

pub fn open_project(id: &str) -> Result<(ProjectSummary, Vec<String>), String> {
    let _ = get_project(id, None)?;
    crate::settings::set_active_project_id(Some(id.to_string()))?;
    let project = get_project(id, Some(id))?;
    Ok((project, project.knowledge_base_ids.clone()))
}

pub fn get_active_project_id() -> Option<String> {
    crate::settings::get_active_project_id().ok().flatten()
}

pub fn resolve_project_context_ids(project_id: &str) -> Result<Vec<String>, String> {
    get_project(project_id, None).map(|p| p.knowledge_base_ids)
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::context::store::{create_knowledge_base, init_db, ContextLimits};
    use std::sync::{Mutex, OnceLock};

    fn test_lock() -> std::sync::MutexGuard<'static, ()> {
        static LOCK: OnceLock<Mutex<()>> = OnceLock::new();
        LOCK.get_or_init(|| Mutex::new(()))
            .lock()
            .unwrap_or_else(|e| e.into_inner())
    }

    #[test]
    fn create_open_project_persists_kbase_ids() {
        let _guard = test_lock();
        init_db().expect("init db");
        let kb = create_knowledge_base("KB test", "", &ContextLimits::default()).unwrap();
        let project = create_project("Projet A", "desc", &[kb.id.clone()]).unwrap();
        assert_eq!(project.knowledge_base_ids, vec![kb.id]);

        let (opened, ids) = open_project(&project.id).unwrap();
        assert_eq!(ids, vec![kb.id]);
        assert!(opened.is_active);

        assert_eq!(get_active_project_id(), Some(project.id));
    }
}
