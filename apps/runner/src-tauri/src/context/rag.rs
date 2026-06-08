use super::store::{get_embeddings_for_scope, get_image_embeddings_for_bases, search_chunks_fts_scoped};
use crate::ollama::create_embedding;
use crate::settings::resolved_rag_top_k;
use std::collections::HashSet;

const MIN_EMBEDDING_SCORE: f32 = 0.1;

#[derive(Debug, Clone, Default)]
pub struct RagScope {
    pub kb_ids: Vec<String>,
    pub file_hints: Vec<String>,
    pub folder_hints: Vec<String>,
}

pub async fn build_rag_context(kb_ids: &[String], query: &str) -> Result<Option<String>, String> {
    build_rag_context_scoped(
        &RagScope {
            kb_ids: kb_ids.to_vec(),
            ..Default::default()
        },
        query,
    )
    .await
}

pub async fn build_rag_context_scoped(
    scope: &RagScope,
    query: &str,
) -> Result<Option<String>, String> {
    if scope.kb_ids.is_empty() || query.trim().is_empty() {
        return Ok(None);
    }

    let top_k = resolved_rag_top_k();
    let fts_hits = search_chunks_fts_scoped(
        &scope.kb_ids,
        query,
        top_k,
        &scope.file_hints,
        &scope.folder_hints,
    )
    .unwrap_or_default();
    let pairs = get_embeddings_for_scope(
        &scope.kb_ids,
        &scope.file_hints,
        &scope.folder_hints,
    )?;

    if fts_hits.is_empty() && pairs.is_empty() {
        return Ok(None);
    }

    let mut seen = HashSet::new();
    let mut top: Vec<String> = Vec::new();

    for content in fts_hits {
        if seen.insert(content.clone()) {
            top.push(content);
        }
    }

    if !pairs.is_empty() {
        let query_vec = create_embedding(crate::ollama::EMBEDDING_MODEL, query).await?;

        let mut scored: Vec<(f32, String)> = pairs
            .into_iter()
            .map(|(content, vec)| (cosine_similarity(&query_vec, &vec), content))
            .collect();

        scored.sort_by(|a, b| b.0.partial_cmp(&a.0).unwrap_or(std::cmp::Ordering::Equal));

        for (score, content) in scored {
            if top.len() >= top_k {
                break;
            }
            if score > MIN_EMBEDDING_SCORE && seen.insert(content.clone()) {
                top.push(content);
            }
        }
    }

    if top.is_empty() {
        return Ok(None);
    }

    let context = top
        .iter()
        .enumerate()
        .map(|(i, c)| format!("[Extrait {}]\n{}", i + 1, c))
        .collect::<Vec<_>>()
        .join("\n\n");

    Ok(Some(format!(
        "Utilise les extraits suivants comme contexte pour répondre. Si l'information n'y figure pas, indique-le clairement.\n\n{context}"
    )))
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
    use super::cosine_similarity;

    #[test]
    fn cosine_similarity_identical_vectors() {
        let v = vec![1.0, 0.0, 0.0];
        assert!((cosine_similarity(&v, &v) - 1.0).abs() < f32::EPSILON);
    }
}
