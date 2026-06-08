use serde::Serialize;
use std::path::Path;
use sysinfo::{Disks, System};

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct HardwareInfo {
    pub total_ram_gb: f64,
    pub available_ram_gb: f64,
    pub cpu_cores: usize,
}

pub fn get_hardware_info() -> HardwareInfo {
    let mut sys = System::new();
    sys.refresh_memory();
    let total = sys.total_memory() as f64 / (1024.0 * 1024.0 * 1024.0);
    let available = sys.available_memory() as f64 / (1024.0 * 1024.0 * 1024.0);
    HardwareInfo {
        total_ram_gb: (total * 10.0).round() / 10.0,
        available_ram_gb: (available * 10.0).round() / 10.0,
        cpu_cores: sys.cpus().len(),
    }
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
