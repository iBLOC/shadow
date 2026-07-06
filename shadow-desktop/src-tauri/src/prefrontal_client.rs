use std::sync::Arc;
use tokio::sync::RwLock;
use serde::{Serialize, Deserialize};

#[derive(Debug, Clone, Serialize, Deserialize)]
#[allow(dead_code)]
pub struct AgentCard {
    pub id: String,
    pub name: String,
    pub description: String,
    pub model: String,
    pub skills: Vec<String>,
    pub is_online: bool,
}

pub struct PrefrontalState {
    client: Arc<RwLock<PrefrontalClient>>,
    #[allow(dead_code)]
    base_url: Arc<RwLock<String>>,
}

struct PrefrontalClient {
    base_url: String,
}

impl PrefrontalClient {
    fn new(base_url: String) -> Self {
        Self { base_url }
    }
}

impl PrefrontalState {
    pub fn new() -> Self {
        let base = std::env::var("CORTEX_URL")
            .unwrap_or_else(|_| "http://127.0.0.1:8443".to_string());
        Self {
            client: Arc::new(RwLock::new(PrefrontalClient::new(base.clone()))),
            base_url: Arc::new(RwLock::new(base)),
        }
    }

    #[allow(dead_code)]
    pub async fn set_base_url(&self, url: String) {
        *self.base_url.write().await = url.clone();
        *self.client.write().await = PrefrontalClient::new(url);
    }

    pub async fn list_agents(&self) -> Vec<serde_json::Value> {
        let client = self.client.read().await;
        let url = format!("{}/shadow/v1/agents", client.base_url);
        match reqwest::get(&url).await {
            Ok(resp) if resp.status().is_success() => {
                if let Ok(body) = resp.json::<serde_json::Value>().await {
                    if let Some(agents) = body.get("agents").and_then(|a| a.as_array()) {
                        return agents.iter()
                            .filter_map(|a| {
                                let card = a.get("agent_card")?;
                                Some(serde_json::json!({
                                    "id": card.get("name")?.as_str().unwrap_or(""),
                                    "name": card.get("name")?.as_str().unwrap_or(""),
                                    "description": card.get("description")?.as_str().unwrap_or(""),
                                    "model": "unknown",
                                    "skills": card.get("metadata")
                                        .and_then(|m| m.get("capabilities"))
                                        .and_then(|c| c.as_array())
                                        .map(|arr| arr.iter().filter_map(|v| v.as_str().map(String::from)).collect::<Vec<_>>())
                                        .unwrap_or_default(),
                                    "is_online": a.get("health_status").and_then(|s| s.as_str()) == Some("healthy"),
                                }))
                            })
                            .collect();
                    }
                }
            }
            _ => {}
        }
        Vec::new()
    }

    pub async fn create_session(&self) -> Result<String, String> {
        let client = self.client.read().await;
        let url = format!("{}/shadow/v1/conversations", client.base_url);
        let client_http = reqwest::Client::new();
        match client_http.post(&url).json(&serde_json::json!({})).send().await {
            Ok(resp) if resp.status().is_success() => {
                if let Ok(body) = resp.json::<serde_json::Value>().await {
                    if let Some(id) = body.get("id").and_then(|v| v.as_str()) {
                        return Ok(id.to_string());
                    }
                }
                Err("missing id in response".to_string())
            }
            Ok(resp) => Err(format!("HTTP {}", resp.status())),
            Err(e) => Err(format!("cortex unreachable: {}", e)),
        }
    }

    pub async fn list_sessions(&self) -> Result<Vec<String>, String> {
        Ok(Vec::new())
    }

    pub async fn delete_session(&self, _session_id: &str) -> Result<bool, String> {
        Ok(true)
    }

    pub async fn process(&self, _session_id: &str, _message: &str) -> Result<String, String> {
        Err("use cortex /shadow/v1/conversations/{id}/messages:stream instead".to_string())
    }
}

impl Default for PrefrontalState {
    fn default() -> Self {
        Self::new()
    }
}