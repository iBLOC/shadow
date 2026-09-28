//! Shell-level integration tests — the embedded stack that lib.rs wires
//! into the Tauri setup hook.
//!
//! These run without any GUI: the neuron inference runtime is started
//! exactly the way the app starts it (`run_embedded`), and the provider
//! manager is driven through the production model fetcher against a
//! local mock provider. Together they pin the two contracts the
//! frontend depends on:
//!
//! 1. `run_embedded` boots, serves /health and the built-in catalog.
//! 2. `ProviderManager` + `HttpModelFetcher` fetch model lists from a
//!    provider endpoint, cache them on the entry, and persist to JSON
//!    that a fresh manager instance reloads.

use std::sync::Arc;
use std::time::Duration;

// neuron's [lib] target is named neuron_lib; alias to the crate's
// project name (same pattern as lib.rs and telencephalon).
use neuron_lib as neuron;

/// The embedded engine the app spawns in setup() must boot, answer
/// health, and expose the built-in model catalog. `port: 0` binds an
/// ephemeral port so the test never collides with a running app.
#[tokio::test]
async fn embedded_neuron_boots_and_serves_catalog() {
    let cfg = neuron::NeuronEmbedConfig {
        port: 0,
        config: neuron::NeuronConfig::new(),
    };
    let handle = neuron::run_embedded(cfg)
        .await
        .expect("embedded neuron binds and serves");
    // handle.addr echoes the wildcard bind (0.0.0.0), which Windows
    // refuses to connect() to — swap in the loopback host, keep the port.
    let base = format!("http://127.0.0.1:{}", handle.addr.port());

    let client = reqwest::Client::builder()
        .timeout(Duration::from_secs(10))
        .build()
        .expect("http client");

    let health: serde_json::Value = client
        .get(format!("{base}/health"))
        .send()
        .await
        .expect("health request")
        .json()
        .await
        .expect("health json");
    assert_eq!(health["status"], "healthy", "engine health: {health}");

    let models: serde_json::Value = client
        .get(format!("{base}/v1/models"))
        .query(&[("engine", "llm")])
        .send()
        .await
        .expect("models request")
        .json()
        .await
        .expect("models json");
    assert!(
        models["supported_count"].as_u64().unwrap_or(0) > 0,
        "built-in catalog must be non-empty: {models}"
    );

    handle.request_shutdown();
    handle.join().await;
}

/// The provider manager the ProvidersPage talks to must fetch model
/// lists through the production `HttpModelFetcher`, cache them on the
/// entry, and reload them from disk in a fresh instance.
#[tokio::test]
async fn provider_manager_fetches_and_persists() {
    // One-shot OpenAI-standard /models endpoint.
    let listener = std::net::TcpListener::bind("127.0.0.1:0").expect("mock bind");
    let addr = listener.local_addr().unwrap();
    let (tx, rx) = std::sync::mpsc::channel();
    std::thread::spawn(move || {
        use std::io::{Read, Write};
        if let Ok((mut sock, _)) = listener.accept() {
            let mut buf = vec![0u8; 16384];
            let n = sock.read(&mut buf).unwrap_or(0);
            let _ = tx.send(String::from_utf8_lossy(&buf[..n]).to_string());
            let _ = sock.write_all(
                b"HTTP/1.1 200 OK\r\ncontent-type: application/json\r\n\r\n\
                  {\"data\":[{\"id\":\"gpt-test\",\"object\":\"model\",\
                  \"context_length\":4096}]}",
            );
            let _ = sock.flush();
        }
    });

    let dir = std::env::temp_dir().join(format!(
        "shadow-shell-prov-{}",
        uuid::Uuid::new_v4()
    ));
    let persist = dir.join("providers.json");
    let manager = Arc::new(encephalon::providers::ProviderManager::with_persistence(
        Arc::new(encephalon::providers::HttpModelFetcher),
        Some(persist.clone()),
    ));

    let entry = manager
        .add_custom(
            "Mock Gateway",
            &format!("http://{addr}"),
            synapse::providers::catalog::ApiStandard::OpenAi,
            None,
        )
        .await
        .expect("custom provider adds");

    // The fetcher actually drove to the mock endpoint and cached the list.
    assert_eq!(entry.models.len(), 1, "models cached: {:?}", entry.models);
    assert_eq!(entry.models[0].id, "gpt-test");
    assert_eq!(entry.models[0].context_length, Some(4096));
    assert!(entry.last_error.is_none(), "no fetch error: {:?}", entry.last_error);

    // The mock saw a Bearer-less GET /models (no key was configured).
    let raw = rx.recv_timeout(Duration::from_secs(5)).expect("mock saw request");
    assert!(raw.starts_with("GET /models HTTP/1.1"), "path: {raw}");

    // A fresh manager over the same persistence file reloads the entry
    // with its cached model list.
    let reloaded = encephalon::providers::ProviderManager::with_persistence(
        Arc::new(encephalon::providers::HttpModelFetcher),
        Some(persist),
    );
    let list = reloaded.list().await;
    assert_eq!(list.len(), 1, "persisted entry count");
    assert_eq!(list[0].id, entry.id);
    assert_eq!(list[0].name, "Mock Gateway");
    assert_eq!(list[0].models.len(), 1, "cached models survive restart");
    assert_eq!(list[0].models[0].id, "gpt-test");

    let _ = std::fs::remove_dir_all(&dir);
}
