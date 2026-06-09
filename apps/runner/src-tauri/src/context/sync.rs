use super::ingest::{file_mtime, ingest_from_path, is_allowed_extension, reindex_document};
use super::store::{
    get_context_link, list_all_context_links, list_documents_for_link, remove_stale_linked_documents,
    update_context_link_sync, ContextLimits, ContextLink,
};
use crate::settings::{resolved_context_limits, resolved_sync_scan_settings, SyncScanSettings};
use std::collections::HashSet;
use std::fs;
use std::path::{Path, PathBuf};
use std::sync::atomic::{AtomicBool, Ordering};
use std::sync::{Arc, LazyLock, Mutex};

static SYNC_IN_PROGRESS: AtomicBool = AtomicBool::new(false);
static SYNC_QUEUE: LazyLock<Mutex<HashSet<String>>> =
    LazyLock::new(|| Mutex::new(HashSet::new()));

#[derive(Debug, Clone)]
pub struct ScannedFile {
    pub path: PathBuf,
    pub relative_path: String,
    pub mtime: i64,
    pub size: u64,
}

const EXCLUDED_DIR_NAMES: &[&str] = &[
    "$recycle.bin",
    "windows",
    "program files",
    "program files (x86)",
    "node_modules",
    ".git",
    "appdata",
    "system volume information",
];

pub fn scan_link(link: &ContextLink, scan: &SyncScanSettings, limits: &ContextLimits) -> Result<Vec<ScannedFile>, String> {
    let root = PathBuf::from(&link.path);
    if !root.exists() {
        return Err(format!("Chemin introuvable : {}", link.path));
    }

    let mut files = Vec::new();
    let mut count = 0u32;

    match link.link_type.as_str() {
        "file" => {
            if root.is_file() && is_allowed_extension(&root, &link.allowed_extensions) {
                let mtime = file_mtime(&root)?;
                let size = fs::metadata(&root).map_err(|e| e.to_string())?.len();
                files.push(ScannedFile {
                    path: root.clone(),
                    relative_path: root
                        .file_name()
                        .and_then(|n| n.to_str())
                        .unwrap_or("file")
                        .to_string(),
                    mtime,
                    size,
                });
            }
        }
        "folder" | "drive" | "repo" => {
            scan_directory(
                &root,
                &root,
                &link.link_type,
                &link.allowed_extensions,
                link.recursive,
                0,
                scan,
                limits,
                &mut files,
                &mut count,
            )?;
        }
        _ => return Err(format!("Type de lien inconnu : {}", link.link_type)),
    }

    Ok(files)
}

fn is_scannable_file(path: &Path, link_type: &str, allowed: &[String]) -> bool {
    if allowed.iter().any(|a| a == "*") {
        return should_scan_untyped_file(path);
    }
    if link_type == "repo" {
        super::codebase_index::is_code_file(path) || is_allowed_extension(path, allowed)
    } else {
        is_allowed_extension(path, allowed)
    }
}

fn should_scan_untyped_file(path: &Path) -> bool {
    if !path.is_file() {
        return false;
    }
    let name = path
        .file_name()
        .and_then(|n| n.to_str())
        .unwrap_or("")
        .to_lowercase();
    const SKIP_EXTENSIONS: &[&str] = &[
        "exe", "dll", "msi", "iso", "img", "bin", "dat", "pak", "db", "sqlite", "zip", "rar",
        "7z", "gz", "tar", "bz2", "woff", "woff2", "ttf", "otf", "eot", "mp3", "mp4", "avi",
        "mov", "mkv", "wav", "flac", "webm",
    ];
    if let Some(ext) = name.rsplit('.').next() {
        if SKIP_EXTENSIONS.contains(&ext) {
            return false;
        }
    }
    true
}

fn scan_directory(
    root: &Path,
    current: &Path,
    link_type: &str,
    allowed: &[String],
    recursive: bool,
    depth: u32,
    scan: &SyncScanSettings,
    limits: &ContextLimits,
    out: &mut Vec<ScannedFile>,
    count: &mut u32,
) -> Result<(), String> {
    if depth > scan.max_scan_depth {
        return Ok(());
    }
    if *count >= scan.max_scan_files {
        return Ok(());
    }

    let entries = fs::read_dir(current).map_err(|e| e.to_string())?;
    for entry in entries {
        if *count >= scan.max_scan_files {
            break;
        }
        let entry = entry.map_err(|e| e.to_string())?;
        let path = entry.path();
        let name = entry.file_name().to_string_lossy().to_lowercase();

        if path.is_dir() {
            if is_excluded_dir(&name) {
                continue;
            }
            if recursive {
                scan_directory(root, &path, link_type, allowed, recursive, depth + 1, scan, limits, out, count)?;
            }
            continue;
        }

        if !is_scannable_file(&path, link_type, allowed) {
            continue;
        }

        let meta = fs::metadata(&path).map_err(|e| e.to_string())?;
        let max_bytes = limits.max_file_mb as u64 * 1024 * 1024;
        if meta.len() > max_bytes {
            continue;
        }

        let relative = path
            .strip_prefix(root)
            .unwrap_or(&path)
            .to_string_lossy()
            .replace('\\', "/");

        out.push(ScannedFile {
            path: path.clone(),
            relative_path: relative,
            mtime: file_mtime(&path)?,
            size: meta.len(),
        });
        *count += 1;
    }
    Ok(())
}

fn is_excluded_dir(name: &str) -> bool {
    EXCLUDED_DIR_NAMES.contains(&name)
}

pub async fn sync_link_with_cancel<F>(
    link_id: &str,
    cancel: Option<Arc<AtomicBool>>,
    mut on_progress: F,
) -> Result<(), String>
where
    F: FnMut(u8, &str) + Send,
{
    if cancel
        .as_ref()
        .map(|c| c.load(Ordering::SeqCst))
        .unwrap_or(false)
    {
        return Err("Annulé".into());
    }
    on_progress(10, "Indexation en cours…");
    sync_link(link_id).await
}

pub async fn sync_link(link_id: &str) -> Result<(), String> {
    {
        let mut queue = SYNC_QUEUE.lock().map_err(|e| e.to_string())?;
        if !queue.insert(link_id.to_string()) {
            return Ok(());
        }
    }

    let result = sync_link_inner(link_id).await;

    if let Ok(mut queue) = SYNC_QUEUE.lock() {
        queue.remove(link_id);
    }

    result
}

async fn sync_link_inner(link_id: &str) -> Result<(), String> {
    let link = get_context_link(link_id)?;
    if !link.enabled {
        return Ok(());
    }

    update_context_link_sync(link_id, "syncing", None)?;
    let limits = resolved_context_limits();
    let scan = resolved_sync_scan_settings();

    let outcome = async {
        let scanned = scan_link(&link, &scan, &limits)?;
        let keep_paths: Vec<String> = scanned.iter().map(|f| f.relative_path.clone()).collect();
        let _ = remove_stale_linked_documents(link_id, &keep_paths)?;

        let existing: std::collections::HashMap<String, (String, Option<i64>, Option<u64>)> =
            list_documents_for_link(link_id)?
                .into_iter()
                .filter_map(|d| {
                    d.relative_path
                        .map(|rel| (rel, (d.id, d.source_mtime, d.source_size)))
                })
                .collect();

        for file in scanned {
            let needs_index = match existing.get(&file.relative_path) {
                Some((_, mtime, size)) => {
                    mtime.map(|m| m != file.mtime).unwrap_or(true)
                        || size.map(|s| s != file.size).unwrap_or(true)
                }
                None => true,
            };

            if !needs_index {
                continue;
            }

            if let Some((doc_id, _, _)) = existing.get(&file.relative_path) {
                if reindex_document(doc_id).await.is_err() {
                    let _ = ingest_from_path(
                        &link.knowledge_base_id,
                        &file.path,
                        Some(link_id),
                        Some(&file.relative_path),
                        &limits,
                    )
                    .await;
                }
            } else {
                ingest_from_path(
                    &link.knowledge_base_id,
                    &file.path,
                    Some(link_id),
                    Some(&file.relative_path),
                    &limits,
                )
                .await?;
            }
        }
        Ok::<(), String>(())
    }
    .await;

    match outcome {
        Ok(()) => {
            update_context_link_sync(link_id, "ready", None)?;
            Ok(())
        }
        Err(e) => {
            update_context_link_sync(link_id, "error", Some(&e))?;
            Err(e)
        }
    }
}

pub async fn sync_all_links() {
    if SYNC_IN_PROGRESS.swap(true, Ordering::SeqCst) {
        return;
    }

    let links = list_all_context_links().unwrap_or_default();
    let mut errors = 0u32;
    for link in links {
        if link.enabled {
            if sync_link(&link.id).await.is_err() {
                errors += 1;
            }
        }
    }

    SYNC_IN_PROGRESS.store(false, Ordering::SeqCst);

    let message = if errors == 0 {
        "Toutes les sources liées sont à jour.".to_string()
    } else {
        format!("Synchronisation terminée avec {errors} erreur(s).")
    };
    crate::notifications::notify_task_done(
        crate::notifications::TaskDoneKind::SyncAll,
        &message,
    );
}

pub async fn link_context_file(kb_id: &str, paths: Vec<String>) -> Result<Vec<ContextLink>, String> {
    let mut created = Vec::new();
    for path in paths {
        let link = super::store::create_context_link(kb_id, "file", &path, false, None)?;
        let _ = sync_link(&link.id).await;
        created.push(get_context_link(&link.id)?);
    }
    Ok(created)
}

pub async fn link_context_folder(
    kb_id: &str,
    path: String,
    recursive: bool,
    link_type: &str,
) -> Result<ContextLink, String> {
    if !PathBuf::from(&path).exists() {
        return Err(format!("Chemin introuvable : {path}"));
    }
    let extensions = if link_type == "drive" {
        Some(vec!["*".to_string()])
    } else {
        None
    };
    let link = super::store::create_context_link(kb_id, link_type, &path, recursive, extensions)?;
    sync_link(&link.id).await?;
    get_context_link(&link.id)
}

pub async fn link_context_repo(kb_id: &str, path: String) -> Result<ContextLink, String> {
    let root = PathBuf::from(&path);
    if !root.exists() {
        return Err(format!("Chemin introuvable : {path}"));
    }
    if !super::codebase_index::is_git_repo(&root) {
        return Err(
            "Ce dossier n'est pas un dépôt Git (.git introuvable). Choisissez la racine du repo."
                .into(),
        );
    }
    link_context_folder(kb_id, path, true, "repo").await
}

pub fn unlink_context_link(link_id: &str) -> Result<(), String> {
    super::store::delete_context_link(link_id)
}

#[cfg(test)]
mod tests {
    use super::*;
    use std::fs;

    #[test]
    fn excludes_system_directories() {
        assert!(is_excluded_dir("windows"));
        assert!(is_excluded_dir("node_modules"));
        assert!(!is_excluded_dir("mon-projet"));
    }

    #[test]
    fn scan_folder_finds_supported_files() {
        let base = std::env::temp_dir().join(format!("omoa-sync-test-{}", uuid::Uuid::new_v4()));
        fs::create_dir_all(&base).unwrap();
        let sub = base.join("notes");
        fs::create_dir_all(&sub).unwrap();
        let file = sub.join("readme.md");
        fs::write(&file, "# Hello sync test").unwrap();

        let link = ContextLink {
            id: "test".into(),
            knowledge_base_id: "kb".into(),
            link_type: "folder".into(),
            path: base.to_string_lossy().into_owned(),
            recursive: true,
            enabled: true,
            last_sync_at: None,
            last_sync_status: "pending".into(),
            last_sync_error: None,
            doc_count: 0,
            symbol_count: 0,
            allowed_extensions: vec!["txt".into(), "md".into(), "pdf".into(), "docx".into()],
        };
        let scan = SyncScanSettings {
            max_scan_files: 50,
            max_scan_depth: 4,
            sync_debounce_ms: 1000,
        };
        let limits = ContextLimits::default();
        let files = scan_link(&link, &scan, &limits).unwrap();
        assert_eq!(files.len(), 1);
        assert!(files[0].relative_path.contains("readme.md"));

        let _ = fs::remove_dir_all(&base);
    }

    #[test]
    fn scan_folder_respects_allowed_extensions() {
        let base = std::env::temp_dir().join(format!("omoa-ext-test-{}", uuid::Uuid::new_v4()));
        fs::create_dir_all(&base).unwrap();
        fs::write(base.join("notes.txt"), "texte").unwrap();
        fs::write(base.join("readme.md"), "# md").unwrap();

        let link = ContextLink {
            id: "test".into(),
            knowledge_base_id: "kb".into(),
            link_type: "folder".into(),
            path: base.to_string_lossy().into_owned(),
            recursive: true,
            enabled: true,
            last_sync_at: None,
            last_sync_status: "pending".into(),
            last_sync_error: None,
            doc_count: 0,
            symbol_count: 0,
            allowed_extensions: vec!["txt".into()],
        };
        let files = scan_link(&link, &SyncScanSettings::default(), &ContextLimits::default()).unwrap();
        assert_eq!(files.len(), 1);
        assert!(files[0].relative_path.ends_with("notes.txt"));

        let _ = fs::remove_dir_all(&base);
    }
}
