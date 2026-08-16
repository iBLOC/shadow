use futures_channel::mpsc;
use futures_util::{SinkExt, StreamExt};
use native_tls::TlsConnector;
use serde::{Deserialize, Serialize};
use std::sync::Arc;
use tauri::{AppHandle, Emitter};
use tokio::net::TcpStream;
use tokio::sync::RwLock;
use tokio_native_tls::TlsStream as TokioTlsStream;
use tokio_tungstenite::{client_async, WebSocketStream};
use tokio_tungstenite::tungstenite::Message;
use url::Url;
use http::Request;

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct WebSocketMessage {
    pub msg_type: String,
    pub payload: serde_json::Value,
}

pub struct MtlsWebSocketClient {
    sender: Arc<RwLock<Option<mpsc::Sender<String>>>>,
    connected_url: Arc<RwLock<Option<String>>>,
    connected_cert: Arc<RwLock<Option<(Vec<u8>, Vec<u8>)>>>,
    app_handle: Arc<RwLock<Option<AppHandle>>>,
}

impl MtlsWebSocketClient {
    pub fn new() -> Self {
        Self {
            sender: Arc::new(RwLock::new(None)),
            connected_url: Arc::new(RwLock::new(None)),
            connected_cert: Arc::new(RwLock::new(None)),
            app_handle: Arc::new(RwLock::new(None)),
        }
    }

    pub async fn connect(
        &self,
        app: AppHandle,
        url: String,
        client_cert: Option<(Vec<u8>, Vec<u8>)>,
    ) -> Result<(), String> {
        let url_parsed = Url::parse(&url).map_err(|e| format!("Invalid URL: {}", e))?;
        let host = url_parsed.host_str().unwrap_or("localhost").to_string();
        let port = url_parsed.port().unwrap_or(443);
        let addr = format!("{}:{}", host, port);

        let tcp_stream = TcpStream::connect(&addr)
            .await
            .map_err(|e| format!("TCP connection failed: {}", e))?;

        let tls_connector = match &client_cert {
            Some((cert_bytes, key_bytes)) => {
                let key = native_tls::Identity::from_pkcs8(cert_bytes, key_bytes)
                    .map_err(|e| format!("Invalid key: {}", e))?;

                let mut builder = TlsConnector::builder();
                builder.identity(key);
                
                // Only disable cert verification in development
                #[cfg(debug_assertions)]
                {
                    builder.danger_accept_invalid_certs(true);
                }
                
                builder.build().map_err(|e| format!("TLS connector build failed: {}", e))?
            }
            None => {
                let mut builder = TlsConnector::builder();
                
                // Only disable cert verification in development
                #[cfg(debug_assertions)]
                {
                    builder.danger_accept_invalid_certs(true);
                }
                
                builder.build().map_err(|e| format!("TLS connector build failed: {}", e))?
            }
        };

        let tls_connector = tokio_native_tls::TlsConnector::from(tls_connector);
        let tls_stream: TokioTlsStream<TcpStream> = tls_connector
            .connect(&host, tcp_stream)
            .await
            .map_err(|e| format!("TLS handshake failed: {}", e))?;

        let request = Request::builder()
            .uri(url.as_str())
            .header("Host", host.as_str())
            .body(())
            .map_err(|e| format!("Invalid request: {}", e))?;

        let (ws_stream, _) = client_async(request, tls_stream)
            .await
            .map_err(|e| format!("WebSocket connection failed: {}", e))?;

        self.start_connection(app.clone(), url.clone(), ws_stream).await?;

        *self.app_handle.write().await = Some(app);
        *self.connected_cert.write().await = client_cert;
        Ok(())
    }

    async fn start_connection(
        &self,
        app: AppHandle,
        url: String,
        ws_stream: WebSocketStream<TokioTlsStream<TcpStream>>,
    ) -> Result<(), String> {
        let (write, read) = ws_stream.split();

        let (tx, mut rx) = mpsc::channel::<String>(32);
        *self.sender.write().await = Some(tx);
        *self.connected_url.write().await = Some(url.clone());

        let sender = self.sender.clone();
        tokio::spawn(async move {
            let mut write = write;
            while let Some(msg) = rx.next().await {
                if write.send(Message::Text(msg.into())).await.is_err() {
                    break;
                }
            }
            let _ = sender.write().await.take();
        });

        let app_clone = app.clone();
        tokio::spawn(async move {
            let mut read = read;
            while let Some(msg) = read.next().await {
                if let Ok(msg) = msg {
                    let text = msg.into_text().unwrap_or_default();
                    if let Ok(parsed) = serde_json::from_str::<serde_json::Value>(&text) {
                        let msg_type = parsed
                            .get("type")
                            .and_then(|v| v.as_str())
                            .unwrap_or("message")
                            .to_string();
                        let _ = app_clone.emit("ws_message", WebSocketMessage {
                            msg_type,
                            payload: parsed,
                        });
                    }
                }
            }
            let _ = app_clone.emit("ws_disconnected", ());
        });

        let _ = app.emit("ws_connected", ());
        Ok(())
    }

    pub async fn send(&self, message: String) -> Result<(), String> {
        let mut sender = self.sender.write().await;
        if let Some(tx) = sender.as_mut() {
            tx.try_send(message).map_err(|e| e.to_string())
        } else {
            Err("Not connected".to_string())
        }
    }

    pub async fn disconnect(&self) {
        if let Some(mut tx) = self.sender.write().await.take() {
            let _ = tx.close_channel();
        }
        *self.connected_url.write().await = None;
        *self.connected_cert.write().await = None;
        *self.app_handle.write().await = None;
    }

    #[allow(dead_code)]
    pub async fn is_connected(&self) -> bool {
        self.sender.read().await.is_some()
    }

    pub async fn reconnect(&self) -> Result<(), String> {
        let url = self.connected_url.read().await.clone();
        let app = self.app_handle.read().await.clone();
        let cert = self.connected_cert.read().await.clone();

        if let (Some(url), Some(app)) = (url, app) {
            self.connect(app, url, cert).await
        } else {
            Err("No previous connection to reconnect to".to_string())
        }
    }
}

impl Default for MtlsWebSocketClient {
    fn default() -> Self {
        Self::new()
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_websocket_message_creation() {
        let msg = WebSocketMessage {
            msg_type: "chat".to_string(),
            payload: serde_json::json!({"content": "hello"}),
        };
        assert_eq!(msg.msg_type, "chat");
        assert_eq!(msg.payload["content"], "hello");
    }

    #[test]
    fn test_websocket_message_serialization() {
        let msg = WebSocketMessage {
            msg_type: "task_update".to_string(),
            payload: serde_json::json!({"task_id": "123", "status": "done"}),
        };
        let json = serde_json::to_string(&msg).unwrap();
        assert!(json.contains("task_update"));
        assert!(json.contains("123"));
        let deserialized: WebSocketMessage = serde_json::from_str(&json).unwrap();
        assert_eq!(deserialized.msg_type, "task_update");
        assert_eq!(deserialized.payload["task_id"], "123");
    }

    #[test]
    fn test_websocket_message_clone() {
        let msg = WebSocketMessage {
            msg_type: "clone_test".to_string(),
            payload: serde_json::json!({"key": "value"}),
        };
        let cloned = msg.clone();
        assert_eq!(cloned.msg_type, msg.msg_type);
        assert_eq!(cloned.payload, msg.payload);
    }

    #[tokio::test]
    async fn test_mtls_websocket_client_new() {
        let client = MtlsWebSocketClient::new();
        assert!(!client.is_connected().await);
    }

    #[tokio::test]
    async fn test_mtls_websocket_client_disconnect_when_not_connected() {
        let client = MtlsWebSocketClient::new();
        client.disconnect().await;
        assert!(!client.is_connected().await);
    }

    #[tokio::test]
    async fn test_mtls_websocket_client_send_when_not_connected() {
        let client = MtlsWebSocketClient::new();
        let result = client.send("test message".to_string()).await;
        assert!(result.is_err());
        assert_eq!(result.unwrap_err(), "Not connected");
    }
}
