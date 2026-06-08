use super::store::get_embeddings_for_bases;
use crate::ollama::create_embedding;

const TOP_K: usize = 5;

pub async fn build_rag_context(kb_ids: &[String], query: &str) -> Result<Option<String>, String> {
    if kb_ids.is_empty() || query.trim().is_empty() {
        return Ok(None);
    }

    let pairs = get_embeddings_for_bases(kb_ids)?;
    if pairs.is_empty() {
        return Ok(None);
    }

    let query_vec = create_embedding(crate::ollama::EMBEDDING_MODEL, query).await?;

    let mut scored: Vec<(f32, String)> = pairs
        .into_iter()
        .map(|(content, vec)| (cosine_similarity(&query_vec, &vec), content))
        .collect();

    scored.sort_by(|a, b| b.0.partial_cmp(&a.0).unwrap_or(std::cmp::Ordering::Equal));

    let top: Vec<String> = scored
        .into_iter()
        .take(TOP_K)
        .filter(|(score, _)| *score > 0.1)
        .map(|(_, c)| c)
        .collect();

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
