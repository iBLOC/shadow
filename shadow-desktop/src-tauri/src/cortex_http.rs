//! 端脑 HTTP 面 —— 桌面端的通信必须走 大脑 → 端脑 → 叶区。
//!
//! ## 为什么需要它
//!
//! Tauri 构建里端脑是**进程内嵌**的（`encephalon::Embedded::boot()`），
//! 而 `Embedded::boot()` 只起了 neuron 的 listener（`:8085`）—— 端脑的
//! HTTP 面根本没起。前端够不到端脑，于是桌面对话只能直连 neuron 的
//! `/v1/chat/completions`（`telencephalonClient.ts` 的 `streamMessageNeuron`）。
//!
//! 那条路**绕过了端脑和叶区**：意图路由、工具、flow、人格注入全都不在
//! 链路上，桌面端因此**永远收不到 `tool_call` 事件** —— 这正是
//! 「影子给客户端换主题」在桌面端不成立的根因。
//!
//! 这里补上那一段：把端脑的 HTTP 面挂到 `127.0.0.1:60080`。
//!
//! ## 挂载形状
//!
//! 和独立运行的端脑**完全一致**（`telencephalon::api::build_full_app`）：
//!
//! ```text
//! 127.0.0.1:60080
//!   ├── /shadow/v1/*            端脑的 shadow API（会话 / agent）
//!   ├── /api/telencephalon/*    端脑的管理面（状态 / provider / agent）
//!   ├── /hippocampus/api/*      海马体（长时记忆）
//!   └── /v1/chat/completions    neuron 的 OpenAI 兼容面（挂在根）
//! ```
//!
//! 前端一行都不用改：`telencephalonStore.ts` 的 `DEFAULT_BASE_URL` 就是
//! `http://127.0.0.1:60080`，`hippocampusClient.ts` 打的
//! `{base}/hippocampus/api/*` 正好落在这个前缀下。
//!
//! ## 叶区调 LLM 指向活着的那个 neuron
//!
//! `neuron::create_router` 每次调用都会**重建** `ServerState`
//! （`neuron_embed.rs` 的注释写得很清楚），所以合并进端脑面的那张
//! neuron 路由和进程内**活的**那个 neuron 实例不是同一份状态。
//!
//! 叶区（native lobe）默认的 LLM 端点是 `http://localhost:60080`
//! （`NativeLobeRegistry::with_temporal()`）—— 也就是合并进来的那张
//! 重建面。为了让叶区用的是**唯一那个**推理实例，这里在装配完
//! AppState 之后把叶区的端点显式改到 neuron 的真实监听地址
//! （`stack.neuron_addr()`，桌面端是 `127.0.0.1:8085`）。
//!
//! ## 海马体只有一份
//!
//! `encephalon` 的 `hippocampus` feature 在桌面端是**关掉**的
//! （见 `Cargo.toml` 的 `default-features = false`）：海马体状态由
//! `telencephalon::boot::build_app_state` 建，路由也从**同一个** state
//! 挂出来。两份 Lance 指向同一份存储会互相抢锁，所以只留一份。
//!
//! 端脑侧对应的 `hippocampus` feature 是**开着的**（桌面端
//! `Cargo.toml` 里显式写了 `features = ["hippocampus"]`）—— 否则
//! `build_app_state` 交回的是 `None`，桌面端就没有 `/hippocampus` 面可挂。

use std::net::{IpAddr, Ipv4Addr, SocketAddr};

use axum::Router;
use encephalon::Embedded;

/// 前端默认的端脑地址（`src/stores/telencephalonStore.ts` 的
/// `DEFAULT_BASE_URL`）—— sidecar 与前端共享这一个端口。
pub const DEFAULT_ADDR: SocketAddr =
    SocketAddr::new(IpAddr::V4(Ipv4Addr::LOCALHOST), 60080);

/// 端脑的 shadow API 前缀（会话 / agent）—— 前端 `telencephalonClient.ts`
/// 的 `createConversation` / `streamMessage` 打的就是这里。
pub const SHADOW_API_PREFIX: &str = "/shadow/v1";

/// 海马体在端脑面上的前缀 —— 和端脑自己的挂法一致
/// （`telencephalon/src/api/mod.rs`：`outer.nest("/hippocampus", h)`）。
pub const HIPPOCAMPUS_PREFIX: &str = "/hippocampus";

/// 进程内的 native 叶区 —— 这三个是「叶区」在端脑里的实体，
/// `NativeLobeRegistry::with_temporal()` 注册的。
const NATIVE_LOBES: [&str; 3] = ["temporal", "prefrontal", "parietal"];

/// 桌面端递给端脑的 admin token。
///
/// ⚠️ **2026-10-31：这不再是那个常量了。**
///
/// 旧的实现是「环境变量 ⇒ 缺省 `dev-admin-key`」⇒ 而端脑那边恰好有一条
/// 「`expected == "dev-admin-key"` ⇒ **认任何人**」的后门（已删）⇒ ⇒
/// 桌面端的 admin 面**任何请求都过** ⇒ 叠加端脑面的
/// `CorsLayer::permissive()` ⇒ **任意网站**都能插 agent、读走 LLM 密钥。
///
/// ⇒ 现在这把钥匙由 [`crate::admin_token`] 负责：**环境变量 → 持久化文件
/// → 首次生成一把随机的** ⇒ 每台安装一把自己的、猜不到的。
fn desktop_admin_token() -> String {
    crate::admin_token::admin_token().to_string()
}

/// 起端脑的 HTTP 面。
///
/// 端脑 + neuron（根）+ 海马体（`/hippocampus`）三张面合成一台服务，
/// 形状与独立运行的端脑**完全一致**。
pub async fn serve(stack: &Embedded) {
    let app = match build_router(stack).await {
        Ok(app) => app,
        Err(e) => {
            tracing::error!("cortex http: building the telencephalon surface failed ({e})");
            return;
        }
    };

    let listener = match tokio::net::TcpListener::bind(DEFAULT_ADDR).await {
        Ok(l) => l,
        Err(e) => {
            tracing::warn!(
                "cortex http: bind {DEFAULT_ADDR} failed ({e}); a standalone \
                 telencephalon is probably already serving that port — the frontend \
                 will use that one instead."
            );
            return;
        }
    };

    tracing::info!(
        "cortex http listening on http://{DEFAULT_ADDR} \
         (端脑 → 叶区：{SHADOW_API_PREFIX}/*, 海马体：{HIPPOCAMPUS_PREFIX}/*)"
    );
    if let Err(e) = axum::serve(listener, app).await {
        tracing::error!("cortex http server stopped: {e}");
    }
}

/// 组装端脑的 HTTP 面。
///
/// `neuron` 挂在**根**上，和端脑自己的 `build_full_app` 一个形状 ——
/// 前端和叶区看到的路径完全一致。
async fn build_router(stack: &Embedded) -> Result<Router, String> {
    // 端脑自己的 AppState（配置 / lobe 存储 / flow / 会话存储 / 海马体接线）。
    // neuron 传**同一个**嵌入实例 —— 进程内只有一份推理运行时。
    //
    // `identity_dir` 指向**账号身份目录**：账号密钥派生 principal 与
    // 默认人格 ⇒ 这台机器属于哪个人、记忆写进哪个人格，是**这台机器
    // 自己的**属性（不是每请求的属性），所以放在 boot 期解析一次。
    let options = telencephalon::boot::BuildOptions {
        flow_dir: None,
        identity_dir: dirs::config_dir().map(|dir| {
            dir.join("shadow")
                .join("identity")
                .to_string_lossy()
                .to_string()
        }),
        identity: None,
        // ⚠️⚠️⚠️ **这把钥匙以前根本不存在** —— 旧注释写的是
        // 「桌面端**有配置文件** ⇒ shadow key 从配置文件来（`config.toml`）」，
        // ⇒ ⇒ **那句话是假的**（2026-11-01 当场核过）：
        //
        // * 桌面端仓里**没有任何 `config.toml`**（glob 零命中）；
        // * **也没有任何代码**去设 `TELENCEPHALON_CONFIG` / `CORTEX_CONFIG`
        //   ⇒ 而端脑**只**从那个环境变量读配置（`telencephalon/src/boot.rs:127`
        //   ⇒ 读不到就用默认配置）⇒ ⇒ `shadow.api_key` 取默认**空串**；
        // * 空串 ⇒ `require_shadow_key` **放行一切** ⇒ ⇒
        //   **`/shadow/v1/*` 与 `POST /a2a` 在桌面默认安装上一直是敞开的**
        //   （同机任意进程都能打 ⇒ 包括 `POST /shadow/v1/identity`
        //   ⇒ **换掉「这台机器是谁」**）。
        //
        // ⇒⇒⇒ 现在把**宿主这把 admin token** 同时当 shadow key 递进去：
        //
        // * **为什么复用 admin token**：这台桌面端**只有一把宿主钥匙**
        //   （`admin_token.rs` 生成并持久化）⇒ 而端脑的**读门 =
        //   shadow ∪ admin**（`security::api_key::verify_read_credential`）
        //   ⇒ ⇒ **递什么值都不改变「谁能进」** —— 决定权在**客户端递哪把钥匙**，
        //   不在这个值 ⇒ ⇒ **不为它另造一把没人递的钥匙**（那只是「多一把
        //   秘密、多一处要配的地方」，还要前端在第一次请求前就拿到它 ⇒ 竞态）。
        // * **admin 那一支是 fail-closed**（没配 admin token ⇒ 不放行）
        //   ⇒ ⇒ 独立端脑服务器那种形态**不受影响**。
        // * ⚠️ 桌面前端的 `X-Shadow-Key` **仍然递不出来**（它没有 shadow key）
        //   ⇒ ⇒ 它走的是 **admin 那一支** ⇒ ⇒ 端脑侧与前端侧**必须同时**改，
        //   否则桌面端会**把自己锁在外面**（门掐断主人）。
        shadow_api_key: Some(desktop_admin_token()),
        // 海马体（本地长期记忆）的存储根 —— **None = 桌面端仍走环境变量**
        // （`LANCE_URI` / `HIPPOCAMPUS_DATA_DIR` ⇒ `%APPDATA%\shadow\lance`）。
        //
        // ⚠️ 桌面的落点**没有**变成「宿主显式给的目录」：那等于**换一批数据**
        // （不是迁移）⇒ ⇒ 行为一字不变。
        hippocampus_data_dir: None,
        // 桌面端**显式**声明 admin token —— 端脑**不再**替宿主发明一把
        // 开发用的钥匙了（旧的 `dev-admin-key` 回退被端脑删掉了）。
        //
        // ⚠️ 为什么桌面端要「显式要一把开发钥匙」：
        //
        // * 端脑面绑 `127.0.0.1:60080`（loopback，有测试钉着）⇒ 威胁模型
        //   是「本机的另一个进程」，不是「网上的谁」；
        // * 桌面前端**只有** `/api/telencephalon/admin/token` 这一个调用
        //   会带 `X-Admin-Token`（默认 `dev-admin-key`），**agent 管理那些
        //   调用根本不带那个头** ⇒ 若端脑侧真的把 admin 面锁上，桌面的
        //   「建 agent」会 401 ⇒ **今天的桌面端会坏**；
        // * ⇒ 桌面端于是**自己**把那把钥匙递进去（今天的开发契约 =
        //   `dev-admin-key`），行为**一字不变**。
        //
        // ⚠️ 环境变量优先（`TELENCEPHALON_ADMIN_KEY` / 旧的
        // `CORTEX_ADMIN_KEY`）—— 今天它就优先，别把它弄反了。
        //
        // ⇒ 「桌面端的 admin 面仍然是 loopback + 开发后门」是**已知缺口**，
        // 下一档再单独定边界（桌面端自己生成一把 + 前端带上）。
        admin_token: Some(desktop_admin_token()),
    };
    let (state, conv_store, hippocampus_state) =
        telencephalon::boot::build_app_state_with(Some(stack.neuron().as_ref()), options)
            .await
            .map_err(|e| format!("build_app_state: {e}"))?;

    // 叶区的 LLM 端点 → 进程内**活的**那个 neuron 监听。
    let neuron_url = format!("http://{}", stack.neuron_addr());
    for name in NATIVE_LOBES {
        if let Some(old) = state.native_lobes.reconfigure(name, neuron_url.clone()) {
            tracing::info!("cortex http: lobe {name} llm endpoint {old} → {neuron_url}");
        }
    }

    // 海马体的 HTTP 面 —— 从**同一个** state 挂出来。
    //
    // `build_app_state` 把海马体状态作为 `Option` 交回宿主（`hippocampus`
    // feature 关掉时就是 `None`：没有本地海马体，记忆走零信任网络里的
    // hippocampus 服务）。桌面端**开着**这个 feature（`Cargo.toml` 里显式
    // 写 `features = ["hippocampus"]`），所以这里拿到的是 `Some`。
    //
    // 但**不 unwrap**：万一以后端脑把它关掉，正确的表现是「不挂
    // `/hippocampus` 面」，而不是让整个 sidecar 起不来。
    let hippocampus_router = hippocampus_state.map(hippocampus_server::build_router_unit);
    if hippocampus_router.is_none() {
        tracing::warn!(
            "cortex http: no local hippocampus state — the /hippocampus face \
             is not mounted (memory will come from a hippocampus service on \
             the zero-trust network)."
        );
    }

    Ok(telencephalon::api::build_full_app(
        state,
        conv_store,
        Some(stack.neuron().router()),
        hippocampus_router,
    ))
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
        let app = Router::new().nest(HIPPOCAMPUS_PREFIX, inner);

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
        assert_eq!(
            hit.status(),
            200,
            "/hippocampus/api/memory must reach the inner router"
        );

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
        assert_eq!(
            miss.status(),
            404,
            "the inner router must not be reachable without the prefix"
        );
    }

    /// sidecar 和前端必须共用同一个端口 —— 前端 `telencephalonStore.ts`
    /// 的 `DEFAULT_BASE_URL` 写死 `http://127.0.0.1:60080`。
    #[test]
    fn default_addr_matches_the_frontend_base_url() {
        assert_eq!(DEFAULT_ADDR.port(), 60080);
        assert!(DEFAULT_ADDR.ip().is_loopback(), "the sidecar must stay on loopback");
    }

    /// 叶区清单不能变少 —— 少一个就少一条链路上能到达的能力
    /// （temporal = 对话 / 意图，prefrontal = 任务，parietal = 编排）。
    #[test]
    fn native_lobes_cover_the_chain() {
        assert!(NATIVE_LOBES.contains(&"temporal"));
        assert!(NATIVE_LOBES.contains(&"prefrontal"));
        assert!(NATIVE_LOBES.contains(&"parietal"));
    }
}
