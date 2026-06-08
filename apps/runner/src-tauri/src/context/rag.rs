use super::store::{
    get_embedding_hits_for_scope, get_image_embeddings_for_bases, search_rag_hits_scoped,
    RagChunkHit,
};
use crate::ollama::create_embedding;
use crate::settings::resolved_rag_top_k;
use serde_json::{json, Value};
use std::collections::{HashSet};

const MIN_EMBEDDING_SCORE: f32 = 0.1;
const EXCERPT_MAX_CHARS: usize = 220;

#[derive(Debug, Clone, Default)]
pub struct RagScope {
    pub kb_ids: Vec<String>,
    pub file_hints: Vec<String>,
    pub folder_hints: Vec<String>,
}

#[derive(Debug, Clone)]
pub struct RagBundle {
    pub context: String,
    pub citations: Vec<Value>,
}

pub async fn build_rag_context(kb_ids: &[String], query: &str) -> Result<Option<String>, String> {
    Ok(build_rag_bundle_scoped(
        &RagScope {
            kb_ids: kb_ids.to_vec(),
            ..Default::default()
        },
        query,
    )
    .await?
    .map(|b| b.context))
}

pub async fn build_rag_context_scoped(
    scope: &RagScope,
    query: &str,
) -> Result<Option<String>, String> {
    Ok(build_rag_bundle_scoped(scope, query)
        .await?
        .map(|b| b.context))
}

pub async fn build_rag_bundle_scoped(
    scope: &RagScope,
    query: &str,
) -> Result<Option<RagBundle>, String> {
    if scope.kb_ids.is_empty() || query.trim().is_empty() {
        return Ok(None);
    }

    let top_k = resolved_rag_top_k();
    let fts_hits = search_rag_hits_scoped(
        &scope.kb_ids,
        query,
        top_k,
        &scope.file_hints,
        &scope.folder_hints,
    )
    .unwrap_or_default();
    let embedding_pairs = get_embedding_hits_for_scope(
        &scope.kb_ids,
        &scope.file_hints,
        &scope.folder_hints,
    )?;

    if fts_hits.is_empty() && embedding_pairs.is_empty() {
        return Ok(None);
    }

    let mut seen_chunks = HashSet::new();
    let mut merged: Vec<RagChunkHit> = Vec::new();

    for hit in fts_hits {
        if seen_chunks.insert(hit.chunk_id.clone()) {
            merged.push(hit);
        }
    }

    if !embedding_pairs.is_empty() {
        let query_vec = create_embedding(crate::ollama::EMBEDDING_MODEL, query).await?;
        let mut scored: Vec<(f32, RagChunkHit)> = embedding_pairs
            .into_iter()
            .map(|(mut hit, vec)| {
                hit.score = cosine_similarity(&query_vec, &vec);
                (hit.score, hit)
            })
            .collect();
        scored.sort_by(|a, b| b.0.partial_cmp(&a.0).unwrap_or(std::cmp::Ordering::Equal));

        for (score, mut hit) in scored {
            if merged.len() >= top_k {
                break;
            }
            if score > MIN_EMBEDDING_SCORE && seen_chunks.insert(hit.chunk_id.clone()) {
                hit.score = score;
                merged.push(hit);
            }
        }
    }

    if merged.is_empty() {
        return Ok(None);
    }

    merged.truncate(top_k);

    let mut citations = Vec::new();
    let mut context_parts = Vec::new();
    for (i, hit) in merged.iter().enumerate() {
        let index = (i + 1) as u32;
        let excerpt = excerpt_text(&hit.content);
        context_parts.push(format!("[Extrait {index}]\n{}", hit.content));
        citations.push(json!({
            "index": index,
            "source": hit.source,
            "sourceFull": hit.source_full,
            "excerpt": excerpt,
            "score": hit.score,
            "chunkId": hit.chunk_id,
            "documentId": hit.document_id,
        }));
    }

    let context = context_parts.join("\n\n");
    Ok(Some(RagBundle {
        context: format!(
            "Utilise les extraits suivants comme contexte pour répondre. Cite les sources [n] quand tu t'appuies sur un extrait. Si l'information n'y figure pas, indique-le clairement.\n\n{context}"
        ),
        citations,
    }))
}

fn excerpt_text(content: &str) -> String {
    let trimmed = content.trim();
    if trimmed.chars().count() <= EXCERPT_MAX_CHARS {
        return trimmed.to_string();
    }
    let excerpt: String = trimmed.chars().take(EXCERPT_MAX_CHARS).collect();
    format!("{excerpt}…")
}

/// Chemins absolus des images les plus pertinentes pour une question vision.
pub async fn find_relevant_image_paths(
    kb_ids: &[String],
    query: &str,
    max_images: usize,
) -> Result<Vec<String>, String> {
    if kb_ids.is_empty() || query.trim().is_empty() || max_images == 0 {
        return Ok(vec![]);
    }

    let pairs = get_image_embeddings_for_bases(kb_ids)?;
    if pairs.is_empty() {
        return Ok(vec![]);
    }

    let query_vec = create_embedding(crate::ollama::EMBEDDING_MODEL, query).await?;
    let mut scored: Vec<(f32, String)> = pairs
        .into_iter()
        .map(|(vec, path)| (cosine_similarity(&query_vec, &vec), path))
        .collect();
    scored.sort_by(|a, b| b.0.partial_cmp(&a.0).unwrap_or(std::cmp::Ordering::Equal));

    let mut paths = Vec::new();
    let mut seen = HashSet::new();
    for (score, path) in scored {
        if paths.len() >= max_images {
            break;
        }
        if score > MIN_EMBEDDING_SCORE && seen.insert(path.clone()) {
            paths.push(path);
        }
    }
    Ok(paths)
}

fn cosine_similarity(a: &[f32], b: &[f32]) -> f32 {
    if a.len() != b.len() || a.is_empty() {
        return 0.0;
    }
    let dot: f32 = a.iter().zip(b.iter()).map(|(x, y)| x * y).sum();
    let norm_a: f32 = a.iter().map(|x| x * x).sum::<f32>().sqrt();
    let norm_b: f32 = b.iter().map(|x| x * x).sum::<f32>().sqrt();
    if norm_a == 0.0 || norm_b == 0.0 {
        return 0.0;
    }
    dot / (norm_a * norm_b)
}

#[cfg(test)]
mod tests {
    use super::{cosine_similarity, excerpt_text};

    #[test]
    fn cosine_similarity_identical_vectors() {
        let v = vec![1.0, 0.0, 0.0];
        assert!((cosine_similarity(&v, &v) - 1.0).abs() < f32::EPSILON);
    }

    #[test]
    fn excerpt_truncates_long_text() {
        let long = "a".repeat(300);
        assert!(excerpt_text(&long).ends_with('…'));
    }
}
