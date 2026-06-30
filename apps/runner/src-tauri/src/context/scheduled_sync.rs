use super::store::list_all_context_links;
use super::sync::sync_all_links;
use crate::settings::resolved_scheduled_sync;
use crate::sync_schedule::{cron_matches, next_cron_run, parse_cron_expression, CronSchedule};
use chrono::{Datelike, Local, Timelike, Utc};
use serde::{Deserialize, Serialize};
use std::fs::{self, OpenOptions};
use std::io::Write;
use std::path::PathBuf;
use std::sync::atomic::{AtomicBool, Ordering};
use std::sync::Mutex;
use tokio::time::{sleep, Duration};

static SCHEDULED_SYNC_STARTED: AtomicBool = AtomicBool::new(false);
static LAST_RUN_SLOT: Mutex<Option<String>> = Mutex::new(None);

const APP_DIR: &str = "OwnMyOwnAI";
const REPORT_FILE: &str = "sync-schedule.log";
const MAX_REPORT_LINES: usize = 500;

fn run_slot_key(dt: &chrono::DateTime<Local>) -> String {
    format!(
        "{:04}-{:02}-{:02}T{:02}:{:02}",
        dt.year(),
        dt.month(),
        dt.day(),
        dt.hour(),
        dt.minute()
    )
}

fn should_run_now(schedule: &CronSchedule) -> bool {
    let now = Local::now();
    if !cron_matches(schedule, &now) {
        return false;
    }
    let slot = run_slot_key(&now);
    if let Ok(mut last) = LAST_RUN_SLOT.lock() {
        if last.as_deref() == Some(slot.as_str()) {
            return false;
        }
        *last = Some(slot);
    }
    true
}

fn report_file_path() -> PathBuf {
    crate::settings::resolved_sync_schedule_log_path()
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct LinkSyncReport {
    link_id: String,
    path: String,
    status: String,
    last_sync_at: Option<String>,
    error: Option<String>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct ScheduledSyncReport {
    started_at: String,
    finished_at: String,
    cron: String,
    links_total: u32,
    links_ok: u32,
    links_error: u32,
    links: Vec<LinkSyncReport>,
}

fn append_local_report(report: &ScheduledSyncReport) {
    let path = report_file_path();
    if let Some(parent) = path.parent() {
        let _ = fs::create_dir_all(parent);
    }

    if let Ok(line) = serde_json::to_string(report) {
        if let Ok(mut file) = OpenOptions::new().create(true).append(true).open(&path) {
            let _ = writeln!(file, "{line}");
        }
        trim_report_file(&path);
    }
}

fn trim_report_file(path: &PathBuf) {
    if let Ok(content) = fs::read_to_string(path) {
        let lines: Vec<&str> = content.lines().collect();
        if lines.len() > MAX_REPORT_LINES {
            let trimmed: String = lines[lines.len() - MAX_REPORT_LINES..].join("\n");
            let _ = fs::write(path, format!("{trimmed}\n"));
        }
    }
}

pub async fn run_scheduled_sync_now() -> ScheduledSyncReport {
    let cfg = resolved_scheduled_sync();
    let started_at = Utc::now().to_rfc3339();

    sync_all_links().await;

    let links = list_all_context_links().unwrap_or_default();
    let enabled: Vec<_> = links.into_iter().filter(|l| l.enabled).collect();
    let mut links_ok = 0u32;
    let mut links_error = 0u32;
    let mut link_reports = Vec::new();

    for link in &enabled {
        let ok = link.last_sync_status == "ready";
        if ok {
            links_ok += 1;
        } else if link.last_sync_status == "error" {
            links_error += 1;
        }
        link_reports.push(LinkSyncReport {
            link_id: link.id.clone(),
            path: link.path.clone(),
            status: link.last_sync_status.clone(),
            last_sync_at: link.last_sync_at.clone(),
            error: link.last_sync_error.clone(),
        });
    }

    let report = ScheduledSyncReport {
        started_at,
        finished_at: Utc::now().to_rfc3339(),
        cron: cfg.cron.clone(),
        links_total: enabled.len() as u32,
        links_ok,
        links_error,
        links: link_reports,
    };

    append_local_report(&report);

    report
}

pub fn read_last_sync_report() -> Option<ScheduledSyncReport> {
    let path = report_file_path();
    let content = fs::read_to_string(path).ok()?;
    let line = content.lines().rev().find(|l| !l.trim().is_empty())?;
    serde_json::from_str(line).ok()
}

pub fn start_scheduled_sync() {
    if SCHEDULED_SYNC_STARTED
        .compare_exchange(
            false,
            true,
            Ordering::SeqCst,
            Ordering::SeqCst,
        )
        .is_err()
    {
        return;
    }

    tauri::async_runtime::spawn(async {
        loop {
            let cfg = resolved_scheduled_sync();
            if !cfg.enabled {
                sleep(Duration::from_secs(60)).await;
                continue;
            }

            let schedule = match parse_cron_expression(&cfg.cron) {
                Ok(s) => s,
                Err(e) => {
                    eprintln!("Sync planifiée — cron invalide : {e}");
                    sleep(Duration::from_secs(300)).await;
                    continue;
                }
            };

            let now = Local::now();
            if should_run_now(&schedule) {
                let report = run_scheduled_sync_now().await;
                eprintln!(
                    "Sync planifiée terminée — {} lien(s), {} ok, {} erreur(s)",
                    report.links_total, report.links_ok, report.links_error
                );
            }

            let wait_until =
                next_cron_run(&schedule, now).unwrap_or(now + chrono::Duration::hours(24));
            let wait_secs = (wait_until - Local::now()).num_seconds().max(30).min(86400);
            sleep(Duration::from_secs(wait_secs as u64)).await;
        }
    });
}
