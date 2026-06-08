use std::path::Path;
use std::process::Stdio;
use std::time::Duration;
use tokio::io::{AsyncBufReadExt, BufReader};
use tokio::process::Command;
use tokio::time::timeout;

/// Lance un sous-processus sans fenêtre console sur Windows.
pub fn command_hidden(program: impl AsRef<std::ffi::OsStr>) -> std::process::Command {
    let mut cmd = std::process::Command::new(program);
    #[cfg(windows)]
    {
        use std::os::windows::process::CommandExt;
        const CREATE_NO_WINDOW: u32 = 0x0800_0000;
        cmd.creation_flags(CREATE_NO_WINDOW);
    }
    cmd
}

fn command_hidden_async(program: impl AsRef<std::ffi::OsStr>) -> Command {
    let mut cmd = Command::from(command_hidden(program));
    cmd.kill_on_drop(true);
    cmd
}

pub const DEFAULT_COMMAND_TIMEOUT_SECS: u64 = 120;
pub const MAX_COMMAND_TIMEOUT_SECS: u64 = 600;

const ALLOWED_PROGRAMS: &[&str] = &[
    "git", "cargo", "npm", "npx", "node", "rg", "dir", "type", "where", "echo", "python", "py",
];

const FORBIDDEN_ARG_CHARS: &[char] = &[';', '|', '&', '`', '\n', '\r', '\0'];

#[derive(Debug, Clone)]
pub struct AllowlistedCommand {
    pub program: String,
    pub args: Vec<String>,
    pub cwd: Option<String>,
}

#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub enum OutputStream {
    Stdout,
    Stderr,
}

fn normalize_program_name(program: &str) -> String {
    let base = program
        .rsplit(['/', '\\'])
        .next()
        .unwrap_or(program)
        .trim();
    let lower = base.to_ascii_lowercase();
    lower
        .strip_suffix(".exe")
        .or_else(|| lower.strip_suffix(".cmd"))
        .or_else(|| lower.strip_suffix(".bat"))
        .unwrap_or(&lower)
        .to_string()
}

fn contains_forbidden_chars(value: &str) -> bool {
    value.chars().any(|c| FORBIDDEN_ARG_CHARS.contains(&c))
}

pub fn clamp_timeout_secs(requested: Option<u64>) -> u64 {
    requested
        .unwrap_or(DEFAULT_COMMAND_TIMEOUT_SECS)
        .clamp(1, MAX_COMMAND_TIMEOUT_SECS)
}

pub fn validate_allowlisted_command(cmd: &AllowlistedCommand) -> Result<(), String> {
    if cmd.program.trim().is_empty() {
        return Err("Programme requis".into());
    }

    if cmd.program.contains(['/', '\\']) {
        return Err("Chemin absolu interdit — utilisez un binaire de la liste blanche".into());
    }

    if contains_forbidden_chars(&cmd.program) {
        return Err("Caractères interdits dans le programme".into());
    }

    let normalized = normalize_program_name(&cmd.program);
    if !ALLOWED_PROGRAMS.contains(&normalized.as_str()) {
        return Err(format!(
            "Commande « {normalized} » non autorisée — seuls les binaires allowlistés sont acceptés"
        ));
    }

    for arg in &cmd.args {
        if contains_forbidden_chars(arg) {
            return Err("Caractères interdits dans les arguments".into());
        }
    }

    if let Some(cwd) = &cmd.cwd {
        let path = Path::new(cwd);
        if !path.is_absolute() {
            return Err("Le répertoire de travail doit être un chemin absolu".into());
        }
        if !path.is_dir() {
            return Err("Le répertoire de travail n'existe pas".into());
        }
    }

    Ok(())
}

pub async fn run_allowlisted_command<F>(
    cmd: &AllowlistedCommand,
    timeout_secs: u64,
    mut on_output: F,
) -> Result<i32, String>
where
    F: FnMut(OutputStream, &str) + Send,
{
    validate_allowlisted_command(cmd)?;

    let mut child = command_hidden_async(&cmd.program);
    child.args(&cmd.args);
    child.stdout(Stdio::piped());
    child.stderr(Stdio::piped());
    child.stdin(Stdio::null());

    if let Some(cwd) = &cmd.cwd {
        child.current_dir(cwd);
    }

    let mut child = child
        .spawn()
        .map_err(|e| format!("Impossible de lancer « {} » : {e}", cmd.program))?;

    let stdout = child
        .stdout
        .take()
        .ok_or_else(|| "stdout indisponible".to_string())?;
    let stderr = child
        .stderr
        .take()
        .ok_or_else(|| "stderr indisponible".to_string())?;

    let timeout_duration = Duration::from_secs(timeout_secs);
    let (line_tx, mut line_rx) =
        tokio::sync::mpsc::unbounded_channel::<(OutputStream, String)>();

    let run_result = timeout(timeout_duration, async {
        let stdout_tx = line_tx.clone();
        let stdout_task = tokio::spawn(async move {
            let mut reader = BufReader::new(stdout).lines();
            while let Ok(Some(line)) = reader.next_line().await {
                let _ = stdout_tx.send((OutputStream::Stdout, line));
            }
        });

        let stderr_tx = line_tx.clone();
        let stderr_task = tokio::spawn(async move {
            let mut reader = BufReader::new(stderr).lines();
            while let Ok(Some(line)) = reader.next_line().await {
                let _ = stderr_tx.send((OutputStream::Stderr, line));
            }
        });

        let status_fut = child.wait();
        tokio::pin!(status_fut);

        let status = loop {
            tokio::select! {
                line = line_rx.recv() => {
                    if let Some((stream, data)) = line {
                        on_output(stream, &data);
                    }
                }
                status = &mut status_fut => {
                    drop(line_tx);
                    break status.map_err(|e| format!("Erreur d'exécution : {e}"))?;
                }
            }
        };

        let _ = stdout_task.await;
        let _ = stderr_task.await;

        while let Some((stream, data)) = line_rx.recv().await {
            on_output(stream, &data);
        }

        Ok(status)
    })
    .await;

    match run_result {
        Ok(Ok(status)) => Ok(status.code().unwrap_or(-1)),
        Ok(Err(e)) => Err(e),
        Err(_) => Err(format!("Commande expirée après {timeout_secs} s (timeout)")),
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn rejects_unknown_program() {
        let cmd = AllowlistedCommand {
            program: "rm".into(),
            args: vec![],
            cwd: None,
        };
        assert!(validate_allowlisted_command(&cmd).is_err());
    }

    #[test]
    fn accepts_git_with_args() {
        let cmd = AllowlistedCommand {
            program: "git".into(),
            args: vec!["status".into()],
            cwd: None,
        };
        assert!(validate_allowlisted_command(&cmd).is_ok());
    }

    #[test]
    fn rejects_shell_injection_in_args() {
        let cmd = AllowlistedCommand {
            program: "git".into(),
            args: vec!["status; rm -rf /".into()],
            cwd: None,
        };
        assert!(validate_allowlisted_command(&cmd).is_err());
    }

    #[test]
    fn normalizes_windows_exe_name() {
        let cmd = AllowlistedCommand {
            program: "git.exe".into(),
            args: vec![],
            cwd: None,
        };
        assert!(validate_allowlisted_command(&cmd).is_ok());
    }
}
