use super::git::{collect_gh_pr_diff, collect_git_diff};
use crate::context::get_context_link;
use crate::ollama::{chat_completion, ensure_ollama_running, model_exists};
use crate::settings::resolved_default_model;
use regex::Regex;
use serde::{Deserialize, Serialize};
use std::collections::HashSet;

const REVIEW_SYSTEM_PROMPT: &str = r#"You are a senior code reviewer for OwnMyOwnAI. Review the provided git diff locally.

Respond in French with this exact markdown structure:

## Résumé
(2-4 sentences: what changes and overall risk level)

## Fichiers impactés
(bullet list of changed files with one-line purpose each)

## Analyse sécurité
(map each static finding; note false positives; add any missed risks)

## Qualité & maintenabilité
(brief notes on patterns, tests, edge cases)

## Recommandations
(numbered actionable items, highest priority first)

Be concise. Do not invent files not present in the diff."#;

#[derive(Debug, Clone, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct PrReviewInput {
    pub diff: Option<String>,
    pub repo_path: Option<String>,
    pub link_id: Option<String>,
    pub diff_mode: Option<String>,
    pub pr_number: Option<u32>,
    pub model: Option<String>,
}

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct SecurityFinding {
    pub severity: String,
    pub category: String,
    pub file: Option<String>,
    pub line_hint: Option<String>,
    pub message: String,
}

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct DiffStats {
    pub files_changed: u32,
    pub lines_added: u32,
    pub lines_removed: u32,
    pub bytes: u32,
}

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct PrReviewResult {
    pub repo_path: Option<String>,
    pub diff_stats: DiffStats,
    pub files_touched: Vec<String>,
    pub security_findings: Vec<SecurityFinding>,
    pub static_checklist: String,
    pub ai_review: String,
    pub model: String,
}

pub async fn review_git_diff(input: PrReviewInput) -> Result<PrReviewResult, String> {
    ensure_ollama_running(None).await?;

    let repo_path = resolve_repo_path(&input)?;
    let diff = resolve_diff(&input, repo_path.as_deref())?;
    if diff.trim().is_empty() {
        return Err("Le diff est vide — rien à reviewer.".into());
    }

    let default_model = resolved_default_model();
    let model = input
        .model
        .as_deref()
        .unwrap_or(default_model.as_str());
    if !model_exists(model) {
        return Err(format!(
            "Le modèle « {model} » n'est pas installé sur ce PC."
        ));
    }

    let files_touched = extract_changed_files(&diff);
    let diff_stats = compute_diff_stats(&diff);
    let security_findings = scan_security_checklist(&diff);
    let static_checklist = format_static_checklist(&security_findings);

    let user_prompt = build_user_prompt(repo_path.as_deref(), &diff, &static_checklist);
    let messages = vec![
        serde_json::json!({ "role": "system", "content": REVIEW_SYSTEM_PROMPT }),
        serde_json::json!({ "role": "user", "content": user_prompt }),
    ];

    let ai_review = chat_completion(model, &messages).await?;

    Ok(PrReviewResult {
        repo_path,
        diff_stats,
        files_touched,
        security_findings,
        static_checklist,
        ai_review,
        model: model.to_string(),
    })
}

fn resolve_repo_path(input: &PrReviewInput) -> Result<Option<String>, String> {
    if let Some(path) = input.repo_path.as_ref() {
        return Ok(Some(path.clone()));
    }
    if let Some(link_id) = input.link_id.as_ref() {
        let link = get_context_link(link_id)?;
        return Ok(Some(link.path));
    }
    Ok(None)
}

fn resolve_diff(input: &PrReviewInput, repo_path: Option<&str>) -> Result<String, String> {
    if let Some(diff) = input.diff.as_ref() {
        if !diff.trim().is_empty() {
            return Ok(diff.clone());
        }
    }

    let repo = repo_path.ok_or(
        "Fournissez un diff collé ou un dépôt lié (repoPath / linkId).".to_string(),
    )?;

    if let Some(pr) = input.pr_number {
        return collect_gh_pr_diff(repo, pr);
    }

    let mode = input.diff_mode.as_deref().unwrap_or("head");
    collect_git_diff(repo, mode)
}

fn build_user_prompt(repo_path: Option<&str>, diff: &str, checklist: &str) -> String {
    let mut parts = Vec::new();
    if let Some(path) = repo_path {
        parts.push(format!("Dépôt : {path}"));
    }
    parts.push("Checklist statique (pré-analyse locale) :".into());
    parts.push(checklist.to_string());
    parts.push("Diff git :".into());
    parts.push(format!("```diff\n{diff}\n```"));
    parts.join("\n\n")
}

pub fn scan_security_checklist(diff: &str) -> Vec<SecurityFinding> {
    let mut findings = Vec::new();
    let mut current_file: Option<String> = None;

    let patterns: &[(&str, &str, &str)] = &[
        (
            "critical",
            "secret",
            r#"(?i)(api[_-]?key|secret|password|token|private[_-]?key)\s*[=:]\s*['"][^'"]{8,}['"]"#,
        ),
        ("critical", "aws_key", r"AKIA[0-9A-Z]{16}"),
        (
            "critical",
            "private_key",
            r"-----BEGIN (?:RSA |EC |OPENSSH )?PRIVATE KEY-----",
        ),
        ("critical", "env_commit", r"^\+\s*\.env(?:\.|$)"),
        ("warning", "eval_exec", r"(?i)\b(eval|exec|Function\()\s*\("),
        (
            "warning",
            "sql_concat",
            r#"(?i)(SELECT|INSERT|UPDATE|DELETE).*(?:\+|concat)\s*.*(?:req\.|params\.|query\.)"#,
        ),
        (
            "warning",
            "unsafe_deser",
            r"(?i)(pickle\.loads|yaml\.load\(|unserialize\()",
        ),
        (
            "warning",
            "path_traversal",
            r"(?i)(\.\./|path\.join\(.*req\.|\.\.\\)",
        ),
        ("info", "todo_fixme", r"(?i)(TODO|FIXME|HACK|XXX)\b"),
        ("info", "console_log", r"(?i)(console\.(log|debug)|print\(|dbg!\()"),
    ];

    let compiled: Vec<_> = patterns
        .iter()
        .filter_map(|(sev, cat, pat)| Regex::new(pat).ok().map(|re| (*sev, *cat, re)))
        .collect();

    for line in diff.lines() {
        if line.starts_with("+++ b/") || line.starts_with("+++ ") {
            current_file = Some(line.trim_start_matches("+++ ").trim_start_matches("b/").into());
        }
        if !line.starts_with('+') || line.starts_with("+++") {
            continue;
        }
        let added = &line[1..];
        for (severity, category, re) in &compiled {
            if re.is_match(added) {
                findings.push(SecurityFinding {
                    severity: (*severity).into(),
                    category: (*category).into(),
                    file: current_file.clone(),
                    line_hint: Some(truncate_line(added, 120)),
                    message: category_message(category),
                });
            }
        }
    }

    dedupe_findings(findings)
}

fn category_message(category: &str) -> String {
    match category {
        "secret" => "Possible secret ou credential en dur dans une ligne ajoutée.".into(),
        "aws_key" => "Clé d'accès AWS potentielle détectée.".into(),
        "private_key" => "Bloc de clé privée détecté dans le diff.".into(),
        "env_commit" => "Fichier .env ajouté — risque d'exposition de secrets.".into(),
        "eval_exec" => "Appel eval/exec — risque d'exécution de code arbitraire.".into(),
        "sql_concat" => "Concaténation SQL suspecte — risque d'injection.".into(),
        "unsafe_deser" => "Désérialisation non sécurisée.".into(),
        "path_traversal" => "Chemin relatif ou jointure suspecte — risque path traversal.".into(),
        "todo_fixme" => "Marqueur TODO/FIXME laissé dans le code ajouté.".into(),
        "console_log" => "Log de debug laissé dans le code ajouté.".into(),
        _ => "Motif de sécurité détecté.".into(),
    }
}

fn dedupe_findings(findings: Vec<SecurityFinding>) -> Vec<SecurityFinding> {
    let mut seen = HashSet::new();
    findings
        .into_iter()
        .filter(|f| {
            let key = format!(
                "{}|{}|{}|{}",
                f.severity,
                f.category,
                f.file.as_deref().unwrap_or(""),
                f.line_hint.as_deref().unwrap_or("")
            );
            seen.insert(key)
        })
        .collect()
}

fn format_static_checklist(findings: &[SecurityFinding]) -> String {
    if findings.is_empty() {
        return "Aucun signal statique détecté (checklist locale : secrets, eval, SQL, .env, clés privées).".into();
    }
    let mut lines = Vec::new();
    for f in findings {
        let file = f.file.as_deref().unwrap_or("?");
        lines.push(format!(
            "- [{}] {} ({}) — {}",
            f.severity.to_uppercase(),
            f.category,
            file,
            f.message
        ));
    }
    lines.join("\n")
}

fn extract_changed_files(diff: &str) -> Vec<String> {
    let mut files = Vec::new();
    let mut seen = HashSet::new();
    for line in diff.lines() {
        if let Some(path) = line.strip_prefix("+++ b/") {
            if seen.insert(path.to_string()) {
                files.push(path.to_string());
            }
        }
    }
    files
}

fn compute_diff_stats(diff: &str) -> DiffStats {
    let mut added = 0u32;
    let mut removed = 0u32;
    for line in diff.lines() {
        if line.starts_with("+++") || line.starts_with("---") || line.starts_with("@@") {
            continue;
        }
        if line.starts_with('+') {
            added += 1;
        } else if line.starts_with('-') {
            removed += 1;
        }
    }
    DiffStats {
        files_changed: extract_changed_files(diff).len() as u32,
        lines_added: added,
        lines_removed: removed,
        bytes: diff.len() as u32,
    }
}

fn truncate_line(line: &str, max: usize) -> String {
    if line.len() <= max {
        return line.to_string();
    }
    let mut end = max;
    while end > 0 && !line.is_char_boundary(end) {
        end -= 1;
    }
    format!("{}…", &line[..end])
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn detects_hardcoded_secret_in_added_line() {
        let diff = "+++ b/src/auth.ts\n+const apiKey = \"sk-live-abcdefghijklmnop\"\n";
        let findings = scan_security_checklist(diff);
        assert!(findings.iter().any(|f| f.category == "secret"));
    }

    #[test]
    fn ignores_removed_lines() {
        let diff = "--- a/src/auth.ts\n-const apiKey = \"sk-live-abcdefghijklmnop\"\n";
        let findings = scan_security_checklist(diff);
        assert!(findings.is_empty());
    }
}
