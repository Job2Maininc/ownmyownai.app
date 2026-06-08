mod ingest;
mod rag;
mod store;
mod sync;
mod watcher;

pub use ingest::{
    file_mtime, ingest_document, ingest_from_path, is_supported_extension, reindex_document,
    reindex_uploaded_documents, IngestProgress,
};
pub use rag::build_rag_context;
pub use store::{
    clear_document_index, create_context_link, create_knowledge_base, delete_context_link,
    delete_document, delete_knowledge_base, export_knowledge_base, get_context_link,
    get_context_summary, get_document_record, import_knowledge_base, list_chunks,
    list_context_links, list_documents, list_knowledge_bases, set_context_link_enabled,
    update_context_link_sync, ContextLimits, ContextLink, DocumentInfo, ChunkPreview,
    KnowledgeBase,
};
pub use sync::{
    link_context_file, link_context_folder, scan_link, sync_all_links, sync_link,
    unlink_context_link, ScannedFile,
};
pub use watcher::start_context_watcher;

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
