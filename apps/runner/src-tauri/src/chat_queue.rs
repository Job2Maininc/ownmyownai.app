use std::collections::VecDeque;
use std::future::Future;
use std::pin::Pin;
use std::sync::atomic::{AtomicBool, Ordering};
use std::sync::{Mutex, OnceLock};

type ChatJobFuture = Pin<Box<dyn Future<Output = ()> + Send>>;

pub struct ChatJob {
    pub request_id: Option<String>,
    pub run: ChatJobFuture,
}

struct QueueState {
    pending: VecDeque<ChatJob>,
    worker_running: bool,
}

static CHAT_QUEUE: OnceLock<Mutex<QueueState>> = OnceLock::new();
static WORKER_BUSY: AtomicBool = AtomicBool::new(false);

fn queue_state() -> &'static Mutex<QueueState> {
    CHAT_QUEUE.get_or_init(|| {
        Mutex::new(QueueState {
            pending: VecDeque::new(),
            worker_running: false,
        })
    })
}

fn spawn_worker_if_needed() {
    let should_spawn = {
        let mut state = queue_state().lock().expect("chat queue lock");
        if state.worker_running {
            false
        } else {
            state.worker_running = true;
            true
        }
    };
    if should_spawn {
        tokio::spawn(run_worker());
    }
}

/// Returns 1-based position in the queue after enqueue.
pub fn enqueue(job: ChatJob) -> usize {
    let position = {
        let mut state = queue_state().lock().expect("chat queue lock");
        state.pending.push_back(job);
        state.pending.len()
    };
    spawn_worker_if_needed();
    position
}

/// Drop queued jobs matching `request_id`. Returns true if any were removed.
pub fn cancel_pending(request_id: &str) -> bool {
    let mut state = queue_state().lock().expect("chat queue lock");
    let before = state.pending.len();
    state
        .pending
        .retain(|job| job.request_id.as_deref() != Some(request_id));
    before != state.pending.len()
}

pub fn queue_depth() -> usize {
    queue_state()
        .lock()
        .map(|s| s.pending.len())
        .unwrap_or(0)
}

async fn run_worker() {
    WORKER_BUSY.store(true, Ordering::SeqCst);

    loop {
        let job = {
            let mut state = queue_state().lock().expect("chat queue lock");
            state.pending.pop_front()
        };

        let Some(job) = job else {
            let restart = {
                let mut state = queue_state().lock().expect("chat queue lock");
                state.worker_running = false;
                WORKER_BUSY.store(false, Ordering::SeqCst);
                !state.pending.is_empty()
            };
            if restart {
                let mut state = queue_state().lock().expect("chat queue lock");
                state.worker_running = true;
                continue;
            }
            break;
        };

        job.run.await;
    }
}
