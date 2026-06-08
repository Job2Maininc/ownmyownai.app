use crate::agent::sandbox::{collect_allowed_roots, resolve_sandboxed_path};
use serde::Serialize;
use std::fs;
use std::path::PathBuf;

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct PatchPreview {
    pub path: String,
    pub patch: String,
    pub lines_added: u32,
    pub lines_removed: u32,
    pub hunks: u32,
}

fn extract_path_from_patch(patch: &str) -> Option<String> {
    for line in patch.lines() {
        if let Some(rest) = line.strip_prefix("+++ ") {
            let path = rest.trim_start_matches("b/").trim();
            if path != "/dev/null" && !path.is_empty() {
                return Some(path.to_string());
            }
        }
    }
    None
}

fn count_patch_stats(patch: &str) -> (u32, u32, u32) {
    let mut added = 0u32;
    let mut removed = 0u32;
    let mut hunks = 0u32;
    for line in patch.lines() {
        if line.starts_with("@@") {
            hunks += 1;
        } else if line.starts_with('+') && !line.starts_with("+++") {
            added += 1;
        } else if line.starts_with('-') && !line.starts_with("---") {
            removed += 1;
        }
    }
    (added, removed, hunks)
}

fn resolve_patch_path(path_hint: Option<&str>, patch: &str) -> Result<PathBuf, String> {
    let path_str = path_hint
        .filter(|p| !p.trim().is_empty())
        .map(str::trim)
        .map(String::from)
        .or_else(|| extract_path_from_patch(patch))
        .ok_or_else(|| {
            String::from(
                "Chemin cible introuvable — indiquez path ou un en-tête +++ dans le patch.",
            )
        })?;

    let roots = collect_allowed_roots();
    resolve_sandboxed_path(&path_str, &roots)
}

pub fn preview_patch(
    path_hint: Option<&str>,
    patch: &str,
    _context_ids: &[String],
) -> Result<PatchPreview, String> {
    if patch.trim().is_empty() {
        return Err("Patch vide.".into());
    }
    if !patch.contains("@@") {
        return Err("Format unified diff invalide (@@ manquant).".into());
    }

    let resolved = resolve_patch_path(path_hint, patch)?;
    if !resolved.is_file() {
        return Err(format!(
            "Fichier introuvable : {}",
            resolved.display()
        ));
    }

    let (lines_added, lines_removed, hunks) = count_patch_stats(patch);
    Ok(PatchPreview {
        path: resolved.to_string_lossy().into_owned(),
        patch: patch.to_string(),
        lines_added,
        lines_removed,
        hunks,
    })
}

pub fn apply_patch(
    path_hint: Option<&str>,
    patch: &str,
    context_ids: &[String],
) -> Result<(), String> {
    let preview = preview_patch(path_hint, patch, context_ids)?;
    let original =
        fs::read_to_string(&preview.path).map_err(|e| format!("Lecture impossible : {e}"))?;
    let updated = apply_unified_patch(&original, &preview.patch)?;
    fs::write(&preview.path, updated).map_err(|e| format!("Écriture impossible : {e}"))?;
    Ok(())
}

#[derive(Debug)]
enum DiffOp {
    Context(String),
    Remove(String),
    Add(String),
}

#[derive(Debug)]
struct Hunk {
    old_start: usize,
    lines: Vec<DiffOp>,
}

fn parse_hunks(patch: &str) -> Result<Vec<Hunk>, String> {
    let mut hunks = Vec::new();
    let mut current: Option<Hunk> = None;

    for line in patch.lines() {
        if line.starts_with("@@") {
            if let Some(h) = current.take() {
                hunks.push(h);
            }
            let header = line
                .trim_start_matches("@@")
                .trim_end_matches("@@")
                .trim();
            let old_part = header.split_whitespace().next().unwrap_or("");
            let old_start = old_part
                .trim_start_matches('-')
                .split(',')
                .next()
                .unwrap_or("1")
                .parse::<usize>()
                .map_err(|_| format!("En-tête de hunk invalide : {line}"))?;
            current = Some(Hunk {
                old_start,
                lines: Vec::new(),
            });
            continue;
        }

        let Some(hunk) = current.as_mut() else {
            continue;
        };

        if let Some(rest) = line.strip_prefix(' ') {
            hunk.lines.push(DiffOp::Context(rest.to_string()));
        } else if let Some(rest) = line.strip_prefix('-') {
            if line.starts_with("---") {
                continue;
            }
            hunk.lines.push(DiffOp::Remove(rest.to_string()));
        } else if let Some(rest) = line.strip_prefix('+') {
            if line.starts_with("+++") {
                continue;
            }
            hunk.lines.push(DiffOp::Add(rest.to_string()));
        }
    }

    if let Some(h) = current {
        hunks.push(h);
    }

    if hunks.is_empty() {
        return Err("Aucun hunk trouvé dans le patch.".into());
    }
    Ok(hunks)
}

fn apply_unified_patch(original: &str, patch: &str) -> Result<String, String> {
    let lines: Vec<String> = original.lines().map(String::from).collect();
    let had_trailing_newline = original.ends_with('\n');
    let hunks = parse_hunks(patch)?;

    let mut cursor = 0usize;
    let mut output: Vec<String> = Vec::new();

    for hunk in hunks {
        let hunk_start = hunk.old_start.saturating_sub(1);
        if hunk_start < cursor {
            return Err("Hunks chevauchants ou ordre invalide.".into());
        }
        if hunk_start > lines.len() {
            return Err("Hunk hors limites.".into());
        }
        output.extend(lines[cursor..hunk_start].iter().cloned());

        let mut idx = hunk_start;
        for op in &hunk.lines {
            match op {
                DiffOp::Context(text) => {
                    if lines.get(idx) != Some(text) {
                        return Err(format!(
                            "Contexte du patch incompatible à la ligne {}.",
                            idx + 1
                        ));
                    }
                    output.push(text.clone());
                    idx += 1;
                }
                DiffOp::Remove(text) => {
                    if lines.get(idx) != Some(text) {
                        return Err(format!(
                            "Suppression incompatible à la ligne {}.",
                            idx + 1
                        ));
                    }
                    idx += 1;
                }
                DiffOp::Add(text) => {
                    output.push(text.clone());
                }
            }
        }
        cursor = idx;
    }

    if cursor <= lines.len() {
        output.extend(lines[cursor..].iter().cloned());
    }

    let mut out = output.join("\n");
    if had_trailing_newline && !out.ends_with('\n') {
        out.push('\n');
    }
    Ok(out)
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn counts_hunk_stats() {
        let patch = "--- a/foo.txt\n+++ b/foo.txt\n@@ -1,2 +1,2 @@\n-old\n+new\n ctx";
        let (a, r, h) = count_patch_stats(patch);
        assert_eq!(h, 1);
        assert_eq!(a, 1);
        assert_eq!(r, 1);
    }

    #[test]
    fn applies_simple_hunk() {
        let original = "alpha\nbeta\ngamma\n";
        let patch = "@@ -2,1 +2,1 @@\n-beta\n+BRAVO\n";
        let out = apply_unified_patch(original, patch).unwrap();
        assert!(out.contains("BRAVO"));
        assert!(!out.contains("\nbeta\n"));
    }
}
