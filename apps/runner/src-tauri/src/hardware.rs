use serde::Serialize;
use std::path::Path;
use std::process::Command;
use sysinfo::{Disks, System};

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct GpuInfo {
    pub name: String,
    pub vram_gb: Option<f64>,
    pub kind: String,
}

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct HardwareInfo {
    pub total_ram_gb: f64,
    pub available_ram_gb: f64,
    pub cpu_cores: usize,
    pub gpus: Vec<GpuInfo>,
    pub has_discrete_gpu: bool,
}

pub fn get_hardware_info() -> HardwareInfo {
    let mut sys = System::new();
    sys.refresh_memory();
    let total = sys.total_memory() as f64 / (1024.0 * 1024.0 * 1024.0);
    let available = sys.available_memory() as f64 / (1024.0 * 1024.0 * 1024.0);
    let gpus = detect_gpus();
    let has_discrete_gpu = gpus.iter().any(|g| g.kind == "discrete");
    HardwareInfo {
        total_ram_gb: (total * 10.0).round() / 10.0,
        available_ram_gb: (available * 10.0).round() / 10.0,
        cpu_cores: sys.cpus().len(),
        gpus,
        has_discrete_gpu,
    }
}

fn detect_gpus() -> Vec<GpuInfo> {
    #[cfg(target_os = "windows")]
    {
        if let Some(from_wmi) = detect_gpus_wmi() {
            if !from_wmi.is_empty() {
                return from_wmi;
            }
        }
    }
    vec![]
}

#[cfg(target_os = "windows")]
fn detect_gpus_wmi() -> Option<Vec<GpuInfo>> {
    let output = Command::new("powershell")
        .args([
            "-NoProfile",
            "-Command",
            "Get-CimInstance Win32_VideoController | Select-Object Name, AdapterRAM | ConvertTo-Json -Compress",
        ])
        .output()
        .ok()?;

    if !output.status.success() {
        return None;
    }

    let text = String::from_utf8_lossy(&output.stdout).trim().to_string();
    if text.is_empty() {
        return Some(vec![]);
    }

    #[derive(serde::Deserialize)]
    struct WmiGpu {
        #[serde(rename = "Name")]
        name: Option<String>,
        #[serde(rename = "AdapterRAM")]
        adapter_ram: Option<u64>,
    }

    let entries: Vec<WmiGpu> = if text.starts_with('[') {
        serde_json::from_str(&text).ok()?
    } else {
        serde_json::from_str::<WmiGpu>(&text)
            .ok()
            .map(|g| vec![g])?
    };

    Some(
        entries
            .into_iter()
            .filter_map(|g| {
                let name = g.name?.trim().to_string();
                if name.is_empty() || name.eq_ignore_ascii_case("Microsoft Basic Display Driver") {
                    return None;
                }
                let vram_gb = g.adapter_ram.and_then(|bytes| {
                    if bytes == 0 || bytes == u64::MAX {
                        None
                    } else {
                        Some((bytes as f64 / (1024.0 * 1024.0 * 1024.0) * 10.0).round() / 10.0)
                    }
                });
                let kind = if name.to_lowercase().contains("intel") && !name.to_lowercase().contains("arc") {
                    "integrated"
                } else {
                    "discrete"
                };
                Some(GpuInfo {
                    name,
                    vram_gb,
                    kind: kind.into(),
                })
            })
            .collect(),
    )
}

pub fn disk_free_gb_for_path(path: &Path) -> Option<f64> {
    let disks = Disks::new_with_refreshed_list();
    for disk in disks.list() {
        if path.starts_with(disk.mount_point()) {
            let free = disk.available_space() as f64 / (1024.0 * 1024.0 * 1024.0);
            return Some((free * 10.0).round() / 10.0);
        }
    }
    None
}

pub fn compatibility_for_ram(model_ram_gb: u32, system_ram_gb: f64) -> &'static str {
    if system_ram_gb >= model_ram_gb as f64 {
        "compatible"
    } else if system_ram_gb >= model_ram_gb as f64 * 0.75 {
        "limited"
    } else {
        "not_recommended"
    }
}
