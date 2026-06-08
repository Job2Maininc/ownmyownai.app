use crate::context::list_all_context_links;
use std::path::{Path, PathBuf};

pub fn collect_allowed_roots() -> Vec<PathBuf> {
    list_all_context_links()
        .unwrap_or_default()
        .into_iter()
        .filter(|l| l.enabled)
        .map(|l| PathBuf::from(&l.path))
        .collect()
}

pub fn resolve_sandboxed_path(requested: &str, roots: &[PathBuf]) -> Result<PathBuf, String> {
    let effective_roots: Vec<PathBuf> = if roots.is_empty() {
        collect_allowed_roots()
    } else {
        roots.to_vec()
    };
    if effective_roots.is_empty() {
        return Err("Aucune source liée — liez un dossier ou un dépôt Git d'abord.".into());
    }

    let requested_path = PathBuf::from(requested);
    for root in &effective_roots {
        let candidate = if requested_path.is_absolute() {
            requested_path.clone()
        } else {
            root.join(&requested_path)
        };
        let root_canon = root.canonicalize().unwrap_or_else(|_| root.clone());
        let resolved = candidate.canonicalize().unwrap_or(candidate);
        if resolved.starts_with(&root_canon) {
            return Ok(resolved);
        }
    }
    Err(format!(
        "Chemin hors périmètre autorisé : {}",
        requested_path.display()
    ))
}

#[cfg(test)]
mod tests {
    use super::*;
    use std::fs;

    #[test]
    fn rejects_path_outside_roots() {
        let roots = vec![PathBuf::from("C:\\linked_only")];
        assert!(resolve_sandboxed_path("C:\\other\\secret.txt", &roots).is_err());
    }

    #[test]
    fn allows_path_under_temp_root() {
        let root = std::env::temp_dir();
        let child = root.join("omoa_agent_sandbox_ok");
        let _ = fs::create_dir_all(&child);
        let roots = vec![root.clone()];
        assert!(resolve_sandboxed_path(&child.to_string_lossy(), &roots).is_ok());
        let _ = fs::remove_dir_all(&child);
    }
}
