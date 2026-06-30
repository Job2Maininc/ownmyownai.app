//! DOCX text extraction for RAG ingestion (OOXML / ZIP).

use omniparse::{extract_from_bytes, Content};
use quick_xml::events::Event;
use quick_xml::Reader;
use std::io::{Cursor, Read, Write};

const DOCX_MIME: &str =
    "application/vnd.openxmlformats-officedocument.wordprocessingml.document";
const MIN_TEXT_CHARS: usize = 20;

/// Extract plain text from a `.docx` byte buffer.
pub fn extract_docx_text(data: &[u8]) -> Result<String, String> {
    if let Ok(text) = extract_via_omniparse(data) {
        return Ok(text);
    }
    extract_via_zip_xml(data)
}

fn extract_via_omniparse(data: &[u8]) -> Result<String, String> {
    let result = extract_from_bytes(data, Some(DOCX_MIME))
        .map_err(|e| format!("DOCX illisible : {e}"))?;
    let text = match &result.content {
        Content::Text(t) => t.clone(),
        _ => return Err("DOCX sans couche texte.".into()),
    };
    validate_extracted_text(&text)
}

fn extract_via_zip_xml(data: &[u8]) -> Result<String, String> {
    let cursor = Cursor::new(data);
    let mut archive = zip::ZipArchive::new(cursor).map_err(|e| e.to_string())?;
    let mut parts = Vec::new();

    for i in 0..archive.len() {
        let mut file = archive.by_index(i).map_err(|e| e.to_string())?;
        let name = file.name();
        if !name.starts_with("word/") || !name.ends_with(".xml") {
            continue;
        }
        if name.contains("/_rels/") || name.ends_with(".rels") {
            continue;
        }
        let mut xml = String::new();
        file.read_to_string(&mut xml).map_err(|e| e.to_string())?;
        let chunk = extract_word_xml_text(&xml);
        if !chunk.is_empty() {
            parts.push(chunk);
        }
    }

    if parts.is_empty() {
        return Err("DOCX invalide (document.xml introuvable)".into());
    }

    validate_extracted_text(&parts.join(" "))
}

fn extract_word_xml_text(xml: &str) -> String {
    let mut reader = Reader::from_str(xml);
    reader.config_mut().trim_text(true);
    let mut buf = Vec::new();
    let mut in_text = false;
    let mut out = String::new();

    loop {
        match reader.read_event_into(&mut buf) {
            Ok(Event::Start(ref e)) if e.local_name().as_ref() == b"t" => in_text = true,
            Ok(Event::End(ref e)) if e.local_name().as_ref() == b"t" => in_text = false,
            Ok(Event::Text(ref e)) if in_text => {
                if let Ok(fragment) = e.unescape() {
                    out.push_str(&fragment);
                    out.push(' ');
                }
            }
            Ok(Event::Eof) => break,
            Err(_) => break,
            _ => {}
        }
        buf.clear();
    }

    out
}

fn validate_extracted_text(text: &str) -> Result<String, String> {
    let cleaned = normalize_whitespace(text);
    if cleaned.len() < MIN_TEXT_CHARS {
        return Err("DOCX vide ou illisible.".into());
    }
    Ok(cleaned)
}

fn normalize_whitespace(text: &str) -> String {
    text.split_whitespace().collect::<Vec<_>>().join(" ")
}

#[cfg(test)]
mod tests {
    use super::*;
    use std::io::Cursor;
    use zip::write::SimpleFileOptions;
    use zip::ZipWriter;

    fn sample_docx_bytes(body_text: &str) -> Vec<u8> {
        let document_xml = format!(
            r#"<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<w:document xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main">
  <w:body>
    <w:p><w:r><w:t>{body_text}</w:t></w:r></w:p>
  </w:body>
</w:document>"#
        );
        let content_types = r#"<?xml version="1.0" encoding="UTF-8"?>
<Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types">
  <Default Extension="xml" ContentType="application/xml"/>
</Types>"#;

        let mut buf = Vec::new();
        {
            let cursor = Cursor::new(&mut buf);
            let mut zip = ZipWriter::new(cursor);
            let options = SimpleFileOptions::default();

            zip.start_file("word/document.xml", options).unwrap();
            zip.write_all(document_xml.as_bytes()).unwrap();

            zip.start_file("[Content_Types].xml", options).unwrap();
            zip.write_all(content_types.as_bytes()).unwrap();

            zip.finish().unwrap();
        }
        buf
    }

    #[test]
    fn extracts_text_from_minimal_docx_zip() {
        let data = sample_docx_bytes("Contrat de prestation de services pour l'année 2024.");
        let text = extract_docx_text(&data).expect("docx extraction");
        assert!(text.contains("Contrat"));
        assert!(text.contains("2024"));
    }

    #[test]
    fn rejects_empty_docx() {
        let data = sample_docx_bytes("court");
        let err = extract_docx_text(&data).unwrap_err();
        assert!(err.contains("vide") || err.contains("illisible"));
    }
}
