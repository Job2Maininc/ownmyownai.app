use std::path::Path;

pub const IMAGE_DESCRIBE_PROMPT: &str =
    "Décris cette image en détail en français : sujets, texte visible, couleurs, contexte. Sois factuel et concis.";

pub fn is_image_filename(filename: &str) -> bool {
    let lower = filename.to_lowercase();
    lower.ends_with(".png")
        || lower.ends_with(".jpg")
        || lower.ends_with(".jpeg")
}

pub fn is_image_path(path: &Path) -> bool {
    path.file_name()
        .and_then(|n| n.to_str())
        .map(is_image_filename)
        .unwrap_or(false)
}

pub fn image_mime_type(filename: &str) -> &'static str {
    let lower = filename.to_lowercase();
    if lower.ends_with(".png") {
        "image/png"
    } else {
        "image/jpeg"
    }
}

pub fn document_media_type(filename: &str) -> &'static str {
    if is_image_filename(filename) {
        "image"
    } else if crate::media::is_audio_filename(filename) {
        "audio"
    } else {
        "text"
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn detects_image_extensions() {
        assert!(is_image_filename("photo.PNG"));
        assert!(is_image_filename("scan.jpg"));
        assert!(is_image_filename("pic.jpeg"));
        assert!(!is_image_filename("notes.md"));
    }

    #[test]
    fn assigns_media_type() {
        assert_eq!(document_media_type("a.png"), "image");
        assert_eq!(document_media_type("b.pdf"), "text");
    }
}
