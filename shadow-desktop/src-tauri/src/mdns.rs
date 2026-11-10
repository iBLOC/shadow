use serde::{Deserialize, Serialize};
use std::collections::HashMap;
// ⚠️ **只在 linux/macOS 用**（avahi-browse / dns-sd）⇒ ⇒ 在 Windows 上
// 这个 import 是死的 ⇒ ⇒ 平台门写在这里，而不是删掉（删了 Linux/macOS
// 就编不过 —— 「本机看着未用」不等于「所有平台都没用」）。
#[cfg(any(target_os = "linux", target_os = "macos"))]
use tokio::process::Command;

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct DiscoveredService {
    pub name: String,
    pub host: String,
    pub port: u16,
    pub txt_records: HashMap<String, String>,
}

pub async fn discover_resonance() -> Result<Vec<DiscoveredService>, String> {
    #[cfg(target_os = "linux")]
    {
        let output = Command::new("avahi-browse")
            .args(["-r", "-t", "_shadow._tcp"])
            .output()
            .await;

        match output {
            Ok(out) => {
                let stdout = String::from_utf8_lossy(&out.stdout);
                let mut services = Vec::new();

                for line in stdout.lines() {
                    if line.contains("=;") && line.contains(";shadow") {
                        let parts: Vec<&str> = line.split(';').collect();
                        if parts.len() >= 7 {
                            let name = parts[3].trim().to_string();
                            let host_port = parts[5];
                            if let Some((host, port)) = host_port.rsplit_once(':') {
                                let port: u16 = port.parse().unwrap_or(8080);
                                services.push(DiscoveredService {
                                    name,
                                    host: host.to_string(),
                                    port,
                                    txt_records: HashMap::new(),
                                });
                            }
                        }
                    }
                }
                Ok(services)
            }
            Err(_) => Ok(Vec::new()),
        }
    }

    #[cfg(target_os = "macos")]
    {
        let service_names = browse_macos_services().await?;
        let mut services = Vec::new();

        for name in service_names {
            if let Some(service) = resolve_macos_service(&name).await {
                services.push(service);
            }
        }

        Ok(services)
    }

    #[cfg(not(any(target_os = "linux", target_os = "macos")))]
    {
        Ok(Vec::new())
    }
}

// ⚠️ 2026-11-08：这里原有一对**从未被调用**的浏览helper
// （`browse_service(service_type)` ＋ 只被它调用的 macOS 解析helper）
// ⇒ ⇒ 公开面是 `discover_resonance()`（走自己的 avahi/dns-sd 路径）与
// `resolve_service()` ⇒ ⇒ 那两个是**真孤儿** ⇒ ⇒ 连同它们的 cfg 块一起
// 出仓（留着只会让人以为「按 service_type 浏览」是活的）。

#[cfg(target_os = "macos")]
async fn browse_macos_services() -> Result<Vec<String>, String> {
    let output = Command::new("dns-sd")
        .args(["-B", "_shadow._tcp", "local."])
        .output()
        .await;

    match output {
        Ok(out) => {
            let stdout = String::from_utf8_lossy(&out.stdout);
            let mut names = Vec::new();

            for line in stdout.lines() {
                if line.starts_with('+') || line.starts_with('=') || line.starts_with('-') {
                    let parts: Vec<&str> = line.split_whitespace().collect();
                    if parts.len() >= 4 {
                        let name = parts[3].trim().to_string();
                        if name.contains("_shadow._tcp") && !names.contains(&name) {
                            names.push(name);
                        }
                    }
                }
            }
            Ok(names)
        }
        Err(_) => Ok(Vec::new()),
    }
}

#[cfg(target_os = "macos")]
async fn resolve_macos_service(name: &str) -> Option<DiscoveredService> {
    let output = Command::new("dns-sd")
        .args(["-L", name, "_shadow._tcp", "local."])
        .output()
        .await
        .ok()?;

    let stdout = String::from_utf8_lossy(&output.stdout);

    for line in stdout.lines() {
        if line.contains("hostname=") {
            if let Some(host_port) = extract_host_port(line) {
                return Some(DiscoveredService {
                    name: name.to_string(),
                    host: host_port.0,
                    port: host_port.1,
                    txt_records: HashMap::new(),
                });
            }
        }
    }

    None
}

#[cfg(target_os = "macos")]
fn extract_host_port(line: &str) -> Option<(String, u16)> {
    if let Some(start) = line.find("hostname=") {
        let rest = &line[start + 9..];
        if let Some(end) = rest.find([' ', ')']) {
            let host_port = rest[..end].trim();
            if let Some(last_colon) = host_port.rfind(':') {
                let host = host_port[..last_colon].to_string();
                if let Ok(port) = host_port[last_colon + 1..].parse::<u16>() {
                    return Some((host, port));
                }
            } else {
                return Some((host_port.to_string(), 8080));
            }
        }
    }
    None
}

// ⚠️⚠️ **参数名的 `_` 前缀不是「不用它」，是「只有 linux/macOS 才用得到它」**
//   ⇒ ⇒ Windows 上没有 mDNS 实现 ⇒ ⇒ 那个面上参数真的没被用 ⇒ ⇒ clippy 的
//   `unused_variables` 会报 ⇒ ⇒ 于是加前缀消警告。
//   ⇒ ⇒ **但函数体里必须用同一个名字**（`_service_name`）—— 用裸名 `service_name`
//   就是 E0425。2026-11-08 那笔 clippy 存量清扫只改了参数名、没改函数体 ⇒ ⇒
//   Linux 上 2 处、macOS 上 1 处编不过 ⇒ ⇒ 而桌面 crate 唯一的 Linux 防线
//   （desktop-rust workflow）**从落地第一天起就是红的** ⇒ ⇒ Windows 本机
//   永远编不到那几段 ⇒ ⇒ 这就是那盏灯没人看见的原因。
pub async fn resolve_service(_service_name: &str) -> Result<Option<DiscoveredService>, String> {
    #[cfg(target_os = "linux")]
    {
        let output = Command::new("avahi-resolve")
            .args(["-n", _service_name])
            .output()
            .await;

        if let Ok(out) = output {
            let stdout = String::from_utf8_lossy(&out.stdout);
            let parts: Vec<&str> = stdout.trim().split('\t').collect();
            if parts.len() >= 2 {
                return Ok(Some(DiscoveredService {
                    name: _service_name.to_string(),
                    host: parts[1].to_string(),
                    port: 8080,
                    txt_records: HashMap::new(),
                }));
            }
        }
        Ok(None)
    }

    #[cfg(target_os = "macos")]
    {
        Ok(resolve_macos_service(_service_name).await)
    }

    #[cfg(not(any(target_os = "linux", target_os = "macos")))]
    {
        Ok(None)
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_discovered_service_creation() {
        let service = DiscoveredService {
            name: "resonance".to_string(),
            host: "192.168.1.100".to_string(),
            port: 8080,
            txt_records: HashMap::new(),
        };
        assert_eq!(service.name, "resonance");
        assert_eq!(service.host, "192.168.1.100");
        assert_eq!(service.port, 8080);
        assert!(service.txt_records.is_empty());
    }

    #[test]
    fn test_discovered_service_with_txt_records() {
        let mut txt_records = HashMap::new();
        txt_records.insert("version".to_string(), "1.0.0".to_string());
        txt_records.insert("capabilities".to_string(), "chat,memory".to_string());

        let service = DiscoveredService {
            name: "shadow-desktop".to_string(),
            host: "localhost".to_string(),
            port: 8082,
            txt_records,
        };
        assert_eq!(
            service.txt_records.get("version"),
            Some(&"1.0.0".to_string())
        );
        assert_eq!(
            service.txt_records.get("capabilities"),
            Some(&"chat,memory".to_string())
        );
    }

    #[test]
    fn test_discovered_service_serialization() {
        let service = DiscoveredService {
            name: "test-service".to_string(),
            host: "127.0.0.1".to_string(),
            port: 9000,
            txt_records: HashMap::new(),
        };
        let json = serde_json::to_string(&service).unwrap();
        assert!(json.contains("test-service"));
        assert!(json.contains("127.0.0.1"));
        assert!(json.contains("9000"));
        let deserialized: DiscoveredService = serde_json::from_str(&json).unwrap();
        assert_eq!(deserialized.name, "test-service");
        assert_eq!(deserialized.port, 9000);
    }

    #[test]
    fn test_discovered_service_clone() {
        let service = DiscoveredService {
            name: "clone".to_string(),
            host: "clone.host".to_string(),
            port: 1234,
            txt_records: HashMap::new(),
        };
        let cloned = service.clone();
        assert_eq!(cloned.name, service.name);
        assert_eq!(cloned.host, service.host);
        assert_eq!(cloned.port, service.port);
    }

    #[cfg(target_os = "macos")]
    #[test]
    fn test_extract_host_port_with_port() {
        let line = "hostname=myhost.local:8080";
        let result = extract_host_port(line);
        assert!(result.is_some());
        let (host, port) = result.unwrap();
        assert_eq!(host, "myhost.local");
        assert_eq!(port, 8080);
    }

    #[cfg(target_os = "macos")]
    #[test]
    fn test_extract_host_port_without_port() {
        let line = "hostname=myhost.local";
        let result = extract_host_port(line);
        assert!(result.is_some());
        let (host, port) = result.unwrap();
        assert_eq!(host, "myhost.local");
        assert_eq!(port, 8080);
    }
}
