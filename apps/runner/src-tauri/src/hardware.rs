use crate::process::command_hidden;
use serde::Serialize;
use std::collections::HashMap;
use std::path::{Path, PathBuf};
use std::sync::{LazyLock, Mutex};
use std::time::{Duration, Instant};
use sysinfo::{Disks, System};

const DISK_CACHE_TTL: Duration = Duration::from_secs(45);

static DISK_FREE_CACHE: LazyLock<Mutex<HashMap<PathBuf, (f64, Instant)>>> =
    LazyLock::new(|| Mutex::new(HashMap::new()));

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
    let output = command_hidden("powershell")
        .args([
            "-NoProfile",
            "-WindowStyle",
            "Hidden",
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

pub fn cached_disk_free_gb_for_path(path: &Path) -> Option<f64> {
    let key = path.to_path_buf();
    if let Ok(cache) = DISK_FREE_CACHE.lock() {
        if let Some((value, at)) = cache.get(&key) {
            if at.elapsed() < DISK_CACHE_TTL {
                return Some(*value);
            }
        }
    }

    let value = disk_free_gb_for_path(path)?;
    if let Ok(mut cache) = DISK_FREE_CACHE.lock() {
        cache.insert(key, (value, Instant::now()));
    }
    Some(value)
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

#[derive(Debug, Clone, Serialize, PartialEq)]
#[serde(rename_all = "camelCase")]
pub struct QuantizationAdvice {
    pub quantization: String,
    pub ollama_tag: String,
    pub estimated_size_gb: f64,
    pub estimated_ram_gb: f64,
    pub disk_free_gb: Option<f64>,
    pub message: String,
    pub reason: String,
}

const Q4_TAG: &str = "q4_K_M";
const Q8_TAG: &str = "q8_0";
const DISK_HEADROOM: f64 = 1.2;
const RAM_HEADROOM: f64 = 1.25;

fn parse_param_billions(model: &str) -> Option<f64> {
    let token = model.rsplit(':').next().unwrap_or(model).to_lowercase();

    if let Some(x_idx) = token.find('x') {
        if token.ends_with('b') {
            let a = token[..x_idx].parse::<f64>().ok()?;
            let b = token[x_idx + 1..token.len() - 1].parse::<f64>().ok()?;
            return Some(a * b);
        }
    }

    if token.ends_with('b') {
        return token[..token.len() - 1].parse().ok();
    }

    None
}

fn footprint_gb(param_b: f64, quantization: &str) -> (f64, f64) {
    let (size_factor, ram_factor) = if quantization == "q8" {
        (1.1, 1.8)
    } else {
        (0.55, 1.0)
    };
    let size = (param_b * size_factor * 10.0).round() / 10.0;
    let ram = (param_b * ram_factor * 10.0).round() / 10.0;
    (size, ram)
}

/// VRAM minimale recommandée pour MusicGen small/medium sur GPU.
pub const MUSICGEN_MIN_VRAM_GB: f64 = 4.0;

#[derive(Debug, Clone, Serialize, PartialEq)]
#[serde(rename_all = "camelCase")]
pub struct MusicDeviceAdvice {
    pub device: String,
    pub gpu_name: Option<String>,
    pub vram_gb: Option<f64>,
    pub message: String,
}

fn best_discrete_gpu(gpus: &[GpuInfo]) -> Option<&GpuInfo> {
    gpus.iter()
        .filter(|g| g.kind == "discrete")
        .max_by(|a, b| {
            a.vram_gb
                .unwrap_or(0.0)
                .partial_cmp(&b.vram_gb.unwrap_or(0.0))
                .unwrap_or(std::cmp::Ordering::Equal)
        })
}

/// Choisit `cuda` si un GPU discret avec assez de VRAM est détecté, sinon `cpu`.
pub fn advise_music_device(force_cpu: bool) -> MusicDeviceAdvice {
    if force_cpu {
        return MusicDeviceAdvice {
            device: "cpu".into(),
            gpu_name: None,
            vram_gb: None,
            message: "CPU forcé dans les paramètres Host.".into(),
        };
    }

    let hw = get_hardware_info();
    if let Some(gpu) = best_discrete_gpu(&hw.gpus) {
        let vram = gpu.vram_gb.unwrap_or(0.0);
        if vram >= MUSICGEN_MIN_VRAM_GB {
            return MusicDeviceAdvice {
                device: "cuda".into(),
                gpu_name: Some(gpu.name.clone()),
                vram_gb: gpu.vram_gb,
                message: format!(
                    "GPU {name} (~{vram:.1} Go VRAM) — accélération CUDA activée",
                    name = gpu.name,
                    vram = vram
                ),
            };
        }
        return MusicDeviceAdvice {
            device: "cpu".into(),
            gpu_name: Some(gpu.name.clone()),
            vram_gb: gpu.vram_gb,
            message: format!(
                "VRAM insuffisante sur {name} ({vram:.1} Go < {min:.0} Go) — repli CPU",
                name = gpu.name,
                vram = vram,
                min = MUSICGEN_MIN_VRAM_GB
            ),
        };
    }

    MusicDeviceAdvice {
        device: "cpu".into(),
        gpu_name: None,
        vram_gb: None,
        message: "Aucun GPU discret détecté — génération sur CPU (plus lente).".into(),
    }
}

pub fn advise_quantization(model_name: &str, disk_free_gb: Option<f64>) -> QuantizationAdvice {
    let hw = get_hardware_info();
    advise_quantization_for_hardware(model_name, disk_free_gb, hw.total_ram_gb)
}

pub fn advise_quantization_for_hardware(
    model_name: &str,
    disk_free_gb: Option<f64>,
    total_ram_gb: f64,
) -> QuantizationAdvice {
    let param_b = parse_param_billions(model_name).unwrap_or(1.0);
    let (q4_size, q4_ram) = footprint_gb(param_b, "q4");
    let (q8_size, q8_ram) = footprint_gb(param_b, "q8");

    let q8_ram_ok = total_ram_gb >= q8_ram * RAM_HEADROOM;
    let q8_disk_ok = disk_free_gb
        .map(|d| d >= q8_size * DISK_HEADROOM)
        .unwrap_or(true);
    let prefer_q8 =
        q8_ram_ok && q8_disk_ok && param_b <= 14.0 && total_ram_gb >= 16.0;

    let (quantization, ollama_tag, estimated_size_gb, estimated_ram_gb, reason) = if prefer_q8 {
        (
            "q8".to_string(),
            Q8_TAG.to_string(),
            q8_size,
            q8_ram,
            format!(
                "{:.0} Go RAM et espace disque suffisant pour une meilleure fidélité",
                total_ram_gb
            ),
        )
    } else {
        let mut reason = format!("{:.0} Go RAM — privilégier un modèle compact", total_ram_gb);
        if let Some(disk) = disk_free_gb {
            if disk < q4_size * DISK_HEADROOM {
                reason = format!(
                    "Espace disque limité ({disk:.1} Go libres) — Q4 minimise la taille"
                );
            }
        }
        if !q8_ram_ok && total_ram_gb >= 16.0 {
            reason = format!(
                "Modèle ~{param_b:.0}B — Q8 nécessiterait ~{q8_ram:.0} Go RAM"
            );
        }
        (
            "q4".to_string(),
            Q4_TAG.to_string(),
            q4_size,
            q4_ram,
            reason,
        )
    };

    let disk_hint = disk_free_gb
        .map(|d| format!("{d:.1} Go libres sur le disque des modèles"))
        .unwrap_or_else(|| "espace disque non mesuré".to_string());

    let message = if quantization == "q8" {
        format!(
            "Recommandation : {Q8_TAG} (~{estimated_size_gb:.1} Go, ~{estimated_ram_gb:.0} Go RAM). {disk_hint}."
        )
    } else {
        format!(
            "Recommandation : {Q4_TAG} (~{estimated_size_gb:.1} Go, ~{estimated_ram_gb:.0} Go RAM). {disk_hint}."
        )
    };

    QuantizationAdvice {
        quantization,
        ollama_tag,
        estimated_size_gb,
        estimated_ram_gb,
        disk_free_gb,
        message,
        reason,
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn parse_param_billions_handles_common_tags() {
        assert_eq!(parse_param_billions("llama3.2:3b"), Some(3.0));
        assert_eq!(parse_param_billions("llama3.1:8b"), Some(8.0));
        assert_eq!(parse_param_billions("mixtral:8x7b"), Some(56.0));
        assert_eq!(parse_param_billions("moondream:1.8b"), Some(1.8));
        assert_eq!(parse_param_billions("nomic-embed-text"), None);
    }

    #[test]
    fn advises_q4_on_low_ram() {
        let advice = advise_quantization_for_hardware("llama3.1:8b", Some(100.0), 8.0);
        assert_eq!(advice.quantization, "q4");
        assert_eq!(advice.ollama_tag, Q4_TAG);
        assert!(advice.message.contains(Q4_TAG));
    }

    #[test]
    fn advises_q8_when_ram_and_disk_allow() {
        let advice = advise_quantization_for_hardware("llama3.2:3b", Some(50.0), 32.0);
        assert_eq!(advice.quantization, "q8");
        assert_eq!(advice.ollama_tag, Q8_TAG);
    }

    #[test]
    fn footprint_scales_with_params() {
        let (q4_size, q4_ram) = footprint_gb(7.0, "q4");
        let (q8_size, q8_ram) = footprint_gb(7.0, "q8");
        assert!(q8_size > q4_size);
        assert!(q8_ram > q4_ram);
    }

    #[test]
    fn music_device_forces_cpu_when_requested() {
        let advice = advise_music_device(true);
        assert_eq!(advice.device, "cpu");
        assert!(advice.message.contains("CPU forcé"));
    }

    #[test]
    fn music_device_falls_back_cpu_without_discrete_gpu() {
        let advice = advise_music_device(false);
        if get_hardware_info().has_discrete_gpu {
            assert!(advice.device == "cuda" || advice.device == "cpu");
        } else {
            assert_eq!(advice.device, "cpu");
        }
    }
}
