//! Shell-level integration tests — the embedded stack that lib.rs wires
//! into the Tauri setup hook.
//!
//! These run without any GUI: the inference runtime is **the one the brain
//! owns** (telencephalon starts it, router-only — it has no listener of its
//! own), and the provider manager is driven through the production model
//! fetcher against a local mock provider. Together they pin the two
//! contracts the frontend depends on:
//!
//! 1. The brain's neuron boots, serves /health and the built-in catalog.
//! 2. `ProviderManager` + `HttpModelFetcher` fetch model lists from a
//!    provider endpoint, cache them on the entry, and persist to JSON
//!    that a fresh manager instance reloads.
//!
//! ⚠️ **这里不许自己起一个 neuron**（2026-11-08 用户拍板：「所有的本地推理
//! 任务都应该由大脑中的 neuron 提供」）⇒ ⇒ 起的是**大脑里那一个**
//! ⇒ ⇒ 桌面端**连 neuron 这个 crate 都不直接依赖**
//! ⇒ ⇒ 那条不变量由 `shadow/scripts/check-neuron-ownership.mjs`
//! （N1 / N13）钉住。

use std::sync::Arc;
use std::time::Duration;

use axum::body::Body;
use axum::http::{Request, StatusCode};
use tower::ServiceExt; // `oneshot` —— 直接打 router，不开第二个口

/// The brain's own neuron must boot, answer health, and expose the
/// built-in model catalog.
///
/// ⚠️ **router-only**（大脑默认形态）：neuron **自己**没有监听口 ⇒ ⇒
/// 推理面只从**大脑那张面**进 ⇒ ⇒ 这里用 `oneshot` 直接打那张 router
/// ⇒ ⇒ **不新开一个口**（新开一个口＝多一个推理入口）。
#[tokio::test]
async fn the_brains_neuron_serves_health_and_catalog() {
    let embed = encephalon::telencephalon::neuron_embed::start_neuron_router_only_default()
        .await
        .expect("the brain's neuron boots");
    assert!(
        embed.addr.is_none(),
        "大脑里的 neuron 自己不该有监听口（router-only）—— 有的话就是第二个入口"
    );
    // ⚠️ 这一张面与**大脑那张面**挂的是**同一份 ServerState**（不是重建的
    // 一份）⇒ ⇒ 这里读到的注册表 / 目录 = 大脑在用的那份。
    let router = embed.router();

    let health = router
        .clone()
        .oneshot(
            Request::builder()
                .uri("/health")
                .body(Body::empty())
                .expect("health request"),
        )
        .await
        .expect("health response");
    assert_eq!(health.status(), StatusCode::OK, "engine health");
    let health_bytes = axum::body::to_bytes(health.into_body(), 64 * 1024)
        .await
        .expect("health body");
    let health_json: serde_json::Value =
        serde_json::from_slice(&health_bytes).expect("health json");
    assert_eq!(health_json["status"], "healthy", "engine health: {health_json}");

    let models = router
        .oneshot(
            Request::builder()
                .uri("/v1/models?engine=llm")
                .body(Body::empty())
                .expect("models request"),
        )
        .await
        .expect("models response");
    assert_eq!(models.status(), StatusCode::OK, "models status");
    let models_bytes = axum::body::to_bytes(models.into_body(), 64 * 1024)
        .await
        .expect("models body");
    let models_json: serde_json::Value =
        serde_json::from_slice(&models_bytes).expect("models json");
    assert!(
        models_json["supported_count"].as_u64().unwrap_or(0) > 0,
        "built-in catalog must be non-empty: {models_json}"
    );
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

    let dir = std::env::temp_dir().join(format!("shadow-shell-prov-{}", uuid::Uuid::new_v4()));
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
    assert!(
        entry.last_error.is_none(),
        "no fetch error: {:?}",
        entry.last_error
    );

    // The mock saw a Bearer-less GET /models (no key was configured).
    let raw = rx
        .recv_timeout(Duration::from_secs(5))
        .expect("mock saw request");
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
