use crate::settings::resolved_creatives_dir;
use base64::Engine;
use chrono::Utc;
use serde::{Deserialize, Serialize};
use std::path::{Path, PathBuf};
use uuid::Uuid;

const BINARY_EXTENSIONS: &[&str] = &["png", "mp3", "wav", "mp4"];

#[derive(Debug, Clone, Copy, PartialEq, Eq)]
enum ArtifactMediaType {
    Markdown,
    Image,
    Audio,
}

#[derive(Debug)]
struct ParsedArtifact {
    title: String,
    media_type: ArtifactMediaType,
    extension: String,
    body: String,
}

#[derive(Debug, Clone)]
pub struct PersistedCreative {
    pub id: String,
    pub filepath: String,
    pub filename: String,
    pub meta_path: String,
    pub bytes: usize,
}

#[derive(Debug, Clone)]
pub struct PersistMediaInput<'a> {
    pub title: Option<&'a str>,
    pub prompt: Option<&'a str>,
    pub kind: &'a str,
    pub extension: &'a str,
    pub mime_type: &'a str,
    pub bytes: Vec<u8>,
    pub thread_id: Option<&'a str>,
    pub job_id: Option<&'a str>,
}

fn slugify_title(title: &str) -> String {
    let mut slug = String::new();
    for ch in title.chars() {
        if ch.is_ascii_alphanumeric() {
            slug.push(ch.to_ascii_lowercase());
        } else if (ch.is_whitespace() || ch == '-' || ch == '_') && !slug.ends_with('-') && !slug.is_empty()
        {
            slug.push('-');
        }
    }
    slug.trim_matches('-').chars().take(48).collect()
}

fn normalize_extension(ext: &str) -> Option<String> {
    let lower = ext.trim().trim_start_matches('.').to_ascii_lowercase();
    if BINARY_EXTENSIONS.contains(&lower.as_str()) {
        Some(lower)
    } else {
        None
    }
}

fn mime_for_extension(ext: &str) -> &'static str {
    match ext {
        "png" => "image/png",
        "mp3" => "audio/mpeg",
        "wav" => "audio/wav",
        "mp4" => "video/mp4",
        _ => "application/octet-stream",
    }
}

fn parse_media_type(type_value: &str, format_value: Option<&str>) -> Option<(ArtifactMediaType, String)> {
    let type_lower = type_value.trim().to_ascii_lowercase();
    match type_lower.as_str() {
        "markdown" | "table" => Some((ArtifactMediaType::Markdown, "md".into())),
        "image" | "png" => {
            let ext = format_value
                .and_then(normalize_extension)
                .unwrap_or_else(|| "png".into());
            if ext == "png" {
                Some((ArtifactMediaType::Image, ext))
            } else {
                None
            }
        }
        "audio" | "voice" | "music" | "mp3" | "wav" => {
            let ext = format_value
                .and_then(normalize_extension)
                .unwrap_or_else(|| "mp3".into());
            if ext == "mp3" || ext == "wav" {
                Some((ArtifactMediaType::Audio, ext))
            } else {
                None
            }
        }
        _ => None,
    }
}

fn decode_binary_body(body: &str) -> Option<Vec<u8>> {
    let trimmed = body.trim();
    let payload = trimmed
        .strip_prefix("data:")
        .and_then(|rest| rest.split_once(',').map(|(_, data)| data))
        .unwrap_or(trimmed);
    base64::engine::general_purpose::STANDARD
        .decode(payload.trim())
        .ok()
}

fn write_meta(
    meta_path: &Path,
    meta: &serde_json::Value,
) -> Result<(), String> {
    std::fs::write(
        meta_path,
        serde_json::to_string_pretty(meta).unwrap_or_default(),
    )
    .map_err(|e| e.to_string())
}

pub fn persist_media_file(input: PersistMediaInput<'_>) -> Result<PersistedCreative, String> {
    let extension = normalize_extension(input.extension)
        .ok_or_else(|| format!("Extension média non supportée : {}", input.extension))?;
    let mime_type = if input.mime_type.is_empty() {
        mime_for_extension(&extension).to_string()
    } else {
        input.mime_type.to_string()
    };

    let slug_source = input
        .title
        .or(input.prompt)
        .unwrap_or("media");
    let slug = slugify_title(slug_source);
    let slug = if slug.is_empty() { "media" } else { slug.as_str() };

    persist_binary_file(
        PersistBinaryParams {
            slug,
            extension: &extension,
            mime_type: &mime_type,
            bytes: &input.bytes,
            title: input.title,
            kind: input.kind,
            prompt: input.prompt,
            thread_id: input.thread_id,
            job_id: input.job_id,
        },
    )
}

struct PersistBinaryParams<'a> {
    slug: &'a str,
    extension: &'a str,
    mime_type: &'a str,
    bytes: &'a [u8],
    title: Option<&'a str>,
    kind: &'a str,
    prompt: Option<&'a str>,
    thread_id: Option<&'a str>,
    job_id: Option<&'a str>,
}

fn persist_binary_file(params: PersistBinaryParams<'_>) -> Result<PersistedCreative, String> {
    let dir = resolved_creatives_dir();
    std::fs::create_dir_all(&dir).map_err(|e| e.to_string())?;

    let stamp = Utc::now().format("%Y%m%d-%H%M%S");
    let filename = format!("{stamp}-{}.{}", params.slug, params.extension);
    let path: PathBuf = dir.join(&filename);
    std::fs::write(&path, params.bytes).map_err(|e| e.to_string())?;

    let id = Uuid::new_v4().to_string();
    let meta_path = dir.join(format!("{stamp}-{}.meta.json", params.slug));
    let title = params
        .title
        .or(params.prompt)
        .unwrap_or("Création média");
    let meta = serde_json::json!({
        "id": id,
        "title": title,
        "kind": params.kind,
        "filename": filename,
        "mimeType": params.mime_type,
        "bytes": params.bytes.len(),
        "threadId": params.thread_id,
        "jobId": params.job_id,
        "prompt": params.prompt,
        "savedAt": Utc::now().to_rfc3339(),
    });
    write_meta(&meta_path, &meta)?;

    Ok(PersistedCreative {
        id,
        filepath: path.to_string_lossy().into_owned(),
        filename,
        meta_path: meta_path.to_string_lossy().into_owned(),
        bytes: params.bytes.len(),
    })
}

fn persist_markdown_artifact(
    artifact: &ParsedArtifact,
    thread_id: Option<&str>,
) -> Result<PersistedCreative, String> {
    let dir = resolved_creatives_dir();
    std::fs::create_dir_all(&dir).map_err(|e| e.to_string())?;

    let slug = slugify_title(&artifact.title);
    let slug = if slug.is_empty() { "artefact" } else { slug.as_str() };
    let stamp = Utc::now().format("%Y%m%d-%H%M%S");
    let filename = format!("{stamp}-{slug}.md");
    let path: PathBuf = dir.join(&filename);

    let mut file_body = format!("# {}\n\n", artifact.title);
    file_body.push_str(&artifact.body);
    let bytes = file_body.as_bytes();
    std::fs::write(&path, bytes).map_err(|e| e.to_string())?;

    let id = Uuid::new_v4().to_string();
    let meta_path = dir.join(format!("{stamp}-{slug}.meta.json"));
    let meta = serde_json::json!({
        "id": id,
        "title": artifact.title,
        "kind": "markdown",
        "filename": filename,
        "mimeType": "text/markdown",
        "bytes": bytes.len(),
        "threadId": thread_id,
        "savedAt": Utc::now().to_rfc3339(),
    });
    write_meta(&meta_path, &meta)?;

    Ok(PersistedCreative {
        id,
        filepath: path.to_string_lossy().into_owned(),
        filename,
        meta_path: meta_path.to_string_lossy().into_owned(),
        bytes: bytes.len(),
    })
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

    let (header, content) = if let Some(sep) = body.find("\n---\n") {
        (&body[..sep], body[sep + 5..].trim().to_string())
    } else {
        ("", body.clone())
    };

    let mut artifact_type: Option<&str> = None;
    let mut format_value: Option<&str> = None;
    for line in header.lines() {
        let line = line.trim();
        if let Some(val) = line.strip_prefix("title:") {
            // title already parsed from header when using variant A
            let _ = val;
        } else if let Some(val) = line.strip_prefix("type:") {
            artifact_type = Some(val.trim());
        } else if let Some(val) = line.strip_prefix("format:") {
            format_value = Some(val.trim());
        }
    }

    let (media_type, extension, body) = if let Some(type_value) = artifact_type {
        let (media_type, extension) = parse_media_type(type_value, format_value)?;
        let body = if media_type == ArtifactMediaType::Markdown {
            if content.is_empty() { body } else { content }
        } else {
            content
        };
        (media_type, extension, body)
    } else {
        (
            ArtifactMediaType::Markdown,
            "md".into(),
            if content.is_empty() { body } else { content },
        )
    };

    Some((
        ParsedArtifact {
            title,
            media_type,
            extension,
            body,
        },
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

fn persist_parsed_artifact(
    artifact: &ParsedArtifact,
    thread_id: Option<&str>,
) -> Result<PersistedCreative, String> {
    match artifact.media_type {
        ArtifactMediaType::Markdown => persist_markdown_artifact(artifact, thread_id),
        ArtifactMediaType::Image | ArtifactMediaType::Audio => {
            let bytes = decode_binary_body(&artifact.body)
                .ok_or_else(|| "Corps binaire artefact invalide (base64 attendu)".to_string())?;
            let kind = match artifact.media_type {
                ArtifactMediaType::Image => "image",
                ArtifactMediaType::Audio => "audio",
                ArtifactMediaType::Markdown => "markdown",
            };
            persist_media_file(PersistMediaInput {
                title: Some(&artifact.title),
                prompt: None,
                kind,
                extension: &artifact.extension,
                mime_type: mime_for_extension(&artifact.extension),
                bytes,
                thread_id,
                job_id: None,
            })
        }
    }
}

pub fn persist_artifacts_from_messages(
    thread_id: Option<&str>,
    pairs: &[(String, String)],
) -> Result<Vec<String>, String> {
    let mut saved = Vec::new();
    for (role, content) in pairs {
        if role != "assistant" {
            continue;
        }
        for artifact in parse_artifact_blocks(content) {
            let persisted = persist_parsed_artifact(&artifact, thread_id)?;
            saved.push(persisted.filepath);
        }
    }
    Ok(saved)
}

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq, Eq)]
#[serde(rename_all = "lowercase")]
pub enum CreativeKind {
    Markdown,
    Image,
    Audio,
    Video,
    Other,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
struct CreativeMeta {
    id: String,
    title: String,
    filename: String,
    #[serde(default)]
    kind: Option<String>,
    #[serde(default)]
    mime_type: Option<String>,
    #[serde(default)]
    thread_id: Option<String>,
    saved_at: String,
}

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct CreativeSummary {
    pub id: String,
    pub title: String,
    pub kind: CreativeKind,
    pub filename: String,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub mime_type: Option<String>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub bytes: Option<u64>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub thread_id: Option<String>,
    pub saved_at: String,
}

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct CreativeReadResult {
    pub id: String,
    pub filename: String,
    pub mime_type: String,
    pub data_base64: String,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub text_content: Option<String>,
}

fn infer_creative_kind(filename: &str, meta_kind: Option<&str>) -> CreativeKind {
    if let Some(kind) = meta_kind {
        match kind.to_ascii_lowercase().as_str() {
            "markdown" | "table" | "document" => return CreativeKind::Markdown,
            "image" => return CreativeKind::Image,
            "voice" | "music" | "audio" => return CreativeKind::Audio,
            "video" => return CreativeKind::Video,
            _ => {}
        }
    }

    let lower = filename.to_ascii_lowercase();
    if lower.ends_with(".md") {
        CreativeKind::Markdown
    } else if lower.ends_with(".png")
        || lower.ends_with(".jpg")
        || lower.ends_with(".jpeg")
        || lower.ends_with(".webp")
        || lower.ends_with(".gif")
    {
        CreativeKind::Image
    } else if lower.ends_with(".mp3")
        || lower.ends_with(".wav")
        || lower.ends_with(".ogg")
        || lower.ends_with(".m4a")
    {
        CreativeKind::Audio
    } else if lower.ends_with(".mp4")
        || lower.ends_with(".webm")
        || lower.ends_with(".mov")
    {
        CreativeKind::Video
    } else {
        CreativeKind::Other
    }
}

fn infer_creative_mime(filename: &str) -> String {
    let lower = filename.to_ascii_lowercase();
    if lower.ends_with(".md") {
        return "text/markdown; charset=utf-8".to_string();
    }
    let ext = Path::new(filename)
        .extension()
        .and_then(|e| e.to_str())
        .unwrap_or("");
    mime_for_extension(ext).to_string()
}

fn title_from_filename(filename: &str) -> String {
    Path::new(filename)
        .file_stem()
        .and_then(|s| s.to_str())
        .unwrap_or(filename)
        .replace('-', " ")
}

fn file_saved_at(path: &Path) -> String {
    std::fs::metadata(path)
        .ok()
        .and_then(|meta| meta.modified().ok())
        .map(|time| {
            chrono::DateTime::<Utc>::from(time)
                .format("%Y-%m-%dT%H:%M:%SZ")
                .to_string()
        })
        .unwrap_or_else(|| Utc::now().to_rfc3339())
}

fn load_meta_map(dir: &Path) -> std::collections::HashMap<String, CreativeMeta> {
    let mut by_filename = std::collections::HashMap::new();
    let entries = match std::fs::read_dir(dir) {
        Ok(entries) => entries,
        Err(_) => return by_filename,
    };

    for entry in entries.flatten() {
        let path = entry.path();
        let name = path.file_name().and_then(|n| n.to_str()).unwrap_or("");
        if !name.ends_with(".meta.json") {
            continue;
        }
        let raw = match std::fs::read_to_string(&path) {
            Ok(raw) => raw,
            Err(_) => continue,
        };
        if let Ok(meta) = serde_json::from_str::<CreativeMeta>(&raw) {
            by_filename.insert(meta.filename.clone(), meta);
        }
    }

    by_filename
}

pub fn list_creatives() -> Result<Vec<CreativeSummary>, String> {
    let dir = resolved_creatives_dir();
    if !dir.exists() {
        return Ok(Vec::new());
    }

    let meta_by_filename = load_meta_map(&dir);
    let mut creatives = Vec::new();
    let entries = std::fs::read_dir(&dir).map_err(|e| e.to_string())?;

    for entry in entries {
        let entry = entry.map_err(|e| e.to_string())?;
        let path = entry.path();
        if !path.is_file() {
            continue;
        }
        let filename = match path.file_name().and_then(|n| n.to_str()) {
            Some(name) => name.to_string(),
            None => continue,
        };
        if filename.ends_with(".meta.json") {
            continue;
        }

        let bytes = std::fs::metadata(&path).ok().map(|m| m.len());
        if let Some(meta) = meta_by_filename.get(&filename) {
            creatives.push(CreativeSummary {
                id: meta.id.clone(),
                title: meta.title.clone(),
                kind: infer_creative_kind(&filename, meta.kind.as_deref()),
                filename: filename.clone(),
                mime_type: meta
                    .mime_type
                    .clone()
                    .or_else(|| Some(infer_creative_mime(&filename))),
                bytes,
                thread_id: meta.thread_id.clone(),
                saved_at: meta.saved_at.clone(),
            });
        } else {
            creatives.push(CreativeSummary {
                id: filename.clone(),
                title: title_from_filename(&filename),
                kind: infer_creative_kind(&filename, None),
                filename,
                mime_type: Some(infer_creative_mime(
                    path.file_name().and_then(|n| n.to_str()).unwrap_or(""),
                )),
                bytes,
                thread_id: None,
                saved_at: file_saved_at(&path),
            });
        }
    }

    creatives.sort_by(|a, b| b.saved_at.cmp(&a.saved_at));
    Ok(creatives)
}

fn find_creative_path(id: &str) -> Result<(PathBuf, CreativeSummary), String> {
    let creatives = list_creatives()?;
    let summary = creatives
        .into_iter()
        .find(|c| c.id == id)
        .ok_or_else(|| "Création introuvable.".to_string())?;
    let path = resolved_creatives_dir().join(&summary.filename);
    if !path.is_file() {
        return Err("Fichier de création introuvable.".to_string());
    }
    Ok((path, summary))
}

pub fn read_creative(id: &str) -> Result<CreativeReadResult, String> {
    let (path, summary) = find_creative_path(id)?;
    let bytes = std::fs::read(&path).map_err(|e| e.to_string())?;
    let mime_type = summary
        .mime_type
        .clone()
        .unwrap_or_else(|| infer_creative_mime(&summary.filename));
    let data_base64 = base64::engine::general_purpose::STANDARD.encode(&bytes);
    let text_content = if summary.kind == CreativeKind::Markdown {
        std::fs::read_to_string(&path).ok()
    } else {
        None
    };

    Ok(CreativeReadResult {
        id: summary.id,
        filename: summary.filename,
        mime_type,
        data_base64,
        text_content,
    })
}

pub fn delete_creative(id: &str) -> Result<(), String> {
    let (path, summary) = find_creative_path(id)?;
    std::fs::remove_file(&path).map_err(|e| e.to_string())?;

    let stem = Path::new(&summary.filename)
        .file_stem()
        .and_then(|s| s.to_str())
        .unwrap_or("");
    let meta_path = resolved_creatives_dir().join(format!("{stem}.meta.json"));
    if meta_path.is_file() {
        let _ = std::fs::remove_file(meta_path);
    }

    Ok(())
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
        assert_eq!(parsed[0].media_type, ArtifactMediaType::Markdown);
        assert!(parsed[0].body.contains("# Rapport Q1"));
    }

    #[test]
    fn parses_png_artifact_block() {
        let b64 = base64::engine::general_purpose::STANDARD.encode([137, 80, 78, 71]);
        let content = format!(
            r#"```artifact
title: Logo généré
type: image
format: png
---
{b64}
```"#
        );
        let parsed = parse_artifact_blocks(&content);
        assert_eq!(parsed.len(), 1);
        assert_eq!(parsed[0].media_type, ArtifactMediaType::Image);
        assert_eq!(parsed[0].extension, "png");
    }

    #[test]
    fn parses_mp3_artifact_block() {
        let b64 = base64::engine::general_purpose::STANDARD.encode([0xFF, 0xFB]);
        let content = format!(
            r#"```artifact
title: Jingle
type: audio
format: mp3
---
{b64}
```"#
        );
        let parsed = parse_artifact_blocks(&content);
        assert_eq!(parsed.len(), 1);
        assert_eq!(parsed[0].media_type, ArtifactMediaType::Audio);
        assert_eq!(parsed[0].extension, "mp3");
    }

    #[test]
    fn rejects_unsupported_extension() {
        let err = persist_media_file(PersistMediaInput {
            title: Some("test"),
            prompt: None,
            kind: "image",
            extension: "gif",
            mime_type: "image/gif",
            bytes: vec![1, 2, 3],
            thread_id: None,
            job_id: None,
        })
        .unwrap_err();
        assert!(err.contains("non supportée"));
    }
}
