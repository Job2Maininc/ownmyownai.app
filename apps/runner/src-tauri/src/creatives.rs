use crate::settings::resolved_creatives_dir;
use chrono::Utc;
use std::path::PathBuf;
use uuid::Uuid;

#[derive(Debug)]
struct ParsedArtifact {
    title: String,
    body: String,
}

fn slugify_title(title: &str) -> String {
    let mut slug = String::new();
    for ch in title.chars() {
        if ch.is_ascii_alphanumeric() {
            slug.push(ch.to_ascii_lowercase());
        } else if (ch.is_whitespace() || ch == '-' || ch == '_') && !slug.ends_with('-') && !slug.is_empty() {
            slug.push('-');
        }
    }
    slug.trim_matches('-').chars().take(48).collect()
}

fn parse_one_artifact_block(rest: &str) -> Option<(ParsedArtifact, usize)> {
    let (title, header_len) = if let Some(stripped) = rest.strip_prefix(':') {
        let line_end = stripped.find('\n').unwrap_or(stripped.len());
        (stripped[..line_end].trim().to_string(), line_end + 1)
    } else {
        let line_end = rest.find('\n').unwrap_or(0);
        let header = &rest[..line_end];
        let mut title = "Artefact".to_string();
        for line in header.lines() {
            let line = line.trim();
            if let Some(val) = line.strip_prefix("title:") {
                title = val.trim().to_string();
            }
        }
        (title, if line_end < rest.len() { line_end + 1 } else { line_end })
    };

    let mut body_start = header_len;
    if rest[header_len..].starts_with("---\n") {
        body_start += 4;
    }

    let body_region = &rest[body_start..];
    let close_rel = body_region.find("\n```").or_else(|| body_region.rfind("```"));
    let (body, consumed) = if let Some(close) = close_rel {
        (
            body_region[..close].trim().to_string(),
            body_start + close + 4,
        )
    } else {
        return None;
    };

    if body.is_empty() {
        return None;
    }

    Some((
        ParsedArtifact { title, body },
        consumed,
    ))
}

fn parse_artifact_blocks(content: &str) -> Vec<ParsedArtifact> {
    let mut artifacts = Vec::new();
    let mut search_from = 0;

    while let Some(start_rel) = content[search_from..].find("```artifact") {
        let rest = &content[search_from + start_rel + "```artifact".len()..];
        if let Some((artifact, consumed)) = parse_one_artifact_block(rest) {
            artifacts.push(artifact);
            search_from += start_rel + "```artifact".len() + consumed;
        } else {
            search_from += start_rel + "```artifact".len() + 1;
        }
    }

    artifacts
}

pub fn persist_artifacts_from_messages(
    thread_id: Option<&str>,
    pairs: &[(String, String)],
) -> Result<Vec<String>, String> {
    let dir = resolved_creatives_dir();
    std::fs::create_dir_all(&dir).map_err(|e| e.to_string())?;

    let mut saved = Vec::new();
    for (role, content) in pairs {
        if role != "assistant" {
            continue;
        }
        for artifact in parse_artifact_blocks(content) {
            let slug = slugify_title(&artifact.title);
            let slug = if slug.is_empty() { "artefact" } else { slug.as_str() };
            let stamp = Utc::now().format("%Y%m%d-%H%M%S");
            let id = Uuid::new_v4().to_string();
            let filename = format!("{stamp}-{slug}.md");
            let path: PathBuf = dir.join(&filename);

            let mut file_body = format!("# {}\n\n", artifact.title);
            file_body.push_str(&artifact.body);
            std::fs::write(&path, &file_body).map_err(|e| e.to_string())?;

            let meta = serde_json::json!({
                "id": id,
                "title": artifact.title,
                "filename": filename,
                "threadId": thread_id,
                "savedAt": Utc::now().to_rfc3339(),
            });
            let meta_path = dir.join(format!("{stamp}-{slug}.meta.json"));
            let _ = std::fs::write(
                meta_path,
                serde_json::to_string_pretty(&meta).unwrap_or_default(),
            );

            saved.push(path.to_string_lossy().into_owned());
        }
    }
    Ok(saved)
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn parses_artifact_block_with_frontmatter() {
        let content = r#"Voici le doc :

```artifact
title: Rapport Q1
type: markdown
---
# Rapport Q1

## Synthèse
OK
```

Merci."#;
        let parsed = parse_artifact_blocks(content);
        assert_eq!(parsed.len(), 1);
        assert_eq!(parsed[0].title, "Rapport Q1");
        assert!(parsed[0].body.contains("# Rapport Q1"));
    }
}
