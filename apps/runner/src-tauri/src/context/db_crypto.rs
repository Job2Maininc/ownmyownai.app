use super::{context_db_path, context_encrypted_db_path};
use crate::dpapi;
use std::fs;
use std::path::Path;

const SQLITE_MAGIC: &[u8] = b"SQLite format 3\0";

fn is_plain_sqlite_file(path: &Path) -> bool {
    let Ok(bytes) = fs::read(path) else {
        return false;
    };
    bytes.len() >= SQLITE_MAGIC.len() && bytes.starts_with(SQLITE_MAGIC)
}

fn cleanup_working_db_files(work_path: &Path) {
    let _ = fs::remove_file(work_path);
    let base = work_path.to_string_lossy();
    let _ = fs::remove_file(format!("{base}-wal"));
    let _ = fs::remove_file(format!("{base}-shm"));
}

/// Migrates legacy plaintext `context.db` to DPAPI-backed `context.db.enc`.
pub fn migrate_plain_to_encrypted_if_needed() -> Result<(), String> {
    #[cfg(not(windows))]
    {
        return Ok(());
    }

    #[cfg(windows)]
    {
        let work_path = context_db_path();
        let enc_path = context_encrypted_db_path();

        if enc_path.exists() {
            if work_path.exists() && is_plain_sqlite_file(&work_path) {
                cleanup_working_db_files(&work_path);
            }
            return Ok(());
        }

        if !work_path.exists() || !is_plain_sqlite_file(&work_path) {
            return Ok(());
        }

        persist_encrypted_from_working(&work_path, &enc_path)?;
        cleanup_working_db_files(&work_path);
        Ok(())
    }
}

/// Decrypts `context.db.enc` into the ephemeral working `context.db` when needed.
pub fn ensure_decrypted_working_db() -> Result<(), String> {
    #[cfg(not(windows))]
    {
        return Ok(());
    }

    #[cfg(windows)]
    {
        let work_path = context_db_path();
        let enc_path = context_encrypted_db_path();

        if work_path.exists() {
            return Ok(());
        }

        if !enc_path.exists() {
            return Ok(());
        }

        let encrypted = fs::read(&enc_path).map_err(|e| e.to_string())?;
        let plain = dpapi::unprotect(&encrypted)?;
        if let Some(parent) = work_path.parent() {
            fs::create_dir_all(parent).map_err(|e| e.to_string())?;
        }
        fs::write(&work_path, plain).map_err(|e| e.to_string())?;
        Ok(())
    }
}

/// Checkpoints SQLite and writes the working DB back as DPAPI ciphertext.
pub fn persist_encrypted_working_db() -> Result<(), String> {
    #[cfg(not(windows))]
    {
        return Ok(());
    }

    #[cfg(windows)]
    {
        let work_path = context_db_path();
        let enc_path = context_encrypted_db_path();
        if !work_path.exists() {
            return Ok(());
        }
        persist_encrypted_from_working(&work_path, &enc_path)?;
        cleanup_working_db_files(&work_path);
        Ok(())
    }
}

#[cfg(windows)]
fn persist_encrypted_from_working(work_path: &Path, enc_path: &Path) -> Result<(), String> {
    let data = fs::read(work_path).map_err(|e| e.to_string())?;
    let encrypted = dpapi::protect(&data)?;
    if let Some(parent) = enc_path.parent() {
        fs::create_dir_all(parent).map_err(|e| e.to_string())?;
    }
    fs::write(enc_path, encrypted).map_err(|e| e.to_string())?;
    Ok(())
}
