use crate::settings::resolved_activity_dir;
use chrono::Utc;
use std::fs::OpenOptions;
use std::io::Write;

pub fn log_client_activity(event: &str, details: serde_json::Value) {
    let dir = resolved_activity_dir();
    if std::fs::create_dir_all(&dir).is_err() {
        return;
    }

    let line = serde_json::json!({
        "at": Utc::now().to_rfc3339(),
        "event": event,
        "details": details,
    });

    let Ok(mut file) = OpenOptions::new()
        .create(true)
        .append(true)
        .open(dir.join("client-events.jsonl"))
    else {
        return;
    };

    let _ = writeln!(file, "{}", line);
}
