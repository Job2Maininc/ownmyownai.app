use super::agent_loop::{run_agent_loop, AgentConfig as LoopConfig, MAX_AGENT_STEPS};
use serde_json::json;
use std::sync::atomic::{AtomicBool, Ordering};
use std::sync::Arc;

pub struct JobAgentConfig {
    pub model: String,
    pub context_ids: Vec<String>,
    pub max_steps: u32,
    pub system_prompt: String,
    pub user_task: String,
}

pub async fn run_agent<F>(
    config: JobAgentConfig,
    cancel: Arc<AtomicBool>,
    on_progress: F,
) -> Result<String, String>
where
    F: FnMut(&str) + Send + 'static,
{
    let max_steps = if config.max_steps == 0 {
        MAX_AGENT_STEPS
    } else {
        config.max_steps.min(MAX_AGENT_STEPS)
    };

    let progress = Arc::new(std::sync::Mutex::new(on_progress));
    let progress_cb = progress.clone();
    let on_step: Arc<dyn Fn(u32, &str, &str) + Send + Sync> =
        Arc::new(move |step: u32, tool: &str, status: &str| {
        if let Ok(mut cb) = progress_cb.lock() {
            cb(&format!("Étape {step}/{max_steps} — {tool} ({status})…\n"));
        }
    });

    let task = if config.system_prompt.trim().is_empty() {
        config.user_task
    } else {
        format!("{}\n\n{}", config.system_prompt, config.user_task)
    };

    let cancel_flag = cancel.clone();
    let is_cancelled: Arc<dyn Fn() -> bool + Send + Sync> =
        Arc::new(move || cancel_flag.load(Ordering::SeqCst));

    run_agent_loop(LoopConfig {
        model: config.model,
        messages: vec![json!({ "role": "user", "content": task })],
        context_ids: config.context_ids,
        on_step,
        is_cancelled,
    })
    .await
}
