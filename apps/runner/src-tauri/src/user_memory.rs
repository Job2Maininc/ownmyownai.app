use crate::context::store::with_context_db;
use crate::settings::user_memory_enabled;
use chrono::Utc;
use rusqlite::params;
use serde::Serialize;
use uuid::Uuid;

const MAX_FACTS: u32 = 100;
const MAX_FACT_CHARS: usize = 500;
const MAX_INJECT: usize = 5;

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct UserMemoryFact {
    pub id: String,
    pub content: String,
    pub created_at: String,
    pub updated_at: String,
}

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct UserMemoryState {
    pub enabled: bool,
    pub facts: Vec<UserMemoryFact>,
}

pub fn list_facts() -> Result<Vec<UserMemoryFact>, String> {
    with_context_db(|conn| {
        let mut stmt = conn
            .prepare(
                "SELECT id, content, created_at, updated_at
                 FROM user_memory ORDER BY updated_at DESC",
            )
            .map_err(|e| e.to_string())?;
        let rows = stmt
            .query_map([], |row| {
                Ok(UserMemoryFact {
                    id: row.get(0)?,
                    content: row.get(1)?,
                    created_at: row.get(2)?,
                    updated_at: row.get(3)?,
                })
            })
            .map_err(|e| e.to_string())?;
        rows.collect::<Result<Vec<_>, _>>()
            .map_err(|e| e.to_string())
    })
}

pub fn memory_state() -> Result<UserMemoryState, String> {
    Ok(UserMemoryState {
        enabled: user_memory_enabled(),
        facts: list_facts()?,
    })
}

pub fn add_fact(content: &str) -> Result<UserMemoryFact, String> {
    let trimmed = content.trim();
    if trimmed.is_empty() {
        return Err("Le fait ne peut pas être vide".into());
    }
    if trimmed.chars().count() > MAX_FACT_CHARS {
        return Err(format!(
            "Le fait ne peut pas dépasser {MAX_FACT_CHARS} caractères"
        ));
    }

    with_context_db(|conn| {
        let count: u32 = conn
            .query_row("SELECT COUNT(*) FROM user_memory", [], |r| r.get(0))
            .map_err(|e| e.to_string())?;
        if count >= MAX_FACTS {
            return Err(format!("Limite de {MAX_FACTS} faits atteinte"));
        }

        let id = Uuid::new_v4().to_string();
        let now = Utc::now().to_rfc3339();
        conn.execute(
            "INSERT INTO user_memory (id, content, created_at, updated_at) VALUES (?1, ?2, ?3, ?4)",
            params![id, trimmed, now, now],
        )
        .map_err(|e| e.to_string())?;

        Ok(UserMemoryFact {
            id,
            content: trimmed.to_string(),
            created_at: now.clone(),
            updated_at: now,
        })
    })
}

pub fn delete_fact(id: &str) -> Result<(), String> {
    with_context_db(|conn| {
        let changed = conn
            .execute("DELETE FROM user_memory WHERE id = ?1", params![id])
            .map_err(|e| e.to_string())?;
        if changed == 0 {
            return Err("Fait introuvable".into());
        }
        Ok(())
    })
}

pub fn build_memory_context(query: &str) -> Option<String> {
    if !user_memory_enabled() {
        return None;
    }

    let facts = list_facts().ok()?;
    if facts.is_empty() {
        return None;
    }

    let terms = query_terms(query);
    if terms.is_empty() {
        return None;
    }

    let mut scored: Vec<(usize, &UserMemoryFact)> = facts
        .iter()
        .map(|fact| (score_fact(&fact.content, &terms), fact))
        .filter(|(score, _)| *score > 0)
        .collect();

    if scored.is_empty() {
        return None;
    }

    scored.sort_by(|a, b| b.0.cmp(&a.0));
    scored.truncate(MAX_INJECT);

    let lines: Vec<String> = scored
        .iter()
        .map(|(_, fact)| format!("- {}", fact.content))
        .collect();

    Some(format!(
        "Faits mémorisés sur l'utilisateur (opt-in, pertinents pour cette question) :\n{}\n\nUtilise ces informations uniquement si elles aident à répondre. Ne les invente pas.",
        lines.join("\n")
    ))
}

fn query_terms(query: &str) -> Vec<String> {
    query
        .to_lowercase()
        .split(|c: char| !c.is_alphanumeric())
        .filter(|t| t.len() >= 3)
        .map(String::from)
        .collect()
}

fn score_fact(content: &str, terms: &[String]) -> usize {
    let lower = content.to_lowercase();
    terms
        .iter()
        .filter(|term| lower.contains(term.as_str()))
        .count()
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn score_fact_matches_terms() {
        let terms = vec!["rust".into(), "chat".into()];
        assert_eq!(score_fact("Je préfère Rust pour le backend", &terms), 1);
        assert_eq!(score_fact("Bonjour", &terms), 0);
    }

    #[test]
    fn query_terms_filters_short_words() {
        let terms = query_terms("Je veux un chat en Rust");
        assert!(terms.contains(&"chat".to_string()));
        assert!(terms.contains(&"rust".to_string()));
        assert!(!terms.contains(&"je".to_string()));
    }
}
