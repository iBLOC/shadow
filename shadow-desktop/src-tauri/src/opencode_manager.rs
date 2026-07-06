use std::collections::HashMap;
use std::process::Stdio;
use std::sync::Arc;
use tokio::process::Command;
use tokio::sync::Mutex;
use serde::{Deserialize, Serialize};

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct OpenCodeInstance {
    pub id: String,
    pub port: u16,
    pub status: InstanceStatus,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub process_id: Option<u32>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(tag = "type")]
pub enum InstanceStatus {
    Starting,
    Running,
    Stopped,
    Error { message: String },
}

pub struct OpenCodeManager {
    instances: Arc<Mutex<HashMap<String, OpenCodeInstance>>>,
}

impl OpenCodeManager {
    pub fn new() -> Self {
        Self::default()
    }

    pub async fn launch(&self, port: Option<u16>) -> Result<OpenCodeInstance, String> {
        let port = port.unwrap_or_else(|| portpicker::pick_unused_port().unwrap_or(4096));
        let id = uuid::Uuid::new_v4().to_string();

        if !Self::check_installed().await {
            return Err("OpenCode is not installed. Use opencode_install first.".to_string());
        }

        let child = Command::new("opencode")
            .args(["serve", "--port", &port.to_string()])
            .stdout(Stdio::piped())
            .stderr(Stdio::piped())
            .spawn()
            .map_err(|e| format!("Failed to spawn opencode: {}", e))?;

        let process_id = child.id().unwrap_or(0);
        
        let instance = OpenCodeInstance {
            id: id.clone(),
            port,
            status: InstanceStatus::Running,
            process_id: if process_id == 0 { None } else { Some(process_id) },
        };

        let mut instances = self.instances.lock().await;
        instances.insert(id.clone(), instance);

        Ok(OpenCodeInstance {
            id,
            port,
            status: InstanceStatus::Running,
            process_id: None,
        })
    }

    pub async fn check_installed() -> bool {
        Command::new("opencode")
            .arg("--version")
            .output()
            .await
            .map(|o| o.status.success())
            .unwrap_or(false)
    }

    pub async fn install() -> Result<(), String> {
        let output = Command::new("sh")
            .args(["-c", "curl -fsSL https://raw.githubusercontent.com/anomalyco/opencode/main/install.sh | sh"])
            .output()
            .await
            .map_err(|e| format!("Install script failed: {}", e))?;

        if !output.status.success() {
            return Err("Installation failed".to_string());
        }
        Ok(())
    }

    pub async fn stop(&self, id: &str) -> Result<(), String> {
        let mut instances = self.instances.lock().await;
        if let Some(instance) = instances.get_mut(id) {
            if let Some(pid) = instance.process_id {
                #[cfg(unix)]
                {
                    Command::new("kill")
                        .arg(pid.to_string())
                        .output()
                        .await
                        .map_err(|e| e.to_string())?;
                }
            }
            instance.status = InstanceStatus::Stopped;
        }
        Ok(())
    }

    pub async fn list_instances(&self) -> Vec<OpenCodeInstance> {
        let instances = self.instances.lock().await;
        instances.values().cloned().collect()
    }

    pub async fn create_session(&self, instance_id: &str, _project_path: &str) -> Result<String, String> {
        let instance = self.instances.lock().await;
        let inst = instance.get(instance_id).ok_or("Instance not found")?;

        let url = format!("http://127.0.0.1:{}/session", inst.port);
        let client = reqwest::Client::new();

        #[derive(Serialize)]
        struct CreateSessionRequest {
            title: String,
        }

        #[derive(Deserialize)]
        struct CreateSessionResponse {
            id: String,
        }

        let resp = client.post(&url)
            .json(&CreateSessionRequest { title: "task".to_string() })
            .send()
            .await
            .map_err(|e| e.to_string())?;

        if !resp.status().is_success() {
            return Err(format!("API error: {}", resp.status()));
        }

        let session: CreateSessionResponse = resp.json().await
            .map_err(|e| e.to_string())?;

        Ok(session.id)
    }

    pub async fn send_message(&self, instance_id: &str, session_id: &str, message: &str) -> Result<String, String> {
        let instance = self.instances.lock().await;
        let inst = instance.get(instance_id).ok_or("Instance not found")?;

        let url = format!("http://127.0.0.1:{}/session/{}/message", inst.port, session_id);
        let client = reqwest::Client::new();

        #[derive(Serialize)]
        struct MessageRequest {
            parts: Vec<serde_json::Value>,
        }

        let resp = client.post(&url)
            .json(&MessageRequest {
                parts: vec![serde_json::json!({ "type": "text", "text": message })],
            })
            .send()
            .await
            .map_err(|e| e.to_string())?;

        if !resp.status().is_success() {
            return Err(format!("API error: {}", resp.status()));
        }

        #[derive(Deserialize)]
        struct MessageResponse {
            info: serde_json::Value,
        }

        let result: MessageResponse = resp.json().await
            .map_err(|e| e.to_string())?;

        Ok(serde_json::to_string(&result.info).unwrap_or_default())
    }
}

impl Default for OpenCodeManager {
    fn default() -> Self {
        Self {
            instances: Arc::new(Mutex::new(HashMap::new())),
        }
    }
}
