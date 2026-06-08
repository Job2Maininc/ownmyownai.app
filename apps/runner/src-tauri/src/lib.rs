mod agent;
mod cloud_keys;
mod context;
mod mcp;
mod dpapi;
mod playbooks;
mod projects;
mod credentials;
mod hardware;
mod history;
mod jobs;
mod providers;
mod share;
mod process;
mod host_status;
mod local_metrics;
mod model_routing;
mod ollama;
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
use credentials::{delete_credentials, get_credentials, save_credentials, StoredCredentials};
use host_status::{build_snapshot, set_app_handle, HostStatusSnapshot};
use context::{
    create_knowledge_base, delete_knowledge_base, export_knowledge_base, import_knowledge_base,
    init_context_db, link_context_file, link_context_folder, link_context_repo, list_audit_log,
    list_context_links, list_documents, list_knowledge_bases, reindex_uploaded_documents,
    set_context_link_enabled, set_knowledge_base_system_instruction, update_context_link_extensions,
    sync_all_links, sync_link, unlink_context_link, AuditEntry, ContextLink,
};
use projects::{
    create_project, delete_project, list_projects, open_project, update_project, ProjectSummary,
};
use hardware::{advise_quantization, get_hardware_info};
use cloud_keys::CloudProviderId;
use ollama::{
    check_ollama, delete_model, disk_free_gb_for_models_dir, ensure_embedding_model,
    ensure_ollama_running, pull_model, pull_models, OllamaStatus,
};
use providers::{get_cloud_providers_status, list_available_models, CloudProviderStatus};
use relay::{start_background_services, stop_background_services};
use settings::{
    default_ollama_models_path, get_active_project_id, get_settings, resolved_context_limits,
    save_settings, set_user_memory_enabled, HostSettings,
};
use user_memory::{add_fact, delete_fact, memory_state, UserMemoryFact, UserMemoryState};
use jobs::{cancel_job, list_jobs, submit_job, JobKind, JobSnapshot};
use serde::Deserialize;

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
    save_settings(&settings)
}

#[tauri::command(rename = "get_default_models_dir")]
fn get_default_models_dir_cmd() -> String {
    default_ollama_models_path().to_string_lossy().into_owned()
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
    link_context_folder(&kb_id, drive_path, true, "drive").await
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

#[tauri::command(rename = "list_audit_log")]
fn list_audit_log_cmd(
    limit: Option<u32>,
    action_filter: Option<String>,
) -> Result<Vec<AuditEntry>, String> {
    init_context_db()?;
    list_audit_log(limit.unwrap_or(100), action_filter.as_deref())
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
            list_audit_log_cmd,
        ])
        .setup(|app| {
            set_app_handle(app.handle().clone());
            tray::setup(app)?;
            ollama::start_status_poller();
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
