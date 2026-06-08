//! Windows DPAPI wrappers for encrypting local data at rest (current-user scope).

#[cfg(windows)]
pub fn protect(data: &[u8]) -> Result<Vec<u8>, String> {
    use windows::Win32::Foundation::{LocalFree, HLOCAL};
    use windows::Win32::Security::Cryptography::{
        CryptProtectData, CRYPT_INTEGER_BLOB, CRYPTPROTECT_UI_FORBIDDEN,
    };

    if data.is_empty() {
        return Ok(Vec::new());
    }

    let mut data_in = CRYPT_INTEGER_BLOB {
        pbData: data.as_ptr() as *mut u8,
        cbData: data.len() as u32,
    };
    let mut data_out = CRYPT_INTEGER_BLOB::default();

    unsafe {
        CryptProtectData(
            &mut data_in,
            None,
            None,
            None,
            None,
            CRYPTPROTECT_UI_FORBIDDEN,
            &mut data_out,
        )
        .map_err(|e| format!("CryptProtectData: {e}"))?;

        let out =
            std::slice::from_raw_parts(data_out.pbData, data_out.cbData as usize).to_vec();
        if !data_out.pbData.is_null() {
            let _ = LocalFree(Some(HLOCAL(data_out.pbData as _)));
        }
        Ok(out)
    }
}

#[cfg(windows)]
pub fn unprotect(data: &[u8]) -> Result<Vec<u8>, String> {
    use windows::Win32::Foundation::{LocalFree, HLOCAL};
    use windows::Win32::Security::Cryptography::{
        CryptUnprotectData, CRYPT_INTEGER_BLOB, CRYPTPROTECT_UI_FORBIDDEN,
    };

    if data.is_empty() {
        return Ok(Vec::new());
    }

    let mut data_in = CRYPT_INTEGER_BLOB {
        pbData: data.as_ptr() as *mut u8,
        cbData: data.len() as u32,
    };
    let mut data_out = CRYPT_INTEGER_BLOB::default();

    unsafe {
        CryptUnprotectData(
            &mut data_in,
            None,
            None,
            None,
            None,
            CRYPTPROTECT_UI_FORBIDDEN,
            &mut data_out,
        )
        .map_err(|e| format!("CryptUnprotectData: {e}"))?;

        let out =
            std::slice::from_raw_parts(data_out.pbData, data_out.cbData as usize).to_vec();
        if !data_out.pbData.is_null() {
            let _ = LocalFree(Some(HLOCAL(data_out.pbData as _)));
        }
        Ok(out)
    }
}

#[cfg(not(windows))]
pub fn protect(data: &[u8]) -> Result<Vec<u8>, String> {
    Ok(data.to_vec())
}

#[cfg(not(windows))]
pub fn unprotect(data: &[u8]) -> Result<Vec<u8>, String> {
    Ok(data.to_vec())
}

#[cfg(all(test, windows))]
mod tests {
    use super::*;

    #[test]
    fn roundtrip_preserves_payload() {
        let plain = b"SQLite format 3\0secret context payload";
        let encrypted = protect(plain).expect("protect");
        assert_ne!(&encrypted[..], &plain[..]);
        let decrypted = unprotect(&encrypted).expect("unprotect");
        assert_eq!(decrypted, plain);
    }
}
