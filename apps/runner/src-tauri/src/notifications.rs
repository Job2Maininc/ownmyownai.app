use crate::host_status;
use tauri_plugin_notification::NotificationExt;

#[derive(Debug, Clone, Copy)]
pub enum TaskDoneKind {
    SyncAll,
    SyncLink,
    Agent,
}

impl TaskDoneKind {
    fn title(self) -> &'static str {
        match self {
            TaskDoneKind::SyncAll => "Indexation terminée",
            TaskDoneKind::SyncLink => "Lien synchronisé",
            TaskDoneKind::Agent => "Agent terminé",
        }
    }
}

/// Shows a Windows toast when a long-running sync or agent task completes.
pub fn notify_task_done(kind: TaskDoneKind, body: &str) {
    if !crate::settings::desktop_notifications_enabled() {
        return;
    }

    let Some(app) = host_status::app_handle() else {
        return;
    };

    let _ = app
        .notification()
        .builder()
        .title(kind.title())
        .body(body)
        .auto_cancel()
        .show();
}
