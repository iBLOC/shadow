use prefrontal_core_lib::{Prefrontal, PrefrontalConfig, AgentStore};
use std::sync::Arc;
use tokio::sync::RwLock;

pub struct PrefrontalState {
    pub client: Arc<RwLock<Prefrontal>>,
    pub agent_store: Arc<AgentStore>,
}

impl PrefrontalState {
    pub fn new() -> Self {
        let client = Prefrontal::new(PrefrontalConfig::default())
            .expect("Failed to create Prefrontal client");
        Self {
            client: Arc::new(RwLock::new(client)),
            agent_store: Arc::new(AgentStore::new()),
        }
    }

    pub async fn initialize(&self, config: PrefrontalConfig) -> Result<(), String> {
        let client = Prefrontal::new(config).map_err(|e| e.to_string())?;
        client.initialize().await.map_err(|e| e.to_string())?;
        *self.client.write().await = client;
        Ok(())
    }

    pub async fn create_session(&self) -> Result<String, String> {
        Ok(self.client.read().await.create_session())
    }

    pub async fn list_sessions(&self) -> Result<Vec<String>, String> {
        Ok(self.client.read().await.list_sessions())
    }

    pub async fn delete_session(&self, session_id: &str) -> Result<bool, String> {
        Ok(self.client.read().await.delete_session(session_id))
    }

    pub async fn process(&self, session_id: &str, message: &str) -> Result<String, String> {
        self.client.read().await
            .process(session_id, message)
            .await
            .map_err(|e| e.to_string())
    }

    pub async fn process_with_tools(&self, session_id: &str, message: &str) -> Result<String, String> {
        self.client.read().await
            .process_with_tools(session_id, message)
            .await
            .map_err(|e| e.to_string())
    }

    pub fn list_agents(&self) -> Vec<serde_json::Value> {
        self.agent_store.list()
            .into_iter()
            .map(|agent| serde_json::json!({
                "id": agent.id,
                "name": agent.name,
                "description": agent.description,
                "model": agent.model,
                "skills": agent.skills,
                "is_online": agent.is_online,
            }))
            .collect()
    }
}

impl Default for PrefrontalState {
    fn default() -> Self {
        Self::new()
    }
}
