use super::store::{list_context_links, ContextLink};
use std::collections::HashSet;
use std::fs;
use std::path::{Path, PathBuf};

const MAX_RULES_CHARS: usize = 32_000;
const RULES_MD: &str = ".ownmyownai/rules.md";
const CURSORRULES: &str = ".cursorrules";

fn link_root_path(link: &ContextLink) -> Option<PathBuf> {
    match link.link_type.as_str() {
        "folder" | "drive" | "repo" => Some(PathBuf::from(&link.path)),
        "file" => {
            let path = PathBuf::from(&link.path);
            path.parent().map(|parent| parent.to_path_buf())
        }
        _ => None,
    }
}

fn read_rules_file(path: &Path) -> Option<String> {
    let content = fs::read_to_string(path).ok()?;
    let trimmed = content.trim();
    if trimmed.is_empty() {
        None
    } else {
        Some(trimmed.to_string())
    }
}

fn rules_for_root(root: &Path) -> Option<(String, String)> {
    let rules_md = root.join(RULES_MD);
    if let Some(content) = read_rules_file(&rules_md) {
        return Some((rules_md.display().to_string(), content));
    }
    let cursorrules = root.join(CURSORRULES);
    if let Some(content) = read_rules_file(&cursorrules) {
        return Some((cursorrules.display().to_string(), content));
    }
    None
}

/// Load `.ownmyownai/rules.md` or `.cursorrules` from folders linked to the given bases.
pub fn load_project_rules(kb_ids: &[String]) -> Result<Option<String>, String> {
    if kb_ids.is_empty() {
        return Ok(None);
    }

    let mut seen_roots = HashSet::new();
    let mut sections = Vec::new();

    for kb_id in kb_ids {
        let links = list_context_links(kb_id)?;
        for link in links {
            if !link.enabled {
                continue;
            }
            let Some(root) = link_root_path(&link) else {
                continue;
            };
            let root_key = root.to_string_lossy().to_lowercase();
            if !seen_roots.insert(root_key) {
                continue;
            }
            if let Some((source, content)) = rules_for_root(&root) {
                sections.push(format!("## Règles ({source})\n\n{content}"));
            }
        }
    }

    if sections.is_empty() {
        return Ok(None);
    }

    let mut combined = format!(
        "Règles du projet (dossiers liés). Applique-les en priorité pour ce chat.\n\n{}",
        sections.join("\n\n")
    );

    if combined.chars().count() > MAX_RULES_CHARS {
        combined = combined.chars().take(MAX_RULES_CHARS).collect::<String>();
        combined.push_str("\n\n[… règles tronquées]");
    }

    Ok(Some(combined))
}

#[cfg(test)]
mod tests {
    use super::*;
    #[test]
    fn rules_for_root_prefers_ownmyownai_rules_md() {
        let dir = std::env::temp_dir().join(format!("omoa-rules-{}", uuid::Uuid::new_v4()));
        fs::create_dir_all(&dir).unwrap();
        fs::write(dir.join(".cursorrules"), "cursor rules").unwrap();
        let own_dir = dir.join(".ownmyownai");
        fs::create_dir_all(&own_dir).unwrap();
        fs::write(own_dir.join("rules.md"), "project rules").unwrap();

        let (source, content) = rules_for_root(&dir).unwrap();
        assert!(source.contains("rules.md"));
        assert_eq!(content, "project rules");

        let _ = fs::remove_dir_all(&dir);
    }

    #[test]
    fn rules_for_root_falls_back_to_cursorrules() {
        let dir = std::env::temp_dir().join(format!("omoa-cursor-{}", uuid::Uuid::new_v4()));
        fs::create_dir_all(&dir).unwrap();
        fs::write(dir.join(".cursorrules"), "only cursor").unwrap();

        let (_, content) = rules_for_root(&dir).unwrap();
        assert_eq!(content, "only cursor");

        let _ = fs::remove_dir_all(&dir);
    }

    #[test]
    fn link_root_path_file_uses_parent_directory() {
        let link = ContextLink {
            id: "l1".into(),
            knowledge_base_id: "kb1".into(),
            link_type: "file".into(),
            path: r"C:\repo\src\main.rs".into(),
            recursive: false,
            enabled: true,
            last_sync_at: None,
            last_sync_status: "ok".into(),
            last_sync_error: None,
            doc_count: 0,
        };
        let root = link_root_path(&link).unwrap();
        assert_eq!(root, PathBuf::from(r"C:\repo\src"));
    }
}
