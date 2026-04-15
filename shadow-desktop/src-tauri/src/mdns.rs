use serde::{Deserialize, Serialize};
use std::collections::HashMap;
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
                return Ok(services);
            }
            Err(_) => return Ok(Vec::new()),
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

pub async fn resolve_service(service_name: &str) -> Result<Option<DiscoveredService>, String> {
    #[cfg(target_os = "linux")]
    {
        let output = Command::new("avahi-resolve")
            .args(["-n", service_name])
            .output()
            .await;

        match output {
            Ok(out) => {
                let stdout = String::from_utf8_lossy(&out.stdout);
                let parts: Vec<&str> = stdout.trim().split('\t').collect();
                if parts.len() >= 2 {
                    return Ok(Some(DiscoveredService {
                        name: service_name.to_string(),
                        host: parts[1].to_string(),
                        port: 8080,
                        txt_records: HashMap::new(),
                    }));
                }
            }
            Err(_) => {}
        }
        Ok(None)
    }

    #[cfg(target_os = "macos")]
    {
        Ok(resolve_macos_service(service_name).await)
    }

    #[cfg(not(any(target_os = "linux", target_os = "macos")))]
    {
        Ok(None)
    }
}
