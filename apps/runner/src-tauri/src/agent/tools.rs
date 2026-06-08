use super::sandbox::resolve_sandboxed_path;
use crate::context::{list_knowledge_bases, search_chunks_fts};
use crate::settings::resolved_rag_top_k;
use serde_json::{json, Value};
use std::path::PathBuf;

pub const LOCAL_TOOL_NAMES: &[&str] = &["read_file", "search_chunks", "list_dir", "stat"];

const MAX_READ_BYTES: u64 = 32_768;

pub fn tool_definitions() -> Vec<Value> {
    vec![
        json!({
            "type": "function",
            "function": {
                "name": "list_dir",
                "description": "Liste le contenu d'un dossier sous les sources liées",
                "parameters": {
                    "type": "object",
                    "properties": {
                        "path": { "type": "string", "description": "Chemin du dossier" }
                    },
                    "required": ["path"]
                }
            }
        }),
        json!({
            "type": "function",
            "function": {
                "name": "read_file",
                "description": "Lit un fichier texte (lignes paginées)",
                "parameters": {
                    "type": "object",
                    "properties": {
                        "path": { "type": "string" },
                        "offset": { "type": "integer", "description": "Ligne de départ (0-based)" },
                        "limit": { "type": "integer", "description": "Nombre de lignes max" }
                    },
                    "required": ["path"]
                }
            }
        }),
        json!({
            "type": "function",
            "function": {
                "name": "search_chunks",
                "description": "Recherche full-text dans les bases de contexte actives",
                "parameters": {
                    "type": "object",
                    "properties": {
                        "query": { "type": "string" }
                    },
                    "required": ["query"]
                }
            }
        }),
        json!({
            "type": "function",
            "function": {
                "name": "stat",
                "description": "Métadonnées fichier ou dossier",
                "parameters": {
                    "type": "object",
                    "properties": {
                        "path": { "type": "string" }
                    },
                    "required": ["path"]
                }
            }
        }),
    ]
}

fn resolve_kb_ids(context_ids: &[String]) -> Result<Vec<String>, String> {
    if !context_ids.is_empty() {
        return Ok(context_ids.to_vec());
    }
    Ok(list_knowledge_bases()?
        .into_iter()
        .map(|kb| kb.id)
        .collect())
}

pub async fn execute_tool(
    name: &str,
    args: &Value,
    roots: &[PathBuf],
    context_ids: &[String],
) -> Result<Value, String> {
    match name {
        "list_dir" => {
            let path = args
                .get("path")
                .and_then(|v| v.as_str())
                .ok_or("list_dir requiert path")?;
            let dir = resolve_sandboxed_path(path, roots)?;
            if !dir.is_dir() {
                return Err(format!("Pas un dossier : {path}"));
            }
            let mut entries = Vec::new();
            for entry in std::fs::read_dir(&dir).map_err(|e| e.to_string())? {
                let entry = entry.map_err(|e| e.to_string())?;
                let meta = entry.metadata().map_err(|e| e.to_string())?;
                entries.push(json!({
                    "name": entry.file_name().to_string_lossy(),
                    "isDir": meta.is_dir(),
                    "size": meta.len(),
                }));
            }
            entries.sort_by(|a, b| {
                a["name"]
                    .as_str()
                    .unwrap_or("")
                    .cmp(b["name"].as_str().unwrap_or(""))
            });
            Ok(json!({ "entries": entries, "path": dir.to_string_lossy() }))
        }
        "read_file" => {
            let path = args
                .get("path")
                .and_then(|v| v.as_str())
                .ok_or("read_file requiert path")?;
            let file_path = resolve_sandboxed_path(path, roots)?;
            if !file_path.is_file() {
                return Err(format!("Pas un fichier : {path}"));
            }
            let content = std::fs::read_to_string(&file_path).map_err(|e| e.to_string())?;
            let offset = args.get("offset").and_then(|v| v.as_u64()).unwrap_or(0) as usize;
            let limit = args
                .get("limit")
                .and_then(|v| v.as_u64())
                .unwrap_or(200) as usize;
            let lines: Vec<&str> = content.lines().collect();
            let slice = if offset >= lines.len() {
                Vec::new()
            } else {
                lines[offset..lines.len().min(offset + limit)].to_vec()
            };
            let truncated = file_path
                .metadata()
                .map(|m| m.len() > MAX_READ_BYTES)
                .unwrap_or(false);
            Ok(json!({
                "path": file_path.to_string_lossy(),
                "offset": offset,
                "lines": slice,
                "totalLines": lines.len(),
                "truncated": truncated,
            }))
        }
        "search_chunks" => {
            let query = args
                .get("query")
                .and_then(|v| v.as_str())
                .ok_or("search_chunks requiert query")?;
            let kb_ids = resolve_kb_ids(context_ids)?;
            if kb_ids.is_empty() {
                return Ok(json!({
                    "query": query,
                    "chunks": [],
                    "message": "Aucune base de contexte disponible"
                }));
            }
            let limit = resolved_rag_top_k() as usize;
            let hits = search_chunks_fts(&kb_ids, query, limit)?;
            let chunks: Vec<Value> = hits
                .iter()
                .enumerate()
                .map(|(i, text)| json!({ "index": i + 1, "content": text }))
                .collect();
            Ok(json!({ "query": query, "chunks": chunks }))
        }
        "stat" => {
            let path = args
                .get("path")
                .and_then(|v| v.as_str())
                .ok_or("stat requiert path")?;
            let target = resolve_sandboxed_path(path, roots)?;
            let meta = target.metadata().map_err(|e| e.to_string())?;
            Ok(json!({
                "path": target.to_string_lossy(),
                "isDir": meta.is_dir(),
                "isFile": meta.is_file(),
                "size": meta.len(),
                "modified": meta.modified().ok().and_then(|t| t.duration_since(std::time::UNIX_EPOCH).ok()).map(|d| d.as_secs()),
            }))
        }
        _ => Err(format!("Outil inconnu : {name}")),
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn local_tool_names_match_definitions() {
        let defs = tool_definitions();
        assert_eq!(defs.len(), LOCAL_TOOL_NAMES.len());
        for name in LOCAL_TOOL_NAMES {
            assert!(defs.iter().any(|d| {
                d["function"]["name"].as_str() == Some(*name)
            }));
        }
    }

    #[tokio::test]
    async fn rejects_unknown_tool() {
        let err = execute_tool("write_file", &json!({}), &[], &[])
            .await
            .unwrap_err();
        assert!(err.contains("inconnu"));
    }
}
