use super::store::list_all_context_links;
use super::sync::{sync_all_links, sync_link};
use crate::settings::resolved_sync_scan_settings;
use notify::{Config, RecommendedWatcher, RecursiveMode, Watcher};
use std::collections::HashMap;
use std::path::PathBuf;
use std::sync::mpsc;
use std::time::Duration;

static WATCHER_STARTED: std::sync::atomic::AtomicBool =
    std::sync::atomic::AtomicBool::new(false);

pub fn start_context_watcher() {
    if WATCHER_STARTED
        .compare_exchange(
            false,
            true,
            std::sync::atomic::Ordering::SeqCst,
            std::sync::atomic::Ordering::SeqCst,
        )
        .is_err()
    {
        return;
    }

    tauri::async_runtime::spawn(async {
        sync_all_links().await;
    });

    std::thread::spawn(|| {
        let (notify_tx, notify_rx) = mpsc::channel();
        let mut watcher = match RecommendedWatcher::new(notify_tx, Config::default()) {
            Ok(w) => w,
            Err(_) => return,
        };

        let mut path_to_link: HashMap<PathBuf, String> = HashMap::new();
        register_watches(&mut watcher, &mut path_to_link);

        let debounce_ms = resolved_sync_scan_settings().sync_debounce_ms;
        let mut last_event: HashMap<String, std::time::Instant> = HashMap::new();

        loop {
            match notify_rx.recv_timeout(Duration::from_secs(5)) {
                Ok(Ok(event)) => {
                    for changed in event.paths {
                        if let Some(link_id) = find_link_for_path(&changed, &path_to_link) {
                            last_event.insert(link_id, std::time::Instant::now());
                        }
                    }
                }
                Ok(Err(_)) | Err(_) => {}
            }

            let now = std::time::Instant::now();
            let ready: Vec<String> = last_event
                .iter()
                .filter(|(_, t)| now.duration_since(**t) >= Duration::from_millis(debounce_ms))
                .map(|(id, _)| id.clone())
                .collect();

            for link_id in ready {
                last_event.remove(&link_id);
                tauri::async_runtime::spawn(async move {
                    let _ = sync_link(&link_id).await;
                });
            }

            if last_event.is_empty() {
                register_watches(&mut watcher, &mut path_to_link);
            }
        }
    });
}

fn register_watches(
    watcher: &mut RecommendedWatcher,
    path_to_link: &mut HashMap<PathBuf, String>,
) {
    path_to_link.clear();
    if let Ok(links) = list_all_context_links() {
        for link in links {
            if !link.enabled {
                continue;
            }
            let path = PathBuf::from(&link.path);
            let watch_path = if path.is_file() {
                path.parent().unwrap_or(&path).to_path_buf()
            } else {
                path.clone()
            };
            if watch_path.exists() {
                let _ = watcher.watch(&watch_path, RecursiveMode::Recursive);
                path_to_link.insert(watch_path, link.id);
            }
        }
    }
}

fn find_link_for_path(path: &PathBuf, map: &HashMap<PathBuf, String>) -> Option<String> {
    for (root, link_id) in map {
        if path.starts_with(root) {
            return Some(link_id.clone());
        }
    }
    None
}
