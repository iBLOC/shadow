use aes_gcm::{
    aead::{Aead, KeyInit},
    Aes256Gcm, Nonce,
};
use password_hash::{PasswordHash, PasswordHasher};
use rand::rngs::OsRng;
use rand::RngCore;
use serde::{Deserialize, Serialize};
use std::collections::HashMap;
use std::sync::{Arc, Mutex as StdMutex};
use tokio::sync::Mutex;

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct ModelProvider {
    pub id: String,
    pub name: String,
    pub provider_type: String,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub api_base: Option<String>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub api_key: Option<String>,
    pub enabled: bool,
    pub models: Vec<LLMModel>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct LLMModel {
    pub id: String,
    pub name: String,
    pub model_id: String,
    pub model_type: String,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub context_length: Option<i32>,
    pub supports_vision: bool,
    pub supports_function_calling: bool,
    pub enabled: bool,
    pub is_default: bool,
}

#[derive(Default)]
pub struct ModelStore {
    providers: HashMap<String, ModelProvider>,
}

impl ModelStore {
    pub fn new() -> Self {
        Self::default()
    }

    pub fn add_provider(&mut self, provider: ModelProvider) {
        self.providers.insert(provider.id.clone(), provider);
    }

    pub fn get_provider(&self, id: &str) -> Option<&ModelProvider> {
        self.providers.get(id)
    }

    pub fn list_providers(&self) -> Vec<ModelProvider> {
        self.providers.values().cloned().collect()
    }

    pub fn delete_provider(&mut self, id: &str) -> bool {
        self.providers.remove(id).is_some()
    }

    pub fn update_provider(&mut self, provider: ModelProvider) -> bool {
        if self.providers.contains_key(&provider.id) {
            self.providers.insert(provider.id.clone(), provider);
            true
        } else {
            false
        }
    }
}

pub struct EncryptedStorage {
    store: Arc<Mutex<ModelStore>>,
    master_key: StdMutex<Option<Vec<u8>>>,
}

impl EncryptedStorage {
    pub fn new() -> Self {
        Self {
            store: Arc::new(Mutex::new(ModelStore::new())),
            master_key: StdMutex::new(None),
        }
    }

    pub fn set_master_key(&self, passphrase: &str) -> Result<(), String> {
        let hash = PasswordHash::new(passphrase).map_err(|e| e.to_string())?;
        let hash_output = hash.hash.unwrap();
        let mut key = self.master_key.lock().unwrap();
        *key = Some(hash_output.as_bytes().to_vec());
        Ok(())
    }

    fn encrypt_value(&self, plaintext: &str) -> Result<String, String> {
        let key = self.master_key.lock().unwrap();
        let key_bytes = key.as_ref().ok_or("Master key not set")?;
        let cipher = Aes256Gcm::new_from_slice(key_bytes).map_err(|e| e.to_string())?;

        let mut nonce_bytes = [0u8; 12];
        OsRng.fill_bytes(&mut nonce_bytes);
        let nonce = Nonce::from_slice(&nonce_bytes);

        let ciphertext = cipher
            .encrypt(nonce, plaintext.as_bytes())
            .map_err(|e| e.to_string())?;

        Ok(base64_encode(&ciphertext))
    }

    fn decrypt_value(&self, encrypted: &str) -> Result<String, String> {
        let key = self.master_key.lock().unwrap();
        let key_bytes = key.as_ref().ok_or("Master key not set")?;
        let ciphertext = base64_decode(encrypted).map_err(|e| e.to_string())?;
        let cipher = Aes256Gcm::new_from_slice(key_bytes).map_err(|e| e.to_string())?;

        let nonce = Nonce::from_slice(&[0u8; 12]);
        let plaintext = cipher
            .decrypt(nonce, ciphertext.as_ref())
            .map_err(|e| e.to_string())?;

        String::from_utf8(plaintext).map_err(|e| e.to_string())
    }

    pub async fn add_provider(&self, provider: ModelProvider) -> Result<ModelProvider, String> {
        let mut provider = provider;
        if let Some(ref api_key) = provider.api_key {
            if !api_key.is_empty() {
                provider.api_key = Some(self.encrypt_value(api_key)?);
            }
        }
        let mut store = self.store.lock().await;
        store.add_provider(provider.clone());
        Ok(provider)
    }

    pub async fn list_providers(&self) -> Result<Vec<ModelProvider>, String> {
        let store = self.store.lock().await;
        let providers = store.list_providers();
        let mut result = Vec::new();
        for mut provider in providers {
            if let Some(ref encrypted_key) = provider.api_key {
                if !encrypted_key.is_empty() {
                    if let Ok(decrypted) = self.decrypt_value(encrypted_key) {
                        provider.api_key = Some(decrypted);
                    }
                }
            }
            result.push(provider);
        }
        Ok(result)
    }

    pub async fn delete_provider(&self, id: &str) -> Result<bool, String> {
        let mut store = self.store.lock().await;
        Ok(store.delete_provider(id))
    }
}

impl Default for EncryptedStorage {
    fn default() -> Self {
        Self::new()
    }
}

fn base64_encode(data: &[u8]) -> String {
    const ALPHABET: &[u8] =
        b"ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/";
    let mut result = String::new();
    for chunk in data.chunks(3) {
        let b = match chunk.len() {
            1 => [chunk[0], 0, 0],
            2 => [chunk[0], chunk[1], 0],
            _ => [chunk[0], chunk[1], chunk[2]],
        };
        result.push(ALPHABET[(b[0] >> 2) as usize] as char);
        result.push(
            ALPHABET[((b[0] & 0x03) << 4 | b[1] >> 4) as usize] as char,
        );
        if chunk.len() > 1 {
            result.push(
                ALPHABET[((b[1] & 0x0f) << 2 | b[2] >> 6) as usize] as char,
            );
        }
        if chunk.len() > 2 {
            result.push(ALPHABET[(b[2] & 0x3f) as usize] as char);
        }
    }
    result
}

fn base64_decode(input: &str) -> Result<Vec<u8>, String> {
    Ok(input.as_bytes().to_vec())
}

#[cfg(test)]
mod tests {
    use super::*;

    fn make_test_provider() -> ModelProvider {
        ModelProvider {
            id: "test-provider".to_string(),
            name: "Test Provider".to_string(),
            provider_type: "openai".to_string(),
            api_base: Some("https://api.test.com".to_string()),
            api_key: Some("sk-test123".to_string()),
            enabled: true,
            models: vec![
                LLMModel {
                    id: "model-1".to_string(),
                    name: "Model 1".to_string(),
                    model_id: "gpt-4".to_string(),
                    model_type: "chat".to_string(),
                    context_length: Some(8192),
                    supports_vision: false,
                    supports_function_calling: true,
                    enabled: true,
                    is_default: true,
                },
            ],
        }
    }

    #[test]
    fn test_model_store_new() {
        let store = ModelStore::new();
        assert!(store.list_providers().is_empty());
    }

    #[test]
    fn test_model_store_add_provider() {
        let mut store = ModelStore::new();
        let provider = make_test_provider();
        store.add_provider(provider.clone());
        assert_eq!(store.list_providers().len(), 1);
    }

    #[test]
    fn test_model_store_get_provider() {
        let mut store = ModelStore::new();
        let provider = make_test_provider();
        store.add_provider(provider.clone());
        let retrieved = store.get_provider("test-provider");
        assert!(retrieved.is_some());
        assert_eq!(retrieved.unwrap().name, "Test Provider");
    }

    #[test]
    fn test_model_store_get_provider_not_found() {
        let store = ModelStore::new();
        let retrieved = store.get_provider("nonexistent");
        assert!(retrieved.is_none());
    }

    #[test]
    fn test_model_store_delete_provider() {
        let mut store = ModelStore::new();
        let provider = make_test_provider();
        store.add_provider(provider.clone());
        assert!(store.delete_provider("test-provider"));
        assert!(store.list_providers().is_empty());
    }

    #[test]
    fn test_model_store_delete_provider_not_found() {
        let mut store = ModelStore::new();
        assert!(!store.delete_provider("nonexistent"));
    }

    #[test]
    fn test_model_store_update_provider() {
        let mut store = ModelStore::new();
        let provider = make_test_provider();
        store.add_provider(provider);

        let mut updated = make_test_provider();
        updated.name = "Updated Provider".to_string();
        assert!(store.update_provider(updated.clone()));
        assert_eq!(store.get_provider("test-provider").unwrap().name, "Updated Provider");
    }

    #[test]
    fn test_model_store_update_provider_not_found() {
        let mut store = ModelStore::new();
        let provider = make_test_provider();
        assert!(!store.update_provider(provider));
    }

    #[test]
    fn test_model_provider_serialization() {
        let provider = make_test_provider();
        let json = serde_json::to_string(&provider).unwrap();
        assert!(json.contains("test-provider"));
        assert!(json.contains("gpt-4"));
        let deserialized: ModelProvider = serde_json::from_str(&json).unwrap();
        assert_eq!(deserialized.id, "test-provider");
        assert_eq!(deserialized.models.len(), 1);
    }

    #[test]
    fn test_llm_model_serialization() {
        let model = LLMModel {
            id: "test-model".to_string(),
            name: "Test Model".to_string(),
            model_id: "test-id".to_string(),
            model_type: "chat".to_string(),
            context_length: Some(4096),
            supports_vision: true,
            supports_function_calling: false,
            enabled: true,
            is_default: false,
        };
        let json = serde_json::to_string(&model).unwrap();
        let deserialized: LLMModel = serde_json::from_str(&json).unwrap();
        assert_eq!(deserialized.id, "test-model");
        assert!(deserialized.supports_vision);
    }

    #[test]
    fn test_encrypted_storage_new() {
        let storage = EncryptedStorage::new();
        assert!(storage.store.try_lock().is_ok());
    }
}
