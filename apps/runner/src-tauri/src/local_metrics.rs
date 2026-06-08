use crate::hardware::get_hardware_info;
use serde::{Deserialize, Serialize};
use std::sync::Mutex;
use std::time::{Instant, SystemTime, UNIX_EPOCH};

static LAST_METRICS: Mutex<Option<LastRequestMetrics>> = Mutex::new(None);

struct ActiveCapture {
    model: String,
    started_at: Instant,
    stats: ChatCompletionStats,
}

static ACTIVE_CAPTURE: Mutex<Option<ActiveCapture>> = Mutex::new(None);

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct LastRequestMetrics {
    pub model: String,
    pub tokens_per_second: f64,
    pub latency_ms: u64,
    pub ram_used_gb: f64,
    pub prompt_tokens: u32,
    pub completion_tokens: u32,
    pub completed_at: String,
}

#[derive(Debug, Default)]
pub struct ChatCompletionStats {
    pub prompt_tokens: u32,
    pub completion_tokens: u32,
    pub total_duration_ns: Option<u64>,
    pub eval_duration_ns: Option<u64>,
}

pub fn merge_openai_usage_chunk(
    stats: &mut ChatCompletionStats,
    json: &serde_json::Value,
) {
    if let Some(usage) = json.get("usage") {
        stats.prompt_tokens = usage
            .get("prompt_tokens")
            .and_then(|v| v.as_u64())
            .unwrap_or(0) as u32;
        stats.completion_tokens = usage
            .get("completion_tokens")
            .and_then(|v| v.as_u64())
            .unwrap_or(0) as u32;
    }

    if json.get("done").and_then(|d| d.as_bool()).unwrap_or(false) {
        stats.total_duration_ns = json.get("total_duration").and_then(|v| v.as_u64());
        stats.eval_duration_ns = json.get("eval_duration").and_then(|v| v.as_u64());
        if stats.prompt_tokens == 0 {
            stats.prompt_tokens = json
                .get("prompt_eval_count")
                .and_then(|v| v.as_u64())
                .unwrap_or(0) as u32;
        }
        if stats.completion_tokens == 0 {
            stats.completion_tokens = json
                .get("eval_count")
                .and_then(|v| v.as_u64())
                .unwrap_or(0) as u32;
        }
    }
}

pub fn record_from_chat(model: &str, stats: &ChatCompletionStats, wall_latency_ms: u64) {
    let latency_ms = stats
        .total_duration_ns
        .map(|ns| ns / 1_000_000)
        .unwrap_or(wall_latency_ms);

    let generation_ms = stats
        .eval_duration_ns
        .map(|ns| ns / 1_000_000)
        .unwrap_or(latency_ms);

    let tokens_per_second = if stats.completion_tokens == 0 || generation_ms == 0 {
        0.0
    } else {
        let secs = generation_ms as f64 / 1000.0;
        (stats.completion_tokens as f64 / secs * 10.0).round() / 10.0
    };

    let hw = get_hardware_info();
    let ram_used_gb =
        ((hw.total_ram_gb - hw.available_ram_gb) * 10.0).round() / 10.0;

    let completed_at = SystemTime::now()
        .duration_since(UNIX_EPOCH)
        .map(|d| {
            chrono::DateTime::from_timestamp(d.as_secs() as i64, d.subsec_nanos())
                .map(|dt| dt.to_rfc3339())
                .unwrap_or_default()
        })
        .unwrap_or_default();

    let metrics = LastRequestMetrics {
        model: model.to_string(),
        tokens_per_second,
        latency_ms,
        ram_used_gb,
        prompt_tokens: stats.prompt_tokens,
        completion_tokens: stats.completion_tokens,
        completed_at,
    };

    if let Ok(mut slot) = LAST_METRICS.lock() {
        *slot = Some(metrics);
    }
}

pub fn begin_request(model: &str) {
    if let Ok(mut slot) = ACTIVE_CAPTURE.lock() {
        *slot = Some(ActiveCapture {
            model: model.to_string(),
            started_at: Instant::now(),
            stats: ChatCompletionStats::default(),
        });
    }
}

pub fn merge_stream_chunk(json: &serde_json::Value) {
    if let Ok(mut slot) = ACTIVE_CAPTURE.lock() {
        if let Some(active) = slot.as_mut() {
            merge_openai_usage_chunk(&mut active.stats, json);
        }
    }
}

pub fn finish_request() {
    let capture = ACTIVE_CAPTURE
        .lock()
        .ok()
        .and_then(|mut guard| guard.take());
    if let Some(active) = capture {
        if active.stats.completion_tokens > 0 || active.stats.prompt_tokens > 0 {
            record_from_chat(
                &active.model,
                &active.stats,
                active.started_at.elapsed().as_millis() as u64,
            );
            crate::host_status::emit_status();
        }
    }
}

pub fn get_last_metrics() -> Option<LastRequestMetrics> {
    LAST_METRICS.lock().ok().and_then(|g| g.clone())
}

pub fn heartbeat_payload() -> Option<serde_json::Value> {
    get_last_metrics().map(|m| {
        serde_json::json!({
            "model": m.model,
            "tokens_per_second": m.tokens_per_second,
            "latency_ms": m.latency_ms,
            "ram_used_gb": m.ram_used_gb,
            "prompt_tokens": m.prompt_tokens,
            "completion_tokens": m.completion_tokens,
            "completed_at": m.completed_at,
        })
    })
}
