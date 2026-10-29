//! 把进程内海马体暴露成一个本地 HTTP 面。
//!
//! ## 为什么需要它
//!
//! 桌面端前端的海马体客户端（`shadow-desktop/src/lib/hippocampusClient.ts`）
//! 打的是 `{base}/hippocampus/api/*` —— 和端脑把海马体 `nest` 在
//! `/hippocampus` 下的形状一致（`telencephalon/src/api/mod.rs:160`：
//! `outer.nest("/hippocampus", h)`）。
//!
//! 但 Tauri 构建里端脑是**进程内嵌**的（`encephalon::Embedded::boot()`），
//! 而 `Embedded::boot()` **只起了 neuron 的 listener**（`:8085`）—— 端脑的
//! HTTP 面根本没起，前端够不到海马体，记忆页只能报连接错误。
//!
//! 这里补上那一段：把 `hippocampus_server` 的 router 挂到
//! `127.0.0.1:60080` 的 `/hippocampus` 下。**前端的 base URL 不用改** ——
//! `telencephalonStore.ts` 的 `DEFAULT_BASE_URL` 就是
//! `http://127.0.0.1:60080`。
//!
//! ## 边界
//!
//! - **只挂海马体**，不挂端脑其余的面（conversations / flows / agents）。
//!   那些要等桌面端的对话路径改走端脑再谈 —— 现在的对话是直连 neuron
//!   的（`telencephalonClient.ts` 的 `streamMessage` 在 Tauri 下走
//!   `streamMessageNeuron`），端脑的 agent 面根本不在链路上。
//! - 端口被占用**不算错误**：那说明外部已经有一台端脑在跑，前端本来就
//!   会连那一台（而且那一台还带完整的端脑面）。此时跳过即可。

use axum::Router;
use std::net::{IpAddr, Ipv4Addr, SocketAddr};

/// 前端默认的端脑地址（`src/stores/telencephalonStore.ts` 的
/// `DEFAULT_BASE_URL`）—— sidecar 与前端共享这一个端口。
pub const DEFAULT_ADDR: SocketAddr =
    SocketAddr::new(IpAddr::V4(Ipv4Addr::LOCALHOST), 60080);

/// 把内层 router 挂到 `/hippocampus` 前缀下。
///
/// axum 的 `nest` 会剥掉前缀，所以内层的 `/api/memory` 在外面就是
/// `/hippocampus/api/memory` —— 和端脑自己的挂法一模一样。
pub fn nest(inner: Router) -> Router {
    Router::new().nest("/hippocampus", inner)
}

/// 组装 router：`/hippocampus/*` → 海马体的 HTTP 面。
pub fn router(state: hippocampus_server::AppState) -> Router {
    nest(hippocampus_server::build_router_unit(state))
}

/// 起服务（阻塞）。调用方自己 spawn。
///
/// CORS 放开：前端跑在 WebView 里（`tauri://localhost` / `http://tauri.localhost`），
/// 直连 `127.0.0.1` 是跨源请求 —— 和 neuron（`neuron/src/**` 的
/// `CorsLayer`）一样的处理。
pub async fn serve(state: hippocampus_server::AppState) {
    let app = router(state).layer(tower_http::cors::CorsLayer::permissive());
    let listener = match tokio::net::TcpListener::bind(DEFAULT_ADDR).await {
        Ok(l) => l,
        Err(e) => {
            tracing::warn!(
                "hippocampus http: bind {DEFAULT_ADDR} failed ({e}); a standalone \
                 telencephalon is probably already serving that port — the frontend \
                 will use that one instead."
            );
            return;
        }
    };
    tracing::info!(
        "hippocampus http listening on http://{DEFAULT_ADDR}/hippocampus"
    );
    if let Err(e) = axum::serve(listener, app).await {
        tracing::error!("hippocampus http server stopped: {e}");
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use axum::routing::get;
    use tower::ServiceExt;

    /// 前缀挂载：内层 `/api/memory` 对外是 `/hippocampus/api/memory`。
    ///
    /// 这里用桩 router 而不是真的海马体状态 —— Lance 初始化太重，而且
    /// 要测的是**挂载形状**（前缀 + 剥前缀），不是海马体自己的契约。
    /// 内层路由表用桩替身，海马体的端点契约另由
    /// `shadow-desktop/src/lib/__tests__/hippocampusClient.test.ts` 锁。
    #[tokio::test]
    async fn nests_inner_router_under_hippocampus_prefix() {
        let inner = Router::new().route("/api/memory", get(|| async { "ok" }));
        let app = nest(inner);

        let hit = app
            .clone()
            .oneshot(
                axum::http::Request::builder()
                    .uri("/hippocampus/api/memory")
                    .body(axum::body::Body::empty())
                    .unwrap(),
            )
            .await
            .unwrap();
        assert_eq!(hit.status(), 200, "/hippocampus/api/memory must reach the inner router");

        // 不带前缀应该落不到内层（axum 的 fallback = 404）。
        let miss = app
            .oneshot(
                axum::http::Request::builder()
                    .uri("/api/memory")
                    .body(axum::body::Body::empty())
                    .unwrap(),
            )
            .await
            .unwrap();
        assert_eq!(miss.status(), 404, "the inner router must not be reachable without the prefix");
    }
}
