use super::store::{
    clear_symbols_for_document, get_repo_link_ids_for_bases, insert_symbol, search_code_files,
    search_code_symbols, CodeSymbolHit,
};
use std::path::Path;

#[derive(Debug, Clone)]
pub struct ExtractedSymbol {
    pub name: String,
    pub kind: String,
    pub line_number: u32,
    pub signature: String,
}

pub fn is_git_repo(path: &Path) -> bool {
    path.join(".git").exists()
}

pub fn is_code_file(path: &Path) -> bool {
    let ext = path
        .extension()
        .and_then(|e| e.to_str())
        .unwrap_or("")
        .to_lowercase();
    matches!(
        ext.as_str(),
        "rs" | "ts"
            | "tsx"
            | "js"
            | "jsx"
            | "py"
            | "go"
            | "java"
            | "c"
            | "cpp"
            | "h"
            | "hpp"
            | "cs"
            | "rb"
            | "php"
            | "sql"
            | "vue"
            | "svelte"
    )
}

pub fn extract_symbols(content: &str) -> Vec<ExtractedSymbol> {
    let mut symbols = Vec::new();
    let patterns: &[(&str, &str)] = &[
        (r"(?m)^(?:pub\s+)?(?:async\s+)?fn\s+(\w+)", "function"),
        (r"(?m)^(?:pub\s+)?struct\s+(\w+)", "struct"),
        (r"(?m)^(?:pub\s+)?enum\s+(\w+)", "enum"),
        (r"(?m)^(?:pub\s+)?trait\s+(\w+)", "trait"),
        (r"(?m)^(?:pub\s+)?type\s+(\w+)", "type"),
        (r"(?m)^(?:pub\s+)?(?:async\s+)?fn\s+(\w+)", "function"),
        (r"(?m)(?:export\s+)?(?:async\s+)?function\s+(\w+)", "function"),
        (r"(?m)(?:export\s+)?class\s+(\w+)", "class"),
        (r"(?m)(?:export\s+)?interface\s+(\w+)", "interface"),
        (r"(?m)(?:export\s+)?type\s+(\w+)\s*=", "type"),
        (r"(?m)^(?:async\s+)?def\s+(\w+)", "function"),
        (r"(?m)^class\s+(\w+)", "class"),
    ];

    for (pattern, kind) in patterns {
        if let Ok(re) = regex::Regex::new(pattern) {
            for cap in re.captures_iter(content) {
                if let Some(name_match) = cap.get(1) {
                    let name = name_match.as_str().to_string();
                    let line_number = content[..name_match.start()]
                        .chars()
                        .filter(|c| *c == '\n')
                        .count() as u32
                        + 1;
                    let line_start = content[..name_match.start()]
                        .rfind('\n')
                        .map(|i| i + 1)
                        .unwrap_or(0);
                    let line_end = content[name_match.start()..]
                        .find('\n')
                        .map(|i| name_match.start() + i)
                        .unwrap_or(content.len());
                    let signature = content[line_start..line_end].trim().to_string();
                    if symbols
                        .iter()
                        .any(|s: &ExtractedSymbol| s.name == name && s.line_number == line_number)
                    {
                        continue;
                    }
                    symbols.push(ExtractedSymbol {
                        name,
                        kind: (*kind).to_string(),
                        line_number,
                        signature,
                    });
                }
            }
        }
    }

    symbols.sort_by(|a, b| a.line_number.cmp(&b.line_number));
    symbols
}

pub fn index_file_symbols(
    doc_id: &str,
    link_id: &str,
    relative_path: &str,
    content: &str,
) -> Result<u32, String> {
    clear_symbols_for_document(doc_id)?;
    let symbols = extract_symbols(content);
    for sym in &symbols {
        insert_symbol(
            link_id,
            Some(doc_id),
            relative_path,
            &sym.name,
            &sym.kind,
            sym.line_number,
            &sym.signature,
        )?;
    }
    Ok(symbols.len() as u32)
}

pub async fn build_codebase_context(kb_ids: &[String], query: &str) -> Result<Option<String>, String> {
    let trimmed = query.trim();
    if kb_ids.is_empty() || trimmed.is_empty() {
        return Ok(None);
    }

    let link_ids = get_repo_link_ids_for_bases(kb_ids)?;
    if link_ids.is_empty() {
        return Ok(None);
    }

    let symbols = search_code_symbols(&link_ids, trimmed, 12)?;
    let files = search_code_files(&link_ids, trimmed, 8)?;

    if symbols.is_empty() && files.is_empty() {
        return Ok(None);
    }

    let mut parts = vec![
        "Utilise les symboles et fichiers du dépôt lié ci-dessous pour répondre. Cite le chemin relatif quand c'est pertinent.".to_string(),
    ];

    if !symbols.is_empty() {
        parts.push("\n## Symboles pertinents".to_string());
        for hit in &symbols {
            parts.push(format_symbol_hit(hit));
        }
    }

    if !files.is_empty() {
        parts.push("\n## Fichiers pertinents".to_string());
        for path in &files {
            parts.push(format!("- {path}"));
        }
    }

    Ok(Some(parts.join("\n")))
}

fn format_symbol_hit(hit: &CodeSymbolHit) -> String {
    format!(
        "- {} ({}) — {}:{} — {}",
        hit.name, hit.kind, hit.relative_path, hit.line_number, hit.signature
    )
}

#[cfg(test)]
mod tests {
    use super::*;
    use std::fs;

    #[test]
    fn detects_git_repo() {
        let base = std::env::temp_dir().join(format!("omoa-git-test-{}", uuid::Uuid::new_v4()));
        fs::create_dir_all(base.join(".git")).unwrap();
        assert!(is_git_repo(&base));
        let _ = std::fs::remove_dir_all(&base);
    }

    #[test]
    fn extracts_rust_symbols() {
        let src = "pub struct User {\n    id: String,\n}\n\npub fn login() {}\n";
        let symbols = extract_symbols(src);
        assert!(symbols.iter().any(|s| s.name == "User" && s.kind == "struct"));
        assert!(symbols.iter().any(|s| s.name == "login" && s.kind == "function"));
    }

    #[test]
    fn extracts_typescript_symbols() {
        let src = "export function greet() {}\nexport class App {}\n";
        let symbols = extract_symbols(src);
        assert!(symbols.iter().any(|s| s.name == "greet"));
        assert!(symbols.iter().any(|s| s.name == "App" && s.kind == "class"));
    }
}
