mod codebase_index;
mod audit;
mod db_crypto;
mod ingest;
mod inline_edit;
mod mentions;
mod pdf_ocr;
mod instructions;
mod project_rules;
mod rag;
mod scheduled_sync;
pub mod store;
mod sync;
mod vision;
mod watcher;

pub use audit::{list_audit_log, log_audit, AuditAction, AuditEntry};
pub use ingest::{
    file_mtime, ingest_document, ingest_from_path, is_allowed_extension, is_supported_extension,
    reindex_document, reindex_uploaded_documents, IngestProgress,
};
pub use inline_edit::{apply_inline_edit, preview_inline_edit, InlineEditPreview};
pub use mentions::{
    extract_mentions_from_chat, parse_mention_scope_payload, parse_mentions, resolve_rag_kb_ids,
    strip_mentions, ParsedMentions,
};
pub use project_rules::load_project_rules;
pub use instructions::{collect_kb_system_instructions, prepend_kb_system_instructions};
pub use codebase_index::{build_codebase_context, is_code_file, is_git_repo};
pub use rag::{build_rag_context, build_rag_context_scoped, find_relevant_image_paths, RagScope};
pub use vision::{document_media_type, image_mime_type, is_image_filename};
pub use store::{
    clear_document_index, create_context_link, create_knowledge_base, delete_context_link,
    delete_document, delete_knowledge_base, export_knowledge_base, get_context_link,
    get_context_summary, get_document_record, import_knowledge_base, list_chunks,
    list_context_links, list_all_context_links, list_documents, list_knowledge_bases,
    search_chunks_fts, set_context_link_enabled, set_knowledge_base_system_instruction,
    update_context_link_extensions, update_context_link_sync, with_context_db, ContextLimits,
    ContextLink, DocumentInfo, ChunkPreview, KnowledgeBase,
};
pub use scheduled_sync::start_scheduled_sync;
pub use sync::{
    link_context_file, link_context_folder, link_context_repo, scan_link, sync_all_links,
    sync_link, sync_link_with_cancel, unlink_context_link, ScannedFile,
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

pub fn context_encrypted_db_path() -> PathBuf {
    dirs::data_local_dir()
        .unwrap_or_else(|| PathBuf::from("."))
        .join(APP_DIR)
        .join("context.db.enc")
}

pub fn init_context_db() -> Result<(), String> {
    store::init_db()
}
