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
    /// ⚠️ **`#[serde(default)]` 不可省** —— 少一个字段，**整份配置**就
    /// 反序列化失败 ⇒ 加载路径的 `.ok()` 把它吞成 `None` ⇒
    /// `unwrap_or_default()` ⇒ ⇒ **用户全部设置被静默清空**（密码哈希、
    /// 数据库配置、provider 的 key 全没）⇒ ⇒ 失败长得像成功。
    ///
    /// 配置结构**只会加字段** ⇒ ⇒ 每个新字段都得 default（下面
    /// `hippocampus_data_dir` 就是这么做的）。
    #[serde(default)]
    pub provider_config: ProviderConfig,
    /// Where the hippocampus (long-term memory) keeps its Lance data.
    ///
    /// None = use the hippocampus default (the platform data dir). A path
    /// here **wins** over LANCE_URI / HIPPOCAMPUS_DATA_DIR: the host that
    /// owns the data says where it goes.
    ///
    /// ⚠️ Changing this **switches stores** — it does not move anything.
    /// The old store stays where it is. The settings page has to say so.
    #[serde(default)]
    pub hippocampus_data_dir: Option<String>,
}

#[derive(Debug, Clone, Serialize, Deserialize, Default)]
pub struct ProviderConfig {
    /// ⚠️ 逐字段 default —— 少一个键不该让**整份** provider 配置报废
    /// （provider_config 本身已经 default ⇒ 这里再 default 一层 ⇒
    /// 局部缺失只丢局部）。
    #[serde(default)]
    pub provider_type: String,
    #[serde(default)]
    pub name: String,
    #[serde(default)]
    pub api_base: String,
    #[serde(default)]
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
            // ⚠️ **解析失败要说出来** —— 以前是 `.ok()` 吞掉错误 ⇒
            // `unwrap_or_default()` ⇒ **整份配置静默变默认**（用户看不到
            // 任何提示，只发现「我的设置没了」）。现在：能解析就用；解析
            // 不了就**说清楚**，并尽量保住能读的那部分。
            match fs::read_to_string(&config_path) {
                Ok(text) => match serde_json::from_str::<AppConfig>(&text) {
                    Ok(cfg) => cfg,
                    Err(e) => {
                        tracing::warn!(
                            path = %config_path.display(),
                            error = %e,
                            "配置文件解析失败 ⇒ 回退到默认配置（**原文件未被改动**）",
                        );
                        AppConfig::default()
                    }
                },
                Err(e) => {
                    tracing::warn!(
                        path = %config_path.display(),
                        error = %e,
                        "配置文件读取失败 ⇒ 回退到默认配置",
                    );
                    AppConfig::default()
                }
            }
        } else {
            AppConfig {
                password_hash: String::new(),
                db_type: String::new(),
                db_config: DatabaseConfig::default(),
                setup_complete: false,
                setup_step: String::new(),
                provider_config: ProviderConfig::default(),
                hippocampus_data_dir: None,
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

    pub fn update_hippocampus_data_dir(&mut self, dir: Option<String>) {
        self.config.hippocampus_data_dir = dir;
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

    /// The hippocampus storage root the user picked, if any.
    pub async fn get_hippocampus_data_dir(&self) -> Option<String> {
        let config = self.config.lock().await;
        config.get_config().hippocampus_data_dir.clone()
    }

    pub async fn save_hippocampus_data_dir(&self, dir: Option<String>) -> Result<(), String> {
        let mut config = self.config.lock().await;
        config.update_hippocampus_data_dir(dir);
        config.save()
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

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_app_config_default() {
        let config = AppConfig::default();
        assert!(config.password_hash.is_empty());
        assert!(config.db_type.is_empty());
        assert!(!config.setup_complete);
        assert!(config.provider_config.provider_type.is_empty());
        assert!(config.hippocampus_data_dir.is_none());
    }

    #[test]
    fn an_old_config_file_without_the_storage_field_still_loads() {
        // The field was added later. An existing config.json must keep
        // working (serde default) — otherwise every existing install
        // would lose its settings on upgrade.
        let old = r#"{"password_hash":"abc","db_type":"lance","db_config":{},"setup_complete":true,"setup_step":"done","provider_config":{}}"#;
        let config: AppConfig = serde_json::from_str(old).unwrap();
        assert!(config.hippocampus_data_dir.is_none());
        assert_eq!(config.password_hash, "abc");
    }

    #[test]
    fn the_storage_field_round_trips() {
        let mut config = AppConfig::default();
        // ⚠️ update_hippocampus_data_dir 是 **ConfigManager** 的方法（不是
        // AppConfig 的）⇒ ⇒ 这条测试从 684be0f（2026-11-02 00:05）起就**编不过**
        // ⇒ ⇒ 桌面端的 cargo test --lib 一直跑不起来（没人跑过）。
        config.hippocampus_data_dir = Some("D:/memory".to_string());
        let json = serde_json::to_string(&config).unwrap();
        assert!(json.contains("D:/memory"), "{json}");
        let back: AppConfig = serde_json::from_str(&json).unwrap();
        assert_eq!(back.hippocampus_data_dir.as_deref(), Some("D:/memory"));
    }

    #[test]
    fn test_provider_config_default() {
        let config = ProviderConfig::default();
        assert!(config.provider_type.is_empty());
        assert!(config.name.is_empty());
        assert!(config.api_base.is_empty());
        assert!(config.api_key.is_none());
    }

    #[test]
    fn test_database_config_default() {
        let config = DatabaseConfig::default();
        assert!(config.host.is_none());
        assert!(config.port.is_none());
        assert!(config.username.is_none());
        assert!(config.password.is_none());
        assert!(config.database.is_none());
    }

    #[test]
    fn test_database_config_with_values() {
        let config = DatabaseConfig {
            host: Some("localhost".to_string()),
            port: Some(5432),
            username: Some("user".to_string()),
            password: Some("pass".to_string()),
            database: Some("shadow".to_string()),
        };
        assert_eq!(config.host, Some("localhost".to_string()));
        assert_eq!(config.port, Some(5432));
    }

    #[test]
    fn test_app_config_serialization() {
        let config = AppConfig {
            password_hash: "abc123".to_string(),
            db_type: "lance".to_string(),
            db_config: DatabaseConfig::default(),
            setup_complete: true,
            setup_step: "complete".to_string(),
            provider_config: ProviderConfig::default(),
            hippocampus_data_dir: None,
        };
        let json = serde_json::to_string(&config).unwrap();
        assert!(json.contains("abc123"));
        assert!(json.contains("lance"));
        assert!(json.contains("setup_complete"));
        let deserialized: AppConfig = serde_json::from_str(&json).unwrap();
        assert_eq!(deserialized.password_hash, "abc123");
        assert_eq!(deserialized.db_type, "lance");
        assert!(deserialized.setup_complete);
    }

    #[test]
    fn test_provider_config_serialization() {
        let config = ProviderConfig {
            provider_type: "openai".to_string(),
            name: "OpenAI".to_string(),
            api_base: "https://api.openai.com".to_string(),
            api_key: Some("sk-123".to_string()),
        };
        let json = serde_json::to_string(&config).unwrap();
        assert!(json.contains("openai"));
        assert!(json.contains("sk-123"));
        let deserialized: ProviderConfig = serde_json::from_str(&json).unwrap();
        assert_eq!(deserialized.provider_type, "openai");
        assert_eq!(deserialized.api_key, Some("sk-123".to_string()));
    }
}
