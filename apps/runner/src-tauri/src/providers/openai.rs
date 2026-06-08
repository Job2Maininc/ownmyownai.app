use std::time::Duration;

const OPENAI_CHAT_URL: &str = "https://api.openai.com/v1/chat/completions";

fn http_client() -> Result<reqwest::Client, String> {
    reqwest::Client::builder()
        .connect_timeout(Duration::from_secs(15))
        .timeout(Duration::from_secs(600))
        .build()
        .map_err(|e| e.to_string())
}

pub async fn stream_chat(
    api_key: &str,
    model: &str,
    messages: &[serde_json::Value],
) -> Result<reqwest::Response, String> {
    let client = http_client()?;
    let body = serde_json::json!({
        "model": model,
        "messages": messages,
        "stream": true,
    });

    let response = client
        .post(OPENAI_CHAT_URL)
        .header("Authorization", format!("Bearer {api_key}"))
        .json(&body)
        .send()
        .await
        .map_err(|e| {
            if e.is_connect() {
                "Impossible de joindre l'API OpenAI. Vérifiez votre connexion.".to_string()
            } else if e.is_timeout() {
                "L'API OpenAI met trop de temps à répondre.".to_string()
            } else {
                e.to_string()
            }
        })?;

    if !response.status().is_success() {
        let status = response.status();
        let detail = response.text().await.unwrap_or_default();
        return Err(format!(
            "OpenAI a renvoyé une erreur ({status}) : {detail}"
        ));
    }

    Ok(response)
}
