use serde::Serialize;

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct PatchPreview {
    pub path: String,
    pub hunks: u32,
}

pub fn preview_patch(_diff: &str) -> Result<PatchPreview, String> {
    Err("Preview patch non implémenté".into())
}

pub fn apply_patch(_diff: &str) -> Result<(), String> {
    Err("Apply patch non implémenté".into())
}
