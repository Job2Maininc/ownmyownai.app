use crate::ollama::model_exists;
use crate::settings::{get_settings, FALLBACK_DEFAULT_MODEL};

/// Max wait for the first streamed token before switching to fallback model.
pub const FIRST_TOKEN_TIMEOUT_SECS: u64 = 45;

pub const SLOW_MODEL_MARKER: &str = "__MODEL_FALLBACK_SLOW__";

#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub enum FallbackReason {
    Absent,
    Slow,
}

impl FallbackReason {
    pub fn as_str(self) -> &'static str {
        match self {
            Self::Absent => "absent",
            Self::Slow => "slow",
        }
    }
}

#[derive(Debug, Clone, PartialEq, Eq)]
pub struct FallbackResolution {
    pub requested: String,
    pub effective: String,
    pub fallback_used: bool,
    pub reason: Option<FallbackReason>,
}

pub fn first_token_timeout_secs() -> u64 {
    FIRST_TOKEN_TIMEOUT_SECS
}

pub fn slow_model_error() -> String {
    SLOW_MODEL_MARKER.to_string()
}

pub fn is_slow_model_error(err: &str) -> bool {
    err == SLOW_MODEL_MARKER
}

/// Ordered deduplicated chain: preferred → configured fallback → default → selected → hardcoded default.
pub fn fallback_chain(preferred: &str) -> Vec<String> {
    let settings = get_settings().unwrap_or_default();
    let mut chain = Vec::new();
    let mut seen = std::collections::HashSet::new();

    let mut push = |model: &str| {
        let model = model.trim();
        if model.is_empty() {
            return;
        }
        if seen.insert(model.to_string()) {
            chain.push(model.to_string());
        }
    };

    push(preferred);
    if let Some(ref fb) = settings.fallback_model {
        push(fb);
    }
    push(&settings.default_model);
    for m in &settings.selected_models {
        push(m);
    }
    push(FALLBACK_DEFAULT_MODEL);

    chain
}

pub fn first_installed_in_chain(chain: &[String]) -> Option<String> {
    chain.iter().find(|m| model_exists(m)).cloned()
}

pub fn next_installed_fallback(chain: &[String], current: &str) -> Option<String> {
    let pos = chain.iter().position(|m| m == current)?;
    chain[pos + 1..]
        .iter()
        .find(|m| model_exists(m))
        .cloned()
}

/// Resolve an installed model, using the fallback chain when the preferred model is absent.
pub fn resolve_with_fallback(preferred: &str) -> FallbackResolution {
    let chain = fallback_chain(preferred);
    if model_exists(preferred) {
        return FallbackResolution {
            requested: preferred.to_string(),
            effective: preferred.to_string(),
            fallback_used: false,
            reason: None,
        };
    }

    if let Some(installed) = first_installed_in_chain(&chain) {
        let fallback_used = installed != preferred;
        return FallbackResolution {
            requested: preferred.to_string(),
            effective: installed,
            fallback_used,
            reason: if fallback_used {
                Some(FallbackReason::Absent)
            } else {
                None
            },
        };
    }

    FallbackResolution {
        requested: preferred.to_string(),
        effective: preferred.to_string(),
        fallback_used: false,
        reason: None,
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn chain_dedupes_and_orders() {
        let chain = fallback_chain("llama3.1:8b");
        assert_eq!(chain.first().map(String::as_str), Some("llama3.1:8b"));
        assert!(chain.contains(&FALLBACK_DEFAULT_MODEL.to_string()));
    }

    #[test]
    fn slow_marker_roundtrip() {
        let err = slow_model_error();
        assert!(is_slow_model_error(&err));
    }
}
