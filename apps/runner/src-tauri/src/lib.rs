mod activity;
mod agent;
mod assistant_output;
mod chat_pipeline;
mod chat_queue;
mod cloud_keys;
mod context;
mod creatives;
mod paths;
mod conversation_summary;
mod cursor_configure;
mod cursor_mcp;
mod mcp;
mod dpapi;
mod playbooks;
mod projects;
mod credentials;
mod hardware;
mod history;
mod jobs;
mod local_chat;
mod media;
mod providers;
mod share;
mod process;
mod host_status;
mod local_metrics;
mod model_routing;
mod ollama;
mod openai_gateway;
mod relay;
mod settings;
mod sync_schedule;
mod notifications;
mod tray;
mod updater;
mod user_memory;

use agent::{
    collect_git_diff, collect_gh_pr_diff, find_git_repos, is_gh_available, review_git_diff,
    PrReviewInput, PrReviewResult,
};
use credentials::{
    delete_credentials, generate_cursor_api_token, get_credentials, save_credentials,
    StoredCredentials,
};
use host_status::{build_snapshot, set_app_handle, HostStatusSnapshot};
use context::{
    create_knowledge_base, delete_knowledge_base, export_knowledge_base, import_knowledge_base,
    init_context_db, link_context_file, link_context_folder, link_context_repo, list_audit_log,
    list_context_links, list_documents, list_knowledge_bases, reindex_uploaded_documents,
    read_last_sync_report, run_scheduled_sync_now, set_context_link_enabled,
    set_knowledge_base_system_instruction, update_context_link_extensions, sync_all_links,
    sync_link, unlink_context_link, get_context_link, AuditEntry, ContextLink, ScheduledSyncReport,
};
use projects::{
    create_project, delete_project, list_projects, open_project, update_project, ProjectSummary,
};
use hardware::{advise_music_device, advise_quantization, get_hardware_info, MusicDeviceAdvice};
use media::{probe_musicgen_status, MusicGenStatus};
use cloud_keys::CloudProviderId;
use ollama::{
    check_ollama, delete_model, disk_free_gb_for_models_dir, ensure_embedding_model,
    ensure_ollama_running, pull_model, pull_models, OllamaStatus,
};
use providers::{get_cloud_providers_status, list_available_models, CloudProviderStatus};
use relay::{start_background_services, stop_background_services};
use paths::default_data_dir;
use settings::{
    default_ollama_models_path, get_active_project_id, get_settings, host_data_layout,
    resolved_context_limits, save_data_dir_only, save_settings, set_scheduled_sync,
    set_user_memory_enabled, HostSettings, ScheduledSyncSettings,
};
use user_memory::{add_fact, delete_fact, memory_state, UserMemoryFact, UserMemoryState};
use jobs::{cancel_job, list_jobs, submit_job, JobKind, JobSnapshot};
use local_chat::{cancel_local_chat, run_local_chat};
use serde::Deserialize;
use tauri::{Emitter, Manager};

#[tauri::command(rename = "check_ollama")]
async fn check_ollama_cmd() -> Result<OllamaStatus, String> {
    tauri::async_runtime::spawn_blocking(check_ollama)
        .await
        .map_err(|e| e.to_string())?
}

#[tauri::command(rename = "ensure_ollama_running")]
async fn ensure_ollama_running_cmd(app: tauri::AppHandle) -> Result<(), String> {
    ensure_ollama_running(Some(&app)).await
}

#[tauri::command(rename = "pull_model")]
async fn pull_model_cmd(app: tauri::AppHandle, model: String) -> Result<(), String> {
    pull_model(&model, Some(&app), None).await
}

#[tauri::command(rename = "pull_models")]
async fn pull_models_cmd(app: tauri::AppHandle, models: Vec<String>) -> Result<(), String> {
    pull_models(&models, Some(&app)).await
}

#[tauri::command(rename = "get_host_settings")]
fn get_host_settings_cmd() -> Result<HostSettings, String> {
    get_settings()
}

#[tauri::command(rename = "save_host_settings")]
fn save_host_settings_cmd(settings: HostSettings) -> Result<(), String> {
    let prev = get_settings().ok();
    save_settings(&settings)?;
    mcp::close_all_sessions();
    if gateway_bind_changed(prev.as_ref(), &settings) {
        openai_gateway::reload();
    }
    Ok(())
}

fn gateway_bind_changed(prev: Option<&HostSettings>, next: &HostSettings) -> bool {
    match prev {
        None => true,
        Some(p) => {
            p.cursor_gateway_port != next.cursor_gateway_port
                || p.cursor_gateway_lan != next.cursor_gateway_lan
                || p.cursor_gateway_enabled != next.cursor_gateway_enabled
        }
    }
}

#[tauri::command(rename = "get_default_models_dir")]
fn get_default_models_dir_cmd() -> String {
    default_ollama_models_path().to_string_lossy().into_owned()
}

#[tauri::command(rename = "get_default_data_dir")]
fn get_default_data_dir_cmd() -> String {
    default_data_dir().to_string_lossy().into_owned()
}

#[tauri::command(rename = "get_host_data_layout")]
fn get_host_data_layout_cmd() -> crate::paths::HostDataLayout {
    host_data_layout()
}

#[tauri::command(rename = "save_host_data_dir")]
fn save_host_data_dir_cmd(data_dir: String) -> Result<HostSettings, String> {
    save_data_dir_only(&data_dir)
}

#[tauri::command(rename = "get_credentials")]
fn get_credentials_cmd() -> Result<Option<StoredCredentials>, String> {
    get_credentials()
}

#[tauri::command(rename = "complete_pairing")]
async fn complete_pairing_cmd(
    code: String,
    name: String,
    supabase_url: String,
) -> Result<StoredCredentials, String> {
    let client = reqwest::Client::new();
    let url = format!(
        "{}/functions/v1/complete-pairing",
        supabase_url.trim_end_matches('/')
    );

    let settings = get_settings().unwrap_or_default();
    let body = serde_json::json!({
        "code": code.trim(),
        "name": name,
        "platform": "windows",
        "default_model": settings.default_model,
    });

    let res = client
        .post(&url)
        .header("Content-Type", "application/json")
        .json(&body)
        .send()
        .await
        .map_err(|e| e.to_string())?;

    if !res.status().is_success() {
        let text = res.text().await.unwrap_or_default();
        return Err(text);
    }

    #[derive(Deserialize)]
    struct PairingResponse {
        host_id: String,
        device_secret: String,
    }

    let data: PairingResponse = res.json().await.map_err(|e| e.to_string())?;
    let creds = StoredCredentials {
        host_id: data.host_id,
        device_secret: data.device_secret,
        supabase_url: Some(supabase_url.trim_end_matches('/').to_string()),
        cursor_api_token: Some(generate_cursor_api_token()),
    };
    save_credentials(&creds)?;
    start_background_services(Some(creds.clone())).await?;
    Ok(creds)
}

#[tauri::command(rename = "start_background_services")]
async fn start_background_services_cmd() -> Result<(), String> {
    start_background_services(None).await
}

#[tauri::command(rename = "open_url")]
fn open_url_cmd(url: String) -> Result<(), String> {
    open::that(url).map_err(|e| e.to_string())
}

#[tauri::command(rename = "get_host_status")]
async fn get_host_status_cmd() -> Result<HostStatusSnapshot, String> {
    tauri::async_runtime::spawn_blocking(build_snapshot)
        .await
        .map_err(|e| e.to_string())
}

#[tauri::command(rename = "unpair_host")]
async fn unpair_host_cmd() -> Result<(), String> {
    stop_background_services();
    delete_credentials()?;
    Ok(())
}

#[tauri::command(rename = "get_hardware_info")]
fn get_hardware_info_cmd() -> hardware::HardwareInfo {
    get_hardware_info()
}

#[tauri::command(rename = "delete_ollama_model")]
fn delete_ollama_model_cmd(model: String) -> Result<(), String> {
    delete_model(&model)
}

#[tauri::command(rename = "get_disk_free_gb")]
fn get_disk_free_gb_cmd() -> Option<f64> {
    disk_free_gb_for_models_dir()
}

#[tauri::command(rename = "get_quantization_advice")]
fn get_quantization_advice_cmd(model: String) -> hardware::QuantizationAdvice {
    let disk_free = disk_free_gb_for_models_dir();
    advise_quantization(&model, disk_free)
}

#[tauri::command(rename = "list_installed_models")]
fn list_installed_models_cmd() -> Vec<String> {
    list_available_models()
}

#[tauri::command(rename = "get_cloud_providers_status")]
fn get_cloud_providers_status_cmd() -> Vec<CloudProviderStatus> {
    get_cloud_providers_status()
}

#[tauri::command(rename = "save_cloud_provider_key")]
fn save_cloud_provider_key_cmd(provider_id: String, api_key: String) -> Result<(), String> {
    let provider = CloudProviderId::from_str_id(&provider_id)
        .ok_or_else(|| format!("Fournisseur inconnu : {provider_id}"))?;
    cloud_keys::save_provider_api_key(provider, &api_key)
}

#[tauri::command(rename = "delete_cloud_provider_key")]
fn delete_cloud_provider_key_cmd(provider_id: String) -> Result<(), String> {
    let provider = CloudProviderId::from_str_id(&provider_id)
        .ok_or_else(|| format!("Fournisseur inconnu : {provider_id}"))?;
    cloud_keys::delete_provider_api_key(provider)
}

#[tauri::command(rename = "ensure_embedding_model")]
async fn ensure_embedding_model_cmd(app: tauri::AppHandle) -> Result<(), String> {
    ensure_embedding_model(Some(&app)).await
}

#[tauri::command(rename = "list_knowledge_bases")]
fn list_knowledge_bases_cmd() -> Result<Vec<context::KnowledgeBase>, String> {
    init_context_db()?;
    list_knowledge_bases()
}

#[tauri::command(rename = "create_knowledge_base")]
fn create_knowledge_base_cmd(name: String, description: String) -> Result<context::KnowledgeBase, String> {
    init_context_db()?;
    create_knowledge_base(&name, &description, &resolved_context_limits())
}

#[tauri::command(rename = "delete_knowledge_base")]
fn delete_knowledge_base_cmd(id: String) -> Result<(), String> {
    delete_knowledge_base(&id)
}

#[tauri::command(rename = "set_knowledge_base_system_instruction")]
fn set_knowledge_base_system_instruction_cmd(
    kb_id: String,
    system_instruction: String,
) -> Result<(), String> {
    init_context_db()?;
    set_knowledge_base_system_instruction(&kb_id, &system_instruction)
}

#[tauri::command(rename = "list_projects")]
fn list_projects_cmd() -> Result<Vec<ProjectSummary>, String> {
    init_context_db()?;
    let active = get_active_project_id().ok().flatten();
    list_projects(active.as_deref())
}

#[tauri::command(rename = "update_project")]
fn update_project_cmd(
    id: String,
    name: Option<String>,
    description: Option<String>,
    system_instruction: Option<String>,
    knowledge_base_ids: Option<Vec<String>>,
) -> Result<ProjectSummary, String> {
    init_context_db()?;
    let active = get_active_project_id().ok().flatten();
    update_project(
        &id,
        name.as_deref(),
        description.as_deref(),
        system_instruction.as_deref(),
        knowledge_base_ids.as_deref(),
        active.as_deref(),
    )
}

#[tauri::command(rename = "create_project")]
fn create_project_cmd(
    name: String,
    description: String,
    knowledge_base_ids: Vec<String>,
) -> Result<ProjectSummary, String> {
    init_context_db()?;
    create_project(&name, &description, &knowledge_base_ids)
}

#[tauri::command(rename = "open_project")]
fn open_project_cmd(id: String) -> Result<ProjectSummary, String> {
    init_context_db()?;
    let (project, _) = open_project(&id)?;
    Ok(project)
}

#[tauri::command(rename = "delete_project")]
fn delete_project_cmd(id: String) -> Result<(), String> {
    init_context_db()?;
    if get_active_project_id().ok().flatten().as_deref() == Some(id.as_str()) {
        let _ = settings::set_active_project_id(None);
    }
    delete_project(&id)
}

#[tauri::command(rename = "list_context_documents")]
fn list_context_documents_cmd(kb_id: String) -> Result<Vec<context::DocumentInfo>, String> {
    list_documents(&kb_id)
}

#[tauri::command(rename = "export_knowledge_base")]
fn export_knowledge_base_cmd(kb_id: String, dest_path: String) -> Result<(), String> {
    export_knowledge_base(&kb_id, &std::path::PathBuf::from(dest_path))
}

#[tauri::command(rename = "import_knowledge_base")]
async fn import_knowledge_base_cmd(zip_path: String) -> Result<context::KnowledgeBase, String> {
    init_context_db()?;
    let kb = import_knowledge_base(
        &std::path::PathBuf::from(zip_path),
        &resolved_context_limits(),
    )?;
    let _ = ensure_embedding_model(None).await;
    let _ = reindex_uploaded_documents(&kb.id).await;
    Ok(kb)
}

#[tauri::command(rename = "list_context_links")]
fn list_context_links_cmd(kb_id: String) -> Result<Vec<ContextLink>, String> {
    init_context_db()?;
    list_context_links(&kb_id)
}

#[tauri::command(rename = "link_context_file")]
async fn link_context_file_cmd(
    kb_id: String,
    paths: Vec<String>,
) -> Result<Vec<ContextLink>, String> {
    init_context_db()?;
    ensure_embedding_model(None).await?;
    link_context_file(&kb_id, paths).await
}

#[tauri::command(rename = "link_context_folder")]
async fn link_context_folder_cmd(
    kb_id: String,
    path: String,
    recursive: bool,
) -> Result<ContextLink, String> {
    init_context_db()?;
    ensure_embedding_model(None).await?;
    link_context_folder(&kb_id, path, recursive, "folder").await
}

#[tauri::command(rename = "link_context_drive")]
async fn link_context_drive_cmd(kb_id: String, drive_path: String) -> Result<ContextLink, String> {
    init_context_db()?;
    ensure_embedding_model(None).await?;
    let normalized = normalize_drive_path(&drive_path);
    link_context_folder(&kb_id, normalized, true, "drive").await
}

#[tauri::command(rename = "list_windows_drives")]
fn list_windows_drives_cmd() -> Vec<DriveInfo> {
    list_windows_drives()
}

#[derive(serde::Serialize)]
#[serde(rename_all = "camelCase")]
struct DriveInfo {
    path: String,
    label: String,
}

fn normalize_drive_path(path: &str) -> String {
    let trimmed = path.trim().trim_end_matches(['\\', '/']);
    if trimmed.len() == 2 && trimmed.as_bytes().get(1) == Some(&b':') {
        format!("{trimmed}\\")
    } else {
        path.trim().to_string()
    }
}

fn list_windows_drives() -> Vec<DriveInfo> {
    #[cfg(target_os = "windows")]
    {
        ('A'..='Z')
            .filter_map(|letter| {
                let path = format!("{letter}:\\");
                if std::path::Path::new(&path).exists() {
                    Some(DriveInfo {
                        label: format!("Disque {letter}:"),
                        path,
                    })
                } else {
                    None
                }
            })
            .collect()
    }
    #[cfg(not(target_os = "windows"))]
    {
        vec![]
    }
}

#[tauri::command(rename = "link_context_repo")]
async fn link_context_repo_cmd(kb_id: String, path: String) -> Result<ContextLink, String> {
    init_context_db()?;
    ensure_embedding_model(None).await?;
    link_context_repo(&kb_id, path).await
}

#[tauri::command(rename = "unlink_context_link")]
fn unlink_context_link_cmd(link_id: String) -> Result<(), String> {
    unlink_context_link(&link_id)
}

#[tauri::command(rename = "sync_context_link")]
async fn sync_context_link_cmd(link_id: String) -> Result<String, String> {
    init_context_db()?;
    ensure_embedding_model(None).await?;
    Ok(submit_job(JobKind::ContextSync {
        link_id: Some(link_id),
    }))
}

#[tauri::command(rename = "sync_all_context_links")]
async fn sync_all_context_links_cmd() -> Result<String, String> {
    init_context_db()?;
    ensure_embedding_model(None).await?;
    Ok(submit_job(JobKind::ContextSyncAll))
}

#[tauri::command(rename = "list_background_jobs")]
fn list_background_jobs_cmd() -> Vec<JobSnapshot> {
    list_jobs()
}

#[tauri::command(rename = "cancel_background_job")]
fn cancel_background_job_cmd(job_id: String) -> Result<(), String> {
    if cancel_job(&job_id) {
        Ok(())
    } else {
        Err("Tâche introuvable ou déjà terminée".into())
    }
}

#[tauri::command(rename = "start_agent_job")]
fn start_agent_job_cmd(prompt: String) -> Result<String, String> {
    if prompt.trim().is_empty() {
        return Err("Prompt requis".into());
    }
    Ok(submit_job(JobKind::AgentRun {
        prompt,
        context_ids: vec![],
    }))
}

#[tauri::command(rename = "set_context_link_enabled")]
fn set_context_link_enabled_cmd(link_id: String, enabled: bool) -> Result<(), String> {
    set_context_link_enabled(&link_id, enabled)
}

#[tauri::command(rename = "set_context_link_extensions")]
async fn set_context_link_extensions_cmd(
    link_id: String,
    allowed_extensions: Vec<String>,
) -> Result<ContextLink, String> {
    init_context_db()?;
    ensure_embedding_model(None).await?;
    update_context_link_extensions(&link_id, &allowed_extensions)?;
    sync_link(&link_id).await?;
    get_context_link(&link_id)
}

#[tauri::command(rename = "list_git_repos")]
fn list_git_repos_cmd() -> Result<Vec<agent::GitRepoInfo>, String> {
    init_context_db()?;
    find_git_repos()
}

#[tauri::command(rename = "collect_git_diff")]
fn collect_git_diff_cmd(repo_path: String, mode: String) -> Result<String, String> {
    collect_git_diff(&repo_path, &mode)
}

#[tauri::command(rename = "collect_gh_pr_diff")]
fn collect_gh_pr_diff_cmd(repo_path: String, pr_number: u32) -> Result<String, String> {
    collect_gh_pr_diff(&repo_path, pr_number)
}

#[tauri::command(rename = "is_gh_available")]
fn is_gh_available_cmd() -> bool {
    is_gh_available()
}

#[tauri::command(rename = "review_git_diff")]
async fn review_git_diff_cmd(input: PrReviewInput) -> Result<PrReviewResult, String> {
    review_git_diff(input).await
}

#[tauri::command(rename = "get_user_memory")]
fn get_user_memory_cmd() -> Result<UserMemoryState, String> {
    init_context_db()?;
    memory_state()
}

#[tauri::command(rename = "add_user_memory_fact")]
fn add_user_memory_fact_cmd(content: String) -> Result<UserMemoryFact, String> {
    init_context_db()?;
    add_fact(&content)
}

#[tauri::command(rename = "delete_user_memory_fact")]
fn delete_user_memory_fact_cmd(id: String) -> Result<(), String> {
    init_context_db()?;
    delete_fact(&id)
}

#[tauri::command(rename = "set_user_memory_enabled")]
fn set_user_memory_enabled_cmd(enabled: bool) -> Result<(), String> {
    set_user_memory_enabled(enabled)
}

#[tauri::command(rename = "get_scheduled_sync")]
fn get_scheduled_sync_cmd() -> ScheduledSyncSettings {
    settings::resolved_scheduled_sync()
}

#[tauri::command(rename = "set_scheduled_sync")]
fn set_scheduled_sync_cmd(settings: ScheduledSyncSettings) -> Result<(), String> {
    set_scheduled_sync(settings)
}

#[tauri::command(rename = "run_scheduled_sync_now")]
async fn run_scheduled_sync_now_cmd() -> Result<ScheduledSyncReport, String> {
    init_context_db()?;
    ensure_embedding_model(None).await?;
    Ok(run_scheduled_sync_now().await)
}

#[tauri::command(rename = "get_last_scheduled_sync_report")]
fn get_last_scheduled_sync_report_cmd() -> Option<ScheduledSyncReport> {
    read_last_sync_report()
}

#[tauri::command(rename = "list_audit_log")]
fn list_audit_log_cmd(
    limit: Option<u32>,
    action_filter: Option<String>,
) -> Result<Vec<AuditEntry>, String> {
    init_context_db()?;
    list_audit_log(limit.unwrap_or(100), action_filter.as_deref())
}

#[tauri::command(rename = "restart_background_services")]
async fn restart_background_services_cmd() -> Result<(), String> {
    stop_background_services();
    tokio::time::sleep(std::time::Duration::from_millis(300)).await;
    start_background_services(None).await
}

#[tauri::command(rename = "local_chat")]
async fn local_chat_cmd(
    app: tauri::AppHandle,
    model: String,
    messages: Vec<serde_json::Value>,
    context_ids: Vec<String>,
) -> Result<(), String> {
    run_local_chat(app, model, messages, context_ids).await
}

#[tauri::command(rename = "cancel_local_chat")]
fn cancel_local_chat_cmd() {
    cancel_local_chat();
}

#[tauri::command(rename = "check_for_updates")]
async fn check_for_updates_cmd(app: tauri::AppHandle) -> Result<updater::UpdateCheckResult, String> {
    Ok(updater::check_for_updates(&app).await)
}

#[tauri::command(rename = "install_host_update")]
async fn install_host_update_cmd(app: tauri::AppHandle) -> Result<(), String> {
    updater::check_and_install(&app).await
}

#[tauri::command(rename = "preview_cursor_mcp_config")]
fn preview_cursor_mcp_config_cmd() -> cursor_mcp::CursorMcpPreview {
    cursor_mcp::preview_cursor_mcp_config()
}

#[tauri::command(rename = "write_cursor_mcp_config")]
fn write_cursor_mcp_config_cmd(project_dir: String) -> Result<cursor_mcp::CursorMcpWriteResult, String> {
    cursor_mcp::write_cursor_mcp_config(&project_dir)
}

#[derive(serde::Serialize)]
#[serde(rename_all = "camelCase")]
struct CursorIntegrationInfo {
    base_url: String,
    api_token: String,
    enabled: bool,
    port: u16,
    lan_enabled: bool,
    lan_ip: Option<String>,
    default_model: String,
    max_req_per_min: u32,
    settings_json: String,
}

fn build_cursor_settings_json(
    base_url: &str,
    api_token: &str,
    model: &str,
) -> Result<String, String> {
    let patch = cursor_configure::build_gateway_settings_patch(base_url, api_token, model);
    cursor_configure::settings_patch_to_pretty_json(&patch)
}

#[derive(Deserialize)]
#[serde(rename_all = "camelCase")]
struct ConfigureCursorInput {
    project_dir: Option<String>,
}

#[tauri::command(rename = "configure_cursor_one_click")]
fn configure_cursor_one_click_cmd(
    input: Option<ConfigureCursorInput>,
) -> Result<cursor_configure::CursorConfigureResult, String> {
    let mut settings = get_settings()?;
    if !settings.cursor_gateway_enabled {
        settings.cursor_gateway_enabled = true;
        save_settings(&settings)?;
        openai_gateway::reload();
    }

    let creds = get_credentials()?.ok_or("Ce PC n'est pas encore lié.")?;
    let api_token = creds
        .cursor_api_token
        .filter(|t| !t.is_empty())
        .ok_or("Token Cursor introuvable. Reliez ce PC.")?;

    let bind_config = openai_gateway::GatewayBindConfig {
        port: settings.cursor_gateway_port,
        lan: settings.cursor_gateway_lan,
        enabled: true,
    };
    let base_url = openai_gateway::client_base_url(&bind_config);
    let project_dir = input.and_then(|i| i.project_dir);

    cursor_configure::configure_cursor_one_click(
        &base_url,
        &api_token,
        &settings.default_model,
        project_dir.as_deref(),
    )
}

#[tauri::command(rename = "list_mcp_servers")]
fn list_mcp_servers_cmd() -> Vec<mcp::McpServerSummary> {
    mcp::list_servers()
}

#[tauri::command(rename = "list_mcp_tools")]
fn list_mcp_tools_cmd() -> Result<Vec<mcp::McpToolDescriptor>, String> {
    mcp::list_all_tools()
}

#[tauri::command(rename = "get_tts_status")]
fn get_tts_status_cmd() -> media::TtsStatus {
    media::detect_tts_status()
}

#[tauri::command(rename = "synthesize_speech")]
async fn synthesize_speech_cmd(request: media::TtsRequest) -> Result<media::TtsResult, String> {
    media::synthesize_speech(request).await
}

#[tauri::command(rename = "get_voice_stt_status")]
fn get_voice_stt_status_cmd() -> media::VoiceSttStatus {
    media::get_stt_status()
}

#[tauri::command(rename = "ensure_whisper_model")]
async fn ensure_whisper_model_cmd(model: Option<String>) -> Result<String, String> {
    media::ensure_whisper_model(model)
        .await
        .map(|p| p.to_string_lossy().into_owned())
}

#[tauri::command(rename = "transcribe_audio")]
async fn transcribe_audio_cmd(path: String) -> Result<media::TranscribeAudioResult, String> {
    media::transcribe_audio_file(std::path::Path::new(&path)).await
}

#[tauri::command(rename = "get_musicgen_status")]
fn get_musicgen_status_cmd() -> MusicGenStatus {
    probe_musicgen_status()
}

#[tauri::command(rename = "get_music_device_advice")]
fn get_music_device_advice_cmd(force_cpu: Option<bool>) -> MusicDeviceAdvice {
    advise_music_device(force_cpu.unwrap_or(false))
}

#[tauri::command(rename = "get_local_image_status")]
fn get_local_image_status_cmd() -> media::LocalImageStatus {
    let settings = get_settings().unwrap_or_default().local_image;
    media::check_local_image_status(&settings)
}

#[tauri::command(rename = "list_comfyui_checkpoints")]
async fn list_comfyui_checkpoints_cmd(base_url: String) -> Result<Vec<String>, String> {
    tauri::async_runtime::spawn_blocking(move || media::list_comfyui_checkpoints(&base_url))
        .await
        .map_err(|e| e.to_string())?
}

#[tauri::command(rename = "generate_local_image")]
async fn generate_local_image_cmd(
    input: media::GenerateImageInput,
) -> Result<media::LocalImageResult, String> {
    let settings = get_settings()?.local_image;
    tauri::async_runtime::spawn_blocking(move || media::generate_local_image(&settings, &input))
        .await
        .map_err(|e| e.to_string())?
}

#[tauri::command(rename = "get_cursor_integration")]
fn get_cursor_integration_cmd() -> Result<CursorIntegrationInfo, String> {
    let settings = get_settings()?;
    let creds = get_credentials()?.ok_or("Ce PC n'est pas encore lié.")?;
    let api_token = creds
        .cursor_api_token
        .filter(|t| !t.is_empty())
        .ok_or("Token Cursor introuvable. Reliez ce PC.")?;
    let port = settings.cursor_gateway_port;
    let bind_config = openai_gateway::GatewayBindConfig {
        port,
        lan: settings.cursor_gateway_lan,
        enabled: settings.cursor_gateway_enabled,
    };
    let base_url = openai_gateway::client_base_url(&bind_config);
    let lan_ip = if settings.cursor_gateway_lan {
        openai_gateway::primary_lan_ip()
    } else {
        None
    };
    let settings_json = build_cursor_settings_json(&base_url, &api_token, &settings.default_model)?;
    Ok(CursorIntegrationInfo {
        base_url,
        api_token,
        enabled: settings.cursor_gateway_enabled,
        port,
        lan_enabled: settings.cursor_gateway_lan,
        lan_ip,
        default_model: settings.default_model,
        max_req_per_min: settings.cursor_gateway_max_req_per_min,
        settings_json,
    })
}

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    tauri::Builder::default()
        .plugin(tauri_plugin_shell::init())
        .plugin(tauri_plugin_dialog::init())
        .plugin(tauri_plugin_updater::Builder::new().build())
        .plugin(tauri_plugin_notification::init())
        .invoke_handler(tauri::generate_handler![
            open_url_cmd,
            check_ollama_cmd,
            ensure_ollama_running_cmd,
            pull_model_cmd,
            pull_models_cmd,
            get_host_settings_cmd,
            save_host_settings_cmd,
            get_default_models_dir_cmd,
            get_default_data_dir_cmd,
            get_host_data_layout_cmd,
            save_host_data_dir_cmd,
            get_credentials_cmd,
            complete_pairing_cmd,
            start_background_services_cmd,
            get_host_status_cmd,
            unpair_host_cmd,
            get_hardware_info_cmd,
            delete_ollama_model_cmd,
            get_disk_free_gb_cmd,
            get_quantization_advice_cmd,
            list_installed_models_cmd,
            get_cloud_providers_status_cmd,
            save_cloud_provider_key_cmd,
            delete_cloud_provider_key_cmd,
            ensure_embedding_model_cmd,
            list_knowledge_bases_cmd,
            create_knowledge_base_cmd,
            delete_knowledge_base_cmd,
            set_knowledge_base_system_instruction_cmd,
            list_projects_cmd,
            update_project_cmd,
            create_project_cmd,
            open_project_cmd,
            delete_project_cmd,
            list_context_documents_cmd,
            export_knowledge_base_cmd,
            import_knowledge_base_cmd,
            list_context_links_cmd,
            link_context_file_cmd,
            link_context_folder_cmd,
            link_context_drive_cmd,
            list_windows_drives_cmd,
            link_context_repo_cmd,
            unlink_context_link_cmd,
            sync_context_link_cmd,
            sync_all_context_links_cmd,
            set_context_link_enabled_cmd,
            set_context_link_extensions_cmd,
            list_background_jobs_cmd,
            cancel_background_job_cmd,
            start_agent_job_cmd,
            list_git_repos_cmd,
            collect_git_diff_cmd,
            collect_gh_pr_diff_cmd,
            is_gh_available_cmd,
            review_git_diff_cmd,
            get_user_memory_cmd,
            add_user_memory_fact_cmd,
            delete_user_memory_fact_cmd,
            set_user_memory_enabled_cmd,
            get_scheduled_sync_cmd,
            set_scheduled_sync_cmd,
            run_scheduled_sync_now_cmd,
            get_last_scheduled_sync_report_cmd,
            list_audit_log_cmd,
            restart_background_services_cmd,
            local_chat_cmd,
            cancel_local_chat_cmd,
            check_for_updates_cmd,
            install_host_update_cmd,
            get_cursor_integration_cmd,
            configure_cursor_one_click_cmd,
            preview_cursor_mcp_config_cmd,
            write_cursor_mcp_config_cmd,
            list_mcp_servers_cmd,
            list_mcp_tools_cmd,
            get_tts_status_cmd,
            synthesize_speech_cmd,
            get_voice_stt_status_cmd,
            ensure_whisper_model_cmd,
            transcribe_audio_cmd,
            get_musicgen_status_cmd,
            get_music_device_advice_cmd,
            get_local_image_status_cmd,
            list_comfyui_checkpoints_cmd,
            generate_local_image_cmd,
        ])
        .setup(|app| {
            if let Some(window) = app.get_webview_window("main") {
                let _ = window.set_theme(Some(tauri::Theme::Light));
            }
            set_app_handle(app.handle().clone());
            if std::env::args().any(|arg| arg.contains("configure-cursor")) {
                let _ = app.emit("omoa://configure-cursor", ());
            }
            tray::setup(app)?;
            ollama::start_status_poller();
            openai_gateway::start();
            let tray_handle = app.handle().clone();
            tauri::async_runtime::spawn(async move {
                if let Ok(snapshot) =
                    tauri::async_runtime::spawn_blocking(host_status::build_snapshot).await
                {
                    tray::set_tooltip(&tray_handle, &host_status::tray_tooltip(&snapshot));
                }
            });
            tauri::async_runtime::spawn(async move {
                if get_credentials().ok().flatten().is_some() {
                    let _ = start_background_services(None).await;
                }
            });
            updater::start_auto_updater(&app.handle());
            Ok(())
        })
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}
