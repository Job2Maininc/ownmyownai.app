mod ingest;
mod rag;
mod store;

pub use ingest::{ingest_document, IngestProgress};
pub use rag::build_rag_context;
pub use store::{
    create_knowledge_base, delete_document, delete_knowledge_base, export_knowledge_base,
    get_context_summary, import_knowledge_base, list_chunks, list_documents, list_knowledge_bases,
    ContextLimits, KnowledgeBase, DocumentInfo, ChunkPreview,
};

use std::path::PathBuf;

const APP_DIR: &str = "OwnMyOwnAI";

pub fn context_root_dir() -> PathBuf {
    dirs::data_local_dir()
        .unwrap_or_else(|| PathBuf::from("."))
        .join(APP_DIR)
        .join("context")
}

pub fn context_db_path() -> PathBuf {
    dirs::data_local_dir()
        .unwrap_or_else(|| PathBuf::from("."))
        .join(APP_DIR)
        .join("context.db")
}

pub fn init_context_db() -> Result<(), String> {
    store::init_db()
}
