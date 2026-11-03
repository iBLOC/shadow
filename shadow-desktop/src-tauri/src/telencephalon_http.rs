//! 端脑 HTTP 面 —— 桌面端的通信必须走 大脑 → 端脑 → 叶区。
//!
//! ## 为什么需要它
//!
//! Tauri 构建里端脑是**进程内嵌**的（`encephalon::Embedded::boot()`），
//! 而 `Embedded::boot()` 只起了 neuron（**router-only**，它不再自己监听
//! 一个口）—— 端脑的 HTTP 面根本没起。前端够不到端脑，于是桌面对话只能直连 neuron 的
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
//! ## 组装：统一入口，不再各拼各的
//!
//! ⚠️ **2026-11-03 起，这张面由大脑仓的 `encephalon::surface::build_brain_face`
//! 组装** —— 桌面端 / 移动端 / 独立服务器**同一个入口、同一种形状、同一扇门**
//! ⇒ ⇒ 此前三处各拼各的（形状一样但代码有三份 ⇒ 迟早漂 ⇒ 而且「门罩住谁」
//! 三处也不同 ⇒ ⇒ neuron 面与海马体面在门外这件事没人说得清是设计还是巧合）。
//!
//! ## 叶区的 LLM 端点
//!
//! 叶区（native lobe）默认的 LLM 端点是 `http://localhost:60080`
//! （`NativeLobeRegistry::with_temporal()`）—— 桌面上那个端口**没有**任何
//! 东西在听 ⇒ ⇒ 端点由统一入口的 `note_bound` 在**监听之后**指过去。
//!
//! ⚠️ **router-only 形态**：neuron 不再自己监听一个口 ⇒ ⇒ 它没有
//! `neuron_addr` ⇒ ⇒ 叶区指向的是**大脑这张面自己**（`/v1/chat/completions`
//! 挂在脑面的根上）⇒ ⇒ 那一跳是**主人门**（端脑的叶区带进程内内部凭据）。
//!
//! ## 海马体只有一份
//!
//! 海马体状态由 `telencephalon::boot::build_app_state_with` 建，路由由
//! `telencephalon::boot::build_hippocampus_router` 从**同一个**状态挂出来
//! ⇒ ⇒ 两份 Lance 指向同一份存储会互相抢锁 ⇒ ⇒ 只留一份。
//!
//! 端脑侧的 `hippocampus` feature 在桌面端是**开着的**（`Cargo.toml` 里
//! 显式写了 `features = ["hippocampus"]`）—— 否则没有那份状态，桌面端就没有
//! `/hippocampus` 面可挂。

use std::net::{IpAddr, Ipv4Addr, SocketAddr};
use std::time::Duration;

use axum::Router;
use encephalon::Embedded;

use crate::brain_face::{self, BrainFaceHandle};

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

/// 进程内的 native 叶区 —— 「叶区」在端脑里的实体。
///
/// ⚠️ **不再硬编码名单**（2026-11-03）—— 叶区的 LLM 端点现在由大脑仓的
/// `point_lobes_at_neuron` 指过去，而它读的是**注册表自己的清单**
/// ⇒ ⇒ 名单增删自动跟上 ⇒ ⇒ 不必在这里再抄一份（抄的那份只会漂）。
/// `NativeLobeRegistry::with_temporal()` 注册的。
const NATIVE_LOBES: [&str; 3] = ["temporal", "prefrontal", "parietal"];

/// 端脑面被占时，多久重试一次 —— 占着 60080 的进程一走，桌面端就接管。
const BIND_RETRY_SECS: u64 = 3;

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
pub async fn serve(stack: &Embedded, hippocampus_data_dir: Option<String>, face: BrainFaceHandle) {
    // ⚠️ **客户端模式**（2026-11-03）—— 这台机器**不拿这张面提供大脑**，
    // 而是经零信任网访问**别的**设备上的大脑 ⇒ ⇒ 60080 这个口上坐的是
    // **零信任本地代理** ⇒ ⇒ 前端的 baseUrl（`http://127.0.0.1:60080`）
    // **一个字都不用改**。
    //
    // ⚠️ 这是**显式**决定 —— 没有 `ZITI_CLIENT_IDENTITY` ⇒ ⇒ 不是客户端
    // ⇒ ⇒ 行为与今天一模一样。
    //
    // ⚠️ 本地那栈（thalamus / JDM 编辑器 / 进程内推理）**照旧起** ——
    // 桌面端自己的功能还要用它 ⇒ ⇒ 客户端模式换掉的只是「前端这一张面」。
    if encephalon::ziti_client::is_client_mode() {
        match serve_client_proxy(&face).await {
            Ok(()) => return,
            Err(e) => {
                tracing::error!("零信任客户端代理起不来: {e}");
                face.set(
                    brain_face::STATE_FAILED,
                    Some(format!("zero-trust client proxy: {e}")),
                );
                return;
            }
        }
    }

    let brain_face = match build_face(stack, hippocampus_data_dir).await {
        Ok(f) => f,
        Err(e) => {
            tracing::error!("telencephalon http: building the telencephalon surface failed ({e})");
            face.set(
                brain_face::STATE_FAILED,
                Some(format!("build telencephalon surface: {e}")),
            );
            return;
        }
    };

    // ⚠️ 绑不上**不是**「放弃」—— 见 brain_face::bind_until_owned 的注释。
    let listener =
        brain_face::bind_until_owned(&face, DEFAULT_ADDR, Duration::from_secs(BIND_RETRY_SECS))
            .await;

    // ⚠️ **写回真实地址 ＋ 把叶区指过来**（统一入口的 `note_bound`）——
    // ⇒ 端脑的**自环回**（前额叶转发 / 记忆查询 / agent 清单）打的是
    // `bind.http` ⇒ ⇒ 不写回就是打到一个**没人监听**的端口 ⇒ ⇒
    // connection refused ⇒ ⇒ **而且不报错**。
    //
    // ⚠️ 「router-only」形态下 neuron 没有独立 listener ⇒ ⇒ 叶区的 LLM
    // 端点指的就是**这张面** ⇒ ⇒ 这一步是推理链的最后一跳。
    if let Ok(addr) = listener.local_addr() {
        brain_face.note_bound(addr).await;
    }

    tracing::info!(
        "telencephalon http listening on http://{DEFAULT_ADDR} \
         (端脑 → 叶区：{SHADOW_API_PREFIX}/*, 海马体：{HIPPOCAMPUS_PREFIX}/*)"
    );
    // ⚠️ **双面挂载**（2026-11-03）—— 见 `encephalon::ziti` 的模块文档。
    // ⇒ ⇒ 回环 TCP 面留着（端脑自环回 + 前端 + SSE/WS），另起一张零信任面
    // ⇒ ⇒ 没配 `ZITI_IDENTITY` ⇒ **不起** ⇒ ⇒ 桌面端行为与今天**一模一样**。
    encephalon::ziti::spawn_if_configured(brain_face.router.clone());

    if let Err(e) = axum::serve(listener, brain_face.router).await {
        tracing::error!("telencephalon http server stopped: {e}");
        face.set(brain_face::STATE_FAILED, Some(format!("server stopped: {e}")));
    }
}


/// **客户端模式**：60080 上起**零信任代理**，而不是大脑那张面。
///
/// ⇒ ⇒ 前端照旧打 `http://127.0.0.1:60080` ⇒ ⇒ 前端**零改动** ⇒ ⇒
/// 请求经代理转成 ziti 上的 HTTP 流 ⇒ ⇒ 落到**远端**的大脑上。
async fn serve_client_proxy(face: &BrainFaceHandle) -> Result<(), String> {
    let mut options = encephalon::ziti_client::configured_options()
        .ok_or_else(|| "客户端模式没有配置".to_string())?;

    // ⚠️ 代理要占住**前端默认的那个口** ⇒ ⇒ 前端零改动。
    options = options.with_bind(DEFAULT_ADDR);

    let addr = encephalon::ziti_client::spawn_client_proxy(&options)
        .await
        .map_err(|e| format!("{e:#}"))?;

    tracing::info!(
        "零信任客户端代理已起：http://{addr} ⇒ 远端大脑服务 = {}",
        options.service_name
    );
    face.set(brain_face::STATE_LISTENING, None);
    Ok(())
}

/// 组装端脑的 HTTP 面。
///
/// `neuron` 挂在**根**上，和端脑自己的 `build_full_app` 一个形状 ——
/// 前端和叶区看到的路径完全一致。
/// 组装「大脑那张面」。
///
/// ⚠️ **统一入口**（2026-11-03）—— 桌面端 / 移动端 / 独立服务器都走大脑仓的
/// `encephalon::surface::build_brain_face` ⇒ ⇒ **同一张面、同一扇门**
/// ⇒ ⇒ 不再各拼各的（此前桌面端自己拼 `build_full_app`、独立服务器自己
/// merge ⇒ ⇒ 形状一样但**代码有三份** ⇒ ⇒ 迟早漂）。
async fn build_face(
    stack: &Embedded,
    hippocampus_data_dir: Option<String>,
) -> Result<encephalon::surface::BrainFace, String> {

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
        //   ⇒ 而端脑**只**从那个环境变量读配置 ⇒ ⇒ `shadow.api_key` 取默认
        //   **空串**；
        // * 空串 ⇒ `require_shadow_key` **放行一切** ⇒ ⇒
        //   **`/shadow/v1/*` 与 `POST /a2a` 在桌面默认安装上一直是敞开的**
        //   （同机任意进程都能打 ⇒ 包括 `POST /shadow/v1/identity`
        //   ⇒ **换掉「这台机器是谁」**）。
        //
        // ⇒⇒⇒ 现在把**宿主这把 admin token** 同时当 shadow key 递进去：
        //
        // * **为什么复用 admin token**：这台桌面端**只有一把宿主钥匙**
        //   （`admin_token.rs` 生成并持久化）⇒ 而端脑的**读门 =
        //   shadow ∪ admin** ⇒ ⇒ **递什么值都不改变「谁能进」** ⇒ ⇒
        //   **不为它另造一把没人递的钥匙**。
        // * **admin 那一支是 fail-closed**（没配 admin token ⇒ 不放行）。
        // * ⚠️ 桌面前端的 `X-Shadow-Key` **仍然递不出来** ⇒ ⇒ 它走的是
        //   **admin 那一支** ⇒ ⇒ 端脑侧与前端侧**必须同时**改，否则桌面端会
        //   **把自己锁在外面**（门掐断主人）。
        shadow_api_key: Some(desktop_admin_token()),
        // 海马体（本地长期记忆）的存储根 —— **None = 桌面端仍走环境变量**
        // （`LANCE_URI` / `HIPPOCAMPUS_DATA_DIR`）。
        //
        // 桌面设置页可以指一个目录（config.json 的 hippocampus_data_dir）
        // ⇒ ⇒ 显式根**赢过**环境变量：拥有这份数据的宿主说了算。
        //
        // ⚠️ 换根 = **换一批数据**，不是迁移：原来那份留在原处。
        hippocampus_data_dir,
        // 会话存储文件：None = 桌面走海马体（Lance）。
        conversation_store_file: None,
        // 桌面端**显式**声明 admin token —— 端脑**不再**替宿主发明一把
        // 开发用的钥匙了。
        //
        // ⚠️ 环境变量优先（`TELENCEPHALON_ADMIN_KEY` / 旧的
        // `CORTEX_ADMIN_KEY`）。
        admin_token: Some(desktop_admin_token()),
        // ⚠️ **其余字段走 Default** —— `BuildOptions` 手写了 `Default`
        // ⇒ ⇒ 新增字段时不必在这里补 ⇒ ⇒ 也就不必「改一处、漏一处」
        // （E0063：缺 `control_plane` / `secret_store`）。
        ..Default::default()
    };
    // ⚠️ **门罩住「合并后」的最外层** ⇒ ⇒ neuron 面与 /hippocampus 面**也在**
    // 门型表管辖内 ⇒ ⇒ 它们不再是「同机任何进程都能直连」的后门。
    //
    // ⚠️ **海马体路由由端脑挂**（`telencephalon::boot::build_hippocampus_router`）
    // ⇒ ⇒ 桌面端**不再**自己摸 `hippocampus_server` ⇒ ⇒ 也就不会与端脑
    // 各挂一份形状不同的面。
    //
    // ⚠️ **叶区的 LLM 端点**由 `note_bound` 在**监听之后**指过去 ⇒ ⇒
    // router-only 形态下它指向**这张面自己**（neuron 没有独立 listener）。
    encephalon::surface::build_brain_face(
        options,
        Some(stack.neuron().as_ref()),
        encephalon::surface::FaceContent::Full,
    )
    .await
    .map_err(|e| format!("build_brain_face: {e}"))
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
    ///
    /// ⚠️ **判据换成「注册表里真的有」**（2026-11-03）—— 以前断言的是一个
    /// **硬编码名单**，而那份名单只说明「我们打算支持谁」；真正决定叶区能不能
    /// 被打到的是**注册表里有没有它** ⇒ ⇒ 断言必须对着真相源。
    #[test]
    fn native_lobes_cover_the_chain() {
        let lobes = telencephalon::lobes::NativeLobeRegistry::with_temporal();
        let names: Vec<String> = lobes.all_manifests().into_iter().map(|m| m.name).collect();
        for expected in ["temporal", "prefrontal", "parietal"] {
            assert!(
                names.iter().any(|n| n == expected),
                "lobe {expected} must be registered — otherwise that capability is unreachable"
            );
        }
    }
    /// （temporal = 对话 / 意图，prefrontal = 任务，parietal = 编排）。
    #[test]
    fn native_lobes_cover_the_chain() {
        assert!(NATIVE_LOBES.contains(&"temporal"));
        assert!(NATIVE_LOBES.contains(&"prefrontal"));
        assert!(NATIVE_LOBES.contains(&"parietal"));
    }
}
