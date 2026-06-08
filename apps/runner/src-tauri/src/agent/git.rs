use crate::context::list_all_context_links;
use crate::process::command_hidden;
use serde::Serialize;
use std::path::{Path, PathBuf};

const MAX_DIFF_BYTES: usize = 120_000;

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct GitRepoInfo {
    pub link_id: String,
    pub path: String,
    pub knowledge_base_id: String,
    pub has_gh: bool,
}

pub fn find_git_repos() -> Result<Vec<GitRepoInfo>, String> {
    let links = list_all_context_links()?;
    let gh = is_gh_available();
    let mut repos = Vec::new();
    let mut seen = std::collections::HashSet::new();

    for link in links {
        if !link.enabled {
            continue;
        }
        let root = resolve_git_root(&link.path);
        if let Some(root) = root {
            let key = root.to_string_lossy().to_string();
            if seen.insert(key.clone()) {
                repos.push(GitRepoInfo {
                    link_id: link.id,
                    path: key,
                    knowledge_base_id: link.knowledge_base_id,
                    has_gh: gh,
                });
            }
        }
    }

    repos.sort_by(|a, b| a.path.cmp(&b.path));
    Ok(repos)
}

fn resolve_git_root(path: &str) -> Option<PathBuf> {
    let mut current = PathBuf::from(path);
    if current.is_file() {
        current = current.parent()?.to_path_buf();
    }
    for _ in 0..12 {
        if current.join(".git").exists() {
            return Some(current);
        }
        if !current.pop() {
            break;
        }
    }
    None
}

pub fn is_gh_available() -> bool {
    command_hidden("gh")
        .arg("--version")
        .output()
        .map(|o| o.status.success())
        .unwrap_or(false)
}

pub fn collect_git_diff(repo_path: &str, mode: &str) -> Result<String, String> {
    let root = Path::new(repo_path);
    if !root.join(".git").exists() {
        return Err("Le chemin indiqué n'est pas un dépôt Git.".into());
    }

    let mut cmd = command_hidden("git");
    cmd.current_dir(root);

    match mode {
        "staged" => {
            cmd.args(["diff", "--cached", "--no-color"]);
        }
        "head" => {
            cmd.args(["diff", "HEAD", "--no-color"]);
        }
        "unstaged" | "working" => {
            cmd.args(["diff", "--no-color"]);
        }
        other if other.starts_with("range:") => {
            let range = other.trim_start_matches("range:");
            cmd.args(["diff", range, "--no-color"]);
        }
        _ => {
            cmd.args(["diff", "HEAD", "--no-color"]);
        }
    }

    let output = cmd.output().map_err(|e| format!("git introuvable : {e}"))?;
    if !output.status.success() {
        let stderr = String::from_utf8_lossy(&output.stderr);
        return Err(format!("git diff a échoué : {stderr}"));
    }

    let diff = String::from_utf8_lossy(&output.stdout).into_owned();
    Ok(truncate_diff(&diff))
}

pub fn collect_gh_pr_diff(repo_path: &str, pr_number: u32) -> Result<String, String> {
    if !is_gh_available() {
        return Err(
            "GitHub CLI (gh) n'est pas installé ou accessible depuis le PATH.".into(),
        );
    }

    let root = Path::new(repo_path);
    if !root.join(".git").exists() {
        return Err("Le chemin indiqué n'est pas un dépôt Git.".into());
    }

    let output = command_hidden("gh")
        .current_dir(root)
        .args(["pr", "diff", &pr_number.to_string(), "--color", "never"])
        .output()
        .map_err(|e| format!("gh introuvable : {e}"))?;

    if !output.status.success() {
        let stderr = String::from_utf8_lossy(&output.stderr);
        return Err(format!("gh pr diff a échoué : {stderr}"));
    }

    let diff = String::from_utf8_lossy(&output.stdout).into_owned();
    if diff.trim().is_empty() {
        return Err("Le diff de la PR est vide.".into());
    }
    Ok(truncate_diff(&diff))
}

fn truncate_diff(diff: &str) -> String {
    if diff.len() <= MAX_DIFF_BYTES {
        return diff.to_string();
    }
    let mut end = MAX_DIFF_BYTES;
    while end > 0 && !diff.is_char_boundary(end) {
        end -= 1;
    }
    format!(
        "{}\n\n… [diff tronqué à {} octets pour la review locale]",
        &diff[..end],
        MAX_DIFF_BYTES
    )
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn truncate_diff_keeps_short_input() {
        let input = "+++ b/file.rs\n+hello";
        assert_eq!(truncate_diff(input), input);
    }
}
