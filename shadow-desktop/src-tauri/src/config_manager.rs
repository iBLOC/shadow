use serde::{Deserialize, Serialize};
use std::fs;
use std::path::PathBuf;
use std::sync::Arc;
use tokio::sync::Mutex;

#[derive(Debug, Clone, Serialize, Deserialize, Default)]
pub struct AppConfig {
    pub password_hash: String,
    pub db_type: String,
    pub db_config: DatabaseConfig,
    pub setup_complete: bool,
    pub setup_step: String,
    pub provider_config: ProviderConfig,
}

#[derive(Debug, Clone, Serialize, Deserialize, Default)]
pub struct ProviderConfig {
    pub provider_type: String,
    pub name: String,
    pub api_base: String,
    pub api_key: Option<String>,
}

#[derive(Debug, Clone, Serialize, Deserialize, Default)]
pub struct DatabaseConfig {
    pub host: Option<String>,
    pub port: Option<u16>,
    pub username: Option<String>,
    pub password: Option<String>,
    pub database: Option<String>,
}

#[derive(Default)]
pub struct ConfigManager {
    config: AppConfig,
    config_path: PathBuf,
}

impl ConfigManager {
    pub fn new() -> Self {
        let config_path = dirs::config_dir()
            .unwrap_or_else(|| PathBuf::from("."))
            .join("shadow")
            .join("config.json");

        let config = if config_path.exists() {
            fs::read_to_string(&config_path)
                .ok()
                .and_then(|s| serde_json::from_str(&s).ok())
                .unwrap_or_default()
        } else {
            AppConfig {
                password_hash: String::new(),
                db_type: String::new(),
                db_config: DatabaseConfig::default(),
                setup_complete: false,
                setup_step: String::new(),
                provider_config: ProviderConfig::default(),
            }
        };

        Self { config, config_path }
    }

    pub fn save(&self) -> Result<(), String> {
        if let Some(parent) = self.config_path.parent() {
            fs::create_dir_all(parent).map_err(|e| e.to_string())?;
        }
        let json = serde_json::to_string_pretty(&self.config).map_err(|e| e.to_string())?;
        fs::write(&self.config_path, json).map_err(|e| e.to_string())
    }

    pub fn get_config(&self) -> &AppConfig {
        &self.config
    }

    pub fn update_password_hash(&mut self, hash: String) {
        self.config.password_hash = hash;
    }

    pub fn update_db_config(&mut self, db_type: String, db_config: DatabaseConfig) {
        self.config.db_type = db_type;
        self.config.db_config = db_config;
    }

    pub fn mark_setup_complete(&mut self) {
        self.config.setup_complete = true;
    }

    pub fn is_setup_complete(&self) -> bool {
        self.config.setup_complete
    }
}

pub struct SecureAuth {
    config: Arc<Mutex<ConfigManager>>,
}

impl SecureAuth {
    pub fn new() -> Self {
        Self {
            config: Arc::new(Mutex::new(ConfigManager::new())),
        }
    }

    pub async fn set_password(&self, password: &str, machine_id: &str) -> Result<String, String> {
        let salted = format!("{}:{}", machine_id, password);
        let hash = format!("{:x}", md5::compute(salted.as_bytes()));

        let mut config = self.config.lock().await;
        config.update_password_hash(hash.clone());
        config.save()?;
        Ok(hash)
    }

    pub async fn verify_password(&self, password: &str, machine_id: &str) -> Result<bool, String> {
        let config = self.config.lock().await;
        let salted = format!("{}:{}", machine_id, password);
        let hash = format!("{:x}", md5::compute(salted.as_bytes()));
        Ok(config.get_config().password_hash == hash)
    }

    pub async fn get_machine_id(&self) -> String {
        let _config = self.config.lock().await;
        format!("{:x}", md5::compute(format!("{:?}", std::env::consts::ARCH)))
    }

    pub async fn save_db_config(&self, db_type: &str, db_config: DatabaseConfig) -> Result<(), String> {
        let mut config = self.config.lock().await;
        config.update_db_config(db_type.to_string(), db_config);
        config.save()
    }

    pub async fn mark_setup_complete(&self) -> Result<(), String> {
        let mut config = self.config.lock().await;
        config.mark_setup_complete();
        config.save()
    }

    pub async fn is_setup_complete(&self) -> bool {
        let config = self.config.lock().await;
        config.is_setup_complete()
    }

    pub async fn get_config(&self) -> AppConfig {
        let config = self.config.lock().await;
        config.get_config().clone()
    }

    pub async fn save_provider_config(&self, provider_config: ProviderConfig) -> Result<(), String> {
        let mut config = self.config.lock().await;
        config.config.provider_config = provider_config;
        config.save()
    }

    pub async fn get_provider_config(&self) -> ProviderConfig {
        let config = self.config.lock().await;
        config.config.provider_config.clone()
    }

    pub async fn update_setup_step(&self, step: &str) -> Result<(), String> {
        let mut config = self.config.lock().await;
        config.config.setup_step = step.to_string();
        config.save()
    }

    pub async fn get_setup_step(&self) -> String {
        let config = self.config.lock().await;
        config.config.setup_step.clone()
    }
}

impl Default for SecureAuth {
    fn default() -> Self {
        Self::new()
    }
}
