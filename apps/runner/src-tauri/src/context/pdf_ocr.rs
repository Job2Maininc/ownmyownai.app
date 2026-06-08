//! Local OCR fallback for scanned PDFs when `pdf-extract` yields insufficient text.
//! Uses omniparse classical OCR (pure Rust, no external binaries).

use lopdf::{Document, Object, ObjectId};
use omniparse::ocr::{run_ocr, OcrAttempt};
use omniparse::{extract_from_bytes, Content};
use std::collections::HashSet;
use std::sync::Once;

const MIN_TEXT_CHARS: usize = 20;

static INIT_OCR: Once = Once::new();

/// Enable omniparse classical OCR once per process (respects existing `OMNIPARSE_OCR`).
fn ensure_classical_ocr() {
    INIT_OCR.call_once(|| {
        if std::env::var("OMNIPARSE_OCR")
            .map(|v| v.is_empty())
            .unwrap_or(true)
        {
            std::env::set_var("OMNIPARSE_OCR", "classical");
        }
    });
}

pub fn extract_scanned_pdf(data: &[u8]) -> Result<String, String> {
    if !data.starts_with(b"%PDF") {
        return Err("Fichier PDF invalide ou corrompu.".into());
    }

    ensure_classical_ocr();

    if let Ok(result) = extract_from_bytes(data, Some("application/pdf")) {
        if let Ok(text) = content_to_text(&result.content) {
            let cleaned = normalize_whitespace(&text);
            if cleaned.len() >= MIN_TEXT_CHARS {
                return Ok(cleaned);
            }
        }
    }

    let text = ocr_embedded_jpeg_images(data)?;
    let cleaned = normalize_whitespace(&text);
    if cleaned.len() < MIN_TEXT_CHARS {
        return Err(
            "OCR local insuffisant sur ce PDF scanné. Exportez en .txt ou .md.".into(),
        );
    }
    Ok(cleaned)
}

fn content_to_text(content: &Content) -> Result<String, String> {
    match content {
        Content::Text(t) => Ok(t.clone()),
        _ => Err("Aucune couche texte dans ce PDF.".into()),
    }
}

fn normalize_whitespace(text: &str) -> String {
    text.split_whitespace().collect::<Vec<_>>().join(" ")
}

/// OCR every JPEG XObject embedded in page resources (typical scanned-PDF layout).
fn ocr_embedded_jpeg_images(data: &[u8]) -> Result<String, String> {
    let doc = Document::load_mem(data).map_err(|e| format!("PDF illisible : {e}"))?;
    let images = collect_jpeg_xobjects(&doc);
    if images.is_empty() {
        return Err("Aucune image JPEG intégrée détectée dans ce PDF.".into());
    }

    let mut parts = Vec::new();
    for (i, bytes) in images.iter().enumerate() {
        if let OcrAttempt::Recognized { text, .. } = run_ocr(bytes) {
            let trimmed = text.trim();
            if !trimmed.is_empty() {
                parts.push(format!("[page {}]\n{text}", i + 1));
            }
        }
    }

    if parts.is_empty() {
        return Err("OCR n'a reconnu aucun texte dans les images du PDF.".into());
    }
    Ok(parts.join("\n\n"))
}

fn collect_jpeg_xobjects(doc: &Document) -> Vec<Vec<u8>> {
    let mut out = Vec::new();
    let mut seen_ids = HashSet::new();

    for (_, page_id) in doc.get_pages() {
        let Ok(page) = doc.get_object(page_id) else {
            continue;
        };
        let Ok(page_dict) = page.as_dict() else {
            continue;
        };
        let Some(resources) = page_dict
            .get(b"Resources")
            .ok()
            .and_then(|v| dereference(doc, v))
            .and_then(|v| v.as_dict().ok())
        else {
            continue;
        };
        let Some(xobjects) = resources
            .get(b"XObject")
            .ok()
            .and_then(|v| dereference(doc, v))
            .and_then(|v| v.as_dict().ok())
        else {
            continue;
        };

        for (_, obj) in xobjects.iter() {
            let id = match obj {
                Object::Reference(r) => *r,
                _ => continue,
            };
            if !seen_ids.insert(id) {
                continue;
            }
            let Ok(obj) = doc.get_object(id) else {
                continue;
            };
            let Ok(stream) = obj.as_stream() else {
                continue;
            };
            let subtype = stream
                .dict
                .get(b"Subtype")
                .ok()
                .and_then(|v| v.as_name_str().ok())
                .unwrap_or("");
            if subtype != "Image" {
                continue;
            }

            let filters = stream.filters().unwrap_or_default();
            let filter_name = filters.first().map(String::as_str).unwrap_or("");
            if filter_name == "DCTDecode" {
                out.push(stream.content.clone());
            }
        }
    }

    out
}

fn dereference<'a>(doc: &'a Document, obj: &'a Object) -> Option<&'a Object> {
    match obj {
        Object::Reference(r) => doc.get_object(*r).ok(),
        other => Some(other),
    }
}
