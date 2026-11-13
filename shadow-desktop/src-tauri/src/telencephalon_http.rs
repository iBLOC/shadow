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
//! 和独立运行的端脑**完全一致**（`encephalon::telencephalon::api::build_full_app`）：
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
//! 海马体状态由 `encephalon::telencephalon::boot::build_app_state_with` 建，路由由
//! `encephalon::telencephalon::boot::build_hippocampus_router` 从**同一个**状态挂出来
//! ⇒ ⇒ 两份 Lance 指向同一份存储会互相抢锁 ⇒ ⇒ 只留一份。
//!
//! 端脑侧的 `hippocampus` feature 在桌面端是**开着的** —— 但**不是**桌面端
//! 自己写 `features = ["hippocampus"]`（那条边 2026-11-05 已删）⇒ ⇒ 现在是
//! `Cargo.toml` 里**大脑**的 `features` 显式列了 `"hippocampus"` ⇒ ⇒ 由大脑
//! 转发 `telencephalon/hippocampus` + `dep:hippocampus-server` ⇒ ⇒ 否则没有
//! 那份状态，桌面端就没有 `/hippocampus` 面可挂。

use std::net::{IpAddr, Ipv4Addr, SocketAddr};
use std::time::Duration;

use encephalon::Embedded;

use crate::brain_face::{self, BrainFaceHandle};

/// 前端默认的端脑地址（`src/stores/telencephalonStore.ts` 的
/// `DEFAULT_BASE_URL`）—— sidecar 与前端共享这一个端口。
pub const DEFAULT_ADDR: SocketAddr = SocketAddr::new(IpAddr::V4(Ipv4Addr::LOCALHOST), 60080);

/// 端脑的 shadow API 前缀（会话 / agent）—— 前端 `telencephalonClient.ts`
/// 的 `createConversation` / `streamMessage` 打的就是这里。
pub const SHADOW_API_PREFIX: &str = "/shadow/v1";

/// 海马体在端脑面上的前缀 —— 和端脑自己的挂法一致
/// （`telencephalon/src/api/mod.rs`：`outer.nest("/hippocampus", h)`）。
pub const HIPPOCAMPUS_PREFIX: &str = "/hippocampus";

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

/// 脑面给海马体的**地址** —— 「本地推理只由大脑中的 neuron 提供」
/// 这条在桌面端的落点。
///
/// ⚠️ **为什么必须由宿主注入**：海马体是**端脑**在 boot 时建的那一份
/// ⇒ ⇒ 它自己**不知道**脑面在哪 ⇒ ⇒ 只有宿主知道脑面地址（`DEFAULT_ADDR`）。
///
/// ⚠️ **地址为什么带 `/v1`**：neuron 的 OpenAI 兼容面被 merge 在脑面**根**上
/// ⇒ ⇒ 推理面是 `http://127.0.0.1:60080/v1/...`（`/v1/chat/completions`、
/// `/v1/embeddings`）。
///
/// ⚠️⚠️ **这里只有地址，没有钥匙**（2026-11-09 实测后改的形状）：
/// ⇒ ⇒ 桌面端**不再**把 admin token 写进**进程环境**（`HIPPOCAMPUS_BRAIN_TOKEN`）
/// ⇒ ⇒ 那条通道会把凭据摊给同用户进程 / 子进程 / 崩溃转储 / 日志采集
/// ⇒ ⇒ 明文密钥落盘闸盯的就是那一格；
/// ⇒ ⇒ 钥匙改由**端脑自己那把 admin token** 出（端脑手里本来就是同一把）
/// ⇒ ⇒ 秘密只活在**进程堆里**。
pub fn brain_face_base() -> String {
    format!("http://{DEFAULT_ADDR}/v1")
}

/// 脑面地址 —— **按真在监听的那个地址算**（2026-11-09）。
///
/// ⚠️ **为什么不再用常量**：此前海马体拿到的地址是**猜的**（`DEFAULT_ADDR`）
/// ⇒ ⇒ 而那只是「桌面端**打算**用哪个口」⇒ ⇒ 端脑 boot 时那个口上坐的
///    **未必是它** ⇒ ⇒ 详见 `serve` 里「顺序是这一刀的全部」那段。
/// ⇒ ⇒ 现在地址取自**我们自己占住的那个 listener** ⇒ ⇒ 那个地址上坐的
///    **只可能是我们自己** ⇒ ⇒ 海马体不可能打进**陌生的大脑**。
pub fn brain_face_base_for(addr: SocketAddr) -> String {
    format!("http://{addr}/v1")
}

/// **这一格现在由谁接**（2026-11-09 实测后改的形状）：
///
/// ⚠️ 此前是「桌面端把**地址 ＋ 钥匙**塞进**进程环境**」（`HIPPOCAMPUS_BRAIN_BASE`
/// / `HIPPOCAMPUS_BRAIN_TOKEN`）⇒ ⇒ 凭据落在进程环境里 ⇒ ⇒ 同用户进程 / 子进程 /
/// 崩溃转储 / 日志采集都会把它带走 ⇒ ⇒ **明文密钥落盘闸红的就是那一格**。
///
/// ⚠️ **现在**：桌面端只把**地址**递进端脑的 `BuildOptions::brain_face_base`
/// ⇒ ⇒ **钥匙由端脑自己那把 admin token 出**（端脑手里本来就是同一把 ——
/// `BuildOptions::admin_token` 已经是它了）⇒ ⇒ 秘密只活在**进程堆里**。
///
/// ⚠️ **为什么地址仍由宿主给**：端脑**不知道**自己的面挂在哪个**宿主端口**上
/// （桌面端是 60080）⇒ ⇒ 那是宿主的事实 ⇒ ⇒ 与 `control_plane` / `identity_dir`
/// 同一套路：**引导参数从初始化方法进来**。
///
/// ⚠️ 这条通道现在**没有函数**了 —— 因为**它不再需要在 boot 前做任何事**：
/// ⇒ ⇒ 地址随 `BuildOptions` 一起进 `build_app_state_with` ⇒ ⇒ 海马体在
/// boot 期就拿到了它 ⇒ ⇒ **时序天然对**（此前那版「boot 前写 env、
/// boot 期读 env」是**两处**，中间任何一次 `remove_var` 都会掐断它）。

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

    // ⚠️⚠️⚠️ **顺序是这一刀的全部**：**先占住脑面那个口，再建端脑**
    // （2026-11-09 真机实测 + 用户拍板「端脑延迟放行」）。
    //
    // ⇒ ⇒ **为什么**：端脑 boot 期就把脑面**地址**递给了海马体 ⇒ ⇒ 海马体
    //    的本地推理/嵌入请求打的是那个地址 ⇒ ⇒ 而此前 **bind 发生在
    //    build_face 之后** ⇒ ⇒ **boot 到 bind 之间**那段时间里 60080 上
    //    坐的可能是**占着它的陌生进程**（独立端脑服务器 / 上一轮的残留）
    //    ⇒ ⇒ 海马体的记忆与推理就落进了**陌生的大脑**（身份、记忆、叶区
    //    全不是他的）⇒ ⇒ 而**界面上看不出任何异常**（请求成功 ⇒ 只是
    //    回了一个**别人的**答案）⇒ ⇒ **失败长得像成功**。
    //
    // ⇒ ⇒ 现在：**端口先被我占住** ⇒ ⇒ 端脑 boot 时那个地址上坐的
    //    **只可能是我自己** ⇒ ⇒ 「延迟放行」＝「绑定成功前，地址不交出去」。
    //
    // ⚠️ **绑不上 ⇒ ⇒ 端脑不 boot ⇒ ⇒ 地址不递出去**（不是「递一个
    //    可能被别人占的地址」）⇒ ⇒ 那一格海马体**还不存在** ⇒ ⇒ 它的
    //    推理请求会**诚实地失败**（而不是悄悄打进别人的大脑）
    //    ⇒ ⇒ 界面上的 `brain_face` 状态同时会说真话（conflict ＋ 原因）。
    // ⚠️ `bind_until_owned` **不返回 Err** —— 端口被别人占着时它**无限重试**
    // ⇒ ⇒ 这一行在端口没被占着之前**不会**返回 ⇒ ⇒ **端脑也就不会
    //    在端口被别人占着的时候 boot** ⇒ ⇒ 「延迟放行」就落在这**一行**上
    //    ⇒ ⇒ 绑不上 ⇒ **地址不递出去**（海马体连端脑都还没建出来）
    //    ⇒ ⇒ 而不是「递一个可能被别人占的地址」。
    //
    // ⇒ ⇒ 状态由 `bind_until_owned` **自己**写（conflict ＋ 真实原因）
    // ⇒ ⇒ 界面能说真话：「现在连的那个 60080 不是这个 App 的大脑」。
    let listener = brain_face::bind_until_owned(
        &face,
        DEFAULT_ADDR,
        Duration::from_secs(BIND_RETRY_SECS),
    )
    .await;

    // ⚠️ **地址从「真的那个 listener」取** —— 不是从常量猜 ⇒ ⇒ 端口被换过
    //    （将来桌面端换口）时，海马体拿到的仍然是**真在监听的那个**。
    let bound_addr = listener.local_addr().unwrap_or(DEFAULT_ADDR);

    let brain_face = match build_face(stack, hippocampus_data_dir, bound_addr).await {
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

    // ⚠️ **写回真实地址 ＋ 把叶区指过来**（统一入口的 `note_bound`）——
    // ⇒ 端脑的**自环回**（前额叶转发 / 记忆查询 / agent 清单）打的是
    // `bind.http` ⇒ ⇒ 不写回就是打到一个**没人监听**的端口 ⇒ ⇒
    // connection refused ⇒ ⇒ **而且不报错**。
    //
    // ⚠️ 「router-only」形态下 neuron 没有独立 listener ⇒ ⇒ 叶区的 LLM
    // 端点指的就是**这张面** ⇒ ⇒ 这一步是推理链的最后一跳。
    brain_face.note_bound(bound_addr).await;

    tracing::info!(
        "telencephalon http listening on http://{DEFAULT_ADDR} \
         (端脑 → 叶区：{SHADOW_API_PREFIX}/*, 海马体：{HIPPOCAMPUS_PREFIX}/*)"
    );
    // ⚠️ **双面挂载**（2026-11-03）—— 见 `encephalon::ziti` 的模块文档。
    // ⇒ ⇒ 回环 TCP 面留着（端脑自环回 + 前端 + SSE/WS），另起一张零信任面
    // ⇒ ⇒ 没配 `ZITI_HOST_IDENTITY` ⇒ **不起** ⇒ ⇒ 桌面端行为与今天**一模一样**。
    //
    // ⚠️ **状态要被看见** —— 「这张面起没起」此前**只有一行日志**
    // ⇒ ⇒ 现在句柄带状态（`starting` / `ready` / `failed(原因)`）。
    // ⚠️ 先取 options、再 spawn：`spawn_if_configured` 返回的是
    //    `Option<JoinHandle<()>>`（所有平台都一样）——句柄上没有 `.options()`。
    //    这一行此前的 `face.options().identity_source` **从来没有编译过**：
    //    encephalon 的 `ZitiOptions` 里没有 `identity_source` 这个字段，
    //    而桌面端的 lib 此前只在 Windows 上编过（2026-09），这行是
    //    2026-11-03 加的 ⇒ ⇒ 第一台真的编到它的机器就是 CI 的 Windows。
    match encephalon::ziti::options_from_env() {
        Some(opts) => {
            let _face = encephalon::ziti::spawn_with(brain_face.router.clone(), &opts);
            tracing::info!(
                service = %opts.service_name,
                identity_path = %opts.identity_path,
                "零信任面已启动（terminator 就绪后可 dial）"
            );
        }
        None => tracing::info!("零信任面未配置（没配 ZITI_HOST_IDENTITY）—— 行为与今天一致"),
    }

    if let Err(e) = axum::serve(listener, brain_face.router).await {
        tracing::error!("telencephalon http server stopped: {e}");
        face.set(
            brain_face::STATE_FAILED,
            Some(format!("server stopped: {e}")),
        );
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
    bound_addr: SocketAddr,
) -> Result<encephalon::surface::BrainFace, String> {
    // 端脑自己的 AppState（配置 / lobe 存储 / flow / 会话存储 / 海马体接线）。
    // neuron 传**同一个**嵌入实例 —— 进程内只有一份推理运行时。
    //
    // `identity_dir` 指向**账号身份目录**：账号密钥派生 principal 与
    // 默认人格 ⇒ 这台机器属于哪个人、记忆写进哪个人格，是**这台机器
    // 自己的**属性（不是每请求的属性），所以放在 boot 期解析一次。

    let options = encephalon::telencephalon::boot::BuildOptions {
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
        // ⚠️ **脑面地址** —— 告诉端脑「进程内那份海马体的本地推理指这儿」。
        //
        // ⚠️⚠️ **这里只有地址，没有钥匙**（2026-11-09 实测后改的形状）：
        // ⇒ ⇒ 桌面端**不再**把 admin token 写进**进程环境**
        //    （`HIPPOCAMPUS_BRAIN_TOKEN`）⇒ ⇒ 那条通道会把凭据摊给同用户进程 /
        //    子进程 / 崩溃转储 / 日志采集 ⇒ ⇒ **明文密钥落盘闸红的就是那一格**；
        // ⇒ ⇒ 钥匙改由**端脑自己那把 admin token** 出（端脑手里本来就是同一把
        //    —— 下面那个 `admin_token` 字段就是它）⇒ ⇒ 秘密只活在**进程堆里**。
        //
        // ⚠️ **为什么地址仍由宿主给**：端脑**不知道**自己的面挂在哪个**宿主端口**
        // 上（这里是 60080）⇒ ⇒ 那是宿主的事实。
        brain_face_base: Some(brain_face_base_for(bound_addr)),
        // 桌面端**显式**声明 admin token —— 端脑**不再**替宿主发明一把
        // 开发用的钥匙了。
        //
        // ⚠️ 环境变量优先（`TELENCEPHALON_ADMIN_KEY` / 旧的
        // `CORTEX_ADMIN_KEY`）。
        admin_token: Some(desktop_admin_token()),
        // ⚠️ **本地控制面**（配置中心）—— 记忆存储的设置写在这里，**不是**
        // 写在 Tauri 自己的 config.json 里（2026-11-12）。
        //
        // 为什么要给：端脑的配置中心**只从 `BuildOptions::control_plane`
        // 进来**，没有环境变量兜底 ⇒ 宿主不递 ⇒ 它一直是 `disabled`
        // ⇒ 「记忆存储」设置页写了也读不回来（读面答 503「控制面未连接」）。
        //
        // ⚠️ **本地文件模式**（`Bootstrap { token: None }`）：桌面端本来就编了
        // `telencephalon/turso`（本地 libSQL）⇒ 一个库文件就够，不必依赖
        // 任何远端 Turso。位置与 identity 目录同源（`config_dir/shadow/`）。
        //
        // ⚠️ 生效时机：控制面在 boot 时打开一次 ⇒ 改配置后**重启**才生效
        // （读面回包的 `applies_when` 就是 `restart`）。
        //
        // ⚠️⚠️ **拿不到配置目录 ⇒ 控制面本次不启用（`None`），绝不退化成
        // `:memory:`**（2026-11-13 用户裁定：**持久化数据不许落在内存库里，
        // 缓存才可以**）。内存库在这条链上比「不可用」更糟：写成功、读得回、
        // **重启即失** ⇒ 用户以为存住了 ⇒ **失败长得像成功**。`None` 会让
        // 读面如实答「控制面未连接」，界面说真话。
        control_plane: desktop_control_plane(dirs::config_dir()),
        // ⚠️ **会话存储的兜底文件**（2026-11-13）：只在「这次运行**没有 Lance**」
        // 时生效（记忆面关掉：storage_uri 的 scheme 不支持 / Android 本地根
        // 未放行 / 构建没编 hippocampus）⇒ ⇒ 没有它，那种桌面运行的会话就只剩
        // **纯内存**（重启即失 ⇒ 违反「持久化数据不许住内存库」）。
        //
        // ⚠️ **不能复用 `conversation_store_file`** —— 那个字段**赢过**
        // Lance（移动端用它绕 SELinux 的硬链接限制）⇒ 桌面拿它当兜底会把
        // 自己的 Lance 会话切到 JSON。兜底是**第三档**，只在没有 Lance 时用。
        conversation_store_fallback_file: desktop_conversations_fallback(
            dirs::config_dir(),
        ),
        // **记忆存储换根的断点文件**（2026-11-13）：与 identity / 控制面同源
        // （`config_dir/shadow/`）—— 迁移途中退出、再打开时从这里续跑。
        // ⚠️ 它**不是记忆数据**：只记「搬到哪一步／目标是谁」，不含明文密钥。
        migration_state_file: dirs::config_dir().map(|dir| {
            dir.join("shadow")
                .join("storage-migration.json")
                .to_string_lossy()
                .to_string()
        }),
        // ⚠️ **其余字段走 Default** —— `BuildOptions` 手写了 `Default`
        // ⇒ ⇒ 新增字段时不必在这里补 ⇒ ⇒ 也就不必「改一处、漏一处」
        // （E0063：缺 `control_plane` / `secret_store`）。
        ..Default::default()
    };
    // ⚠️ **门罩住「合并后」的最外层** ⇒ ⇒ neuron 面与 /hippocampus 面**也在**
    // 门型表管辖内 ⇒ ⇒ 它们不再是「同机任何进程都能直连」的后门。
    //
    // ⚠️ **海马体路由由端脑挂**（`encephalon::telencephalon::boot::build_hippocampus_router`）
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

/// 桌面端的**配置中心**引导参数（本地 libSQL **文件**）。
///
/// ⚠️⚠️ **拿不到系统配置目录 ⇒ 返回 `None`（控制面本次不启用），
/// 绝不退化成 `:memory:`**（2026-11-13 用户裁定：**持久化数据不许落在
/// 内存库里，缓存才可以**）。
///
/// 为什么内存库在这条链上比「不可用」更糟：
/// · 写成功（200）＋ 读得回（同一进程内）⇒ 界面显示「已保存」；
/// · **重启即失** ⇒ 用户以为存住了 ⇒ **失败长得像成功**；
/// · 而 `None` 会让读面如实答「控制面未连接」（503）⇒ 界面说真话。
///
/// 纯函数（不碰文件系统）：`Some(dir)` ⇒ `dir/shadow/control-plane.db`；
/// `None` ⇒ `None` ＋ 一条 error 日志（大声，不静默）。
fn desktop_control_plane(
    config_dir: Option<std::path::PathBuf>,
) -> Option<encephalon::telencephalon::config_center::Bootstrap> {
    let Some(dir) = config_dir else {
        tracing::error!(
            "拿不到系统配置目录 ⇒ 配置中心本次**不启用**（绝不退化成 :memory: —— \
             那会让「保存成功」变成重启即失）。记忆存储等设置页会如实显示「读不到」。"
        );
        return None;
    };
    Some(encephalon::telencephalon::config_center::Bootstrap {
        url: dir
            .join("shadow")
            .join("control-plane.db")
            .to_string_lossy()
            .to_string(),
        token: None,
    })
}

/// 会话存储的**兜底文件**（只在该次运行**没有 Lance** 时生效）。
///
/// 与配置中心同目录（`config_dir/shadow/`）；拿不到配置目录 ⇒ `None`
/// （端脑会退回纯内存并**大声报错**：历史重启即失 —— 宁可说出来，
/// 也不假装持久）。
fn desktop_conversations_fallback(config_dir: Option<std::path::PathBuf>) -> Option<String> {
    let dir = config_dir?;
    Some(
        dir.join("shadow")
            .join("conversations.json")
            .to_string_lossy()
            .to_string(),
    )
}

#[cfg(test)]
mod tests {
    use super::*;
    use axum::routing::get;
    use axum::Router;
    use tower::ServiceExt;
    /// ⚠️ **持久化数据不许落在内存库里**（用户裁定 2026-11-13）：
    /// 拿得到配置目录 ⇒ 指向**文件**；拿不到 ⇒ **不启用**（绝不给 `:memory:`）。
    #[test]
    fn control_plane_is_a_file_and_never_in_memory() {
        let dir = std::path::PathBuf::from("C:/tmp/cfg");
        let b = desktop_control_plane(Some(dir)).expect("有目录 ⇒ 有引导参数");
        assert!(b.url.ends_with("shadow/control-plane.db") || b.url.ends_with("shadow\\control-plane.db"),
            "url 必须是文件路径，实际是 {}", b.url);
        assert!(!b.url.contains(":memory:"), "绝不许内存库");
        assert!(b.token.is_none(), "本地文件模式不需要 token");
    }

    #[test]
    fn control_plane_disabled_without_a_config_dir() {
        // 没有配置目录 ⇒ None（读面会如实答「控制面未连接」），
        // ⚠️ 不是 Some(":memory:") —— 那会「写成功、重启即失」。
        assert!(desktop_control_plane(None).is_none());
    }

    /// ⚠️ **没有海马体的桌面运行也要落盘**（2026-11-13）：
    /// 兜底文件是**第三档**（只在没有 Lance 时生效），不能是内存。
    #[test]
    fn conversations_fallback_is_a_file_on_disk() {
        let dir = std::path::PathBuf::from("C:/tmp/cfg");
        let path = desktop_conversations_fallback(Some(dir)).expect("有目录 ⇒ 有兜底文件");
        assert!(
            path.ends_with("shadow/conversations.json")
                || path.ends_with("shadow\\conversations.json"),
            "兜底必须是文件路径，实际是 {path}"
        );
        assert!(!path.contains(":memory:"));
    }

    #[test]
    fn conversations_fallback_is_none_without_a_config_dir() {
        // 没有目录 ⇒ None（端脑会把「纯内存 + 历史会丢」打进 error 日志），
        // ⚠️ 不是编一个相对路径 —— 相对路径会落到不可预期的 cwd。
        assert!(desktop_conversations_fallback(None).is_none());
    }

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
        assert!(
            DEFAULT_ADDR.ip().is_loopback(),
            "the sidecar must stay on loopback"
        );
    }

    /// **宿主注入给海马体的那一格**：地址必须是**脑面根上的 neuron 面**
    /// （带 `/v1`）。
    ///
    /// ⚠️ 这条钉的是「桌面端把脑面**地址**交给海马体」这个**事实**：
    /// ⇒ ⇒ 少了它，进程内那份海马体的本地推理就落到别处去了
    /// ⇒ ⇒ 「本地推理只由大脑中的 neuron 提供」这条在桌面端落不了地。
    ///
    /// ⚠️⚠️ **这里只钉地址，不钉钥匙** —— 钥匙**不再**由桌面端经进程环境递
    /// ⇒ ⇒ 改由**端脑自己那把 admin token** 出（端脑手里本来就是同一把）
    /// ⇒ ⇒ 秘密只活在**进程堆里**（同用户进程 / 子进程 / 崩溃转储都读不到）。
    #[test]
    fn the_hippocampus_endpoint_is_the_brain_face() {
        assert_eq!(
            brain_face_base(), "http://127.0.0.1:60080/v1",
            "the brain face serves neuron's OpenAI surface at the face root + /v1"
        );
    }

    /// ⚠️⚠️ **钥匙不许进进程环境**（2026-11-09 实测后改的形状的反向钉桩）——
    /// ⇒ ⇒ 「桌面端把 admin token 塞进 env」那条通道**必须**已经消失
    /// ⇒ ⇒ 否则明文密钥落盘闸（`check-secret-plaintext.mjs`）会红。
    ///
    /// ⚠️ **为什么用源码扫描而不是读进程环境**：测试进程自己的 env 未必有那
    /// 两个变量（没人 set 过）⇒ ⇒ 读 env 只能证明「此刻没设」，**证不了**
    /// 「代码里不会再设」⇒ ⇒ 判据必须落在**源码形状**上。
    #[test]
    fn the_desktop_does_not_put_the_brain_key_in_the_process_environment() {
        let src = include_str!("telencephalon_http.rs");
        // ⚠️⚠️ **只扫 `mod tests` 之前那段** —— 否则这条测试**自己**会被扫到
        // ⇒ ⇒ 它的判据文本（`set_var` ＋ 那个变量名）**恰好**长得像违规
        // ⇒ ⇒ ⇒ **自指陷阱** ⇒ ⇒ 测试永远红 ⇒ ⇒ 等于没有这条钉桩。
        let product = src.split_once("mod tests {").map(|(head, _)| head).unwrap_or(src);
        for line in product.lines() {
            let t = line.trim();
            if t.starts_with("//") {
                continue;
            }
            assert!(
                !(t.contains("set_var") && t.contains("HIPPOCAMPUS_BRAIN")),
                "桌面端不许把脑面钥匙写进进程环境（{t}）—— 那条通道会把凭据摊给同用户进程 / 子进程 / 崩溃转储 / 日志采集"
            );
        }
    }

    /// ⚠️⚠️ **海马体的脑面地址必须来自「真在监听的那个 listener」**
    /// （2026-11-09 真机取证 + 用户拍板「端脑延迟放行」）。
    ///
    /// ⇒ ⇒ **为什么**：端脑 boot 期就把脑面**地址**递给了海马体 ⇒ ⇒ 海马体
    ///    的本地推理/嵌入请求打的就是那个地址 ⇒ ⇒ 若那地址是**猜的**
    ///    （常量 `DEFAULT_ADDR`）⇒ ⇒ boot 到 bind 之间那段时间里它上头坐的
    ///    **可能是陌生进程** ⇒ ⇒ 记忆与推理落进**陌生的大脑** ⇒ ⇒
    ///    **界面上看不出任何异常**（失败长得像成功）。
    /// ⇒ ⇒ 现在地址取自**我们自己占住的 listener** ⇒ ⇒ 那个地址上坐的
    ///    **只可能是我们自己**。
    ///
    /// ⚠️ **孪生**：换一个端口 ⇒ ⇒ 地址**必须跟着换** ⇒ ⇒ 若它仍然写死
    ///    60080 ⇒ ⇒ 这条钉桩要红（否则「按 listener 算」是假的）。
    #[test]
    fn the_brain_face_base_follows_the_bound_listener() {
        assert_eq!(
            brain_face_base_for(DEFAULT_ADDR),
            "http://127.0.0.1:60080/v1",
            "the brain face serves neuron's OpenAI surface at the face root + /v1"
        );
        // ⚠️ **孪生**：端口换了 ⇒ ⇒ 地址必须跟着换（不是写死常量）。
        let other: SocketAddr = "127.0.0.1:61999".parse().unwrap();
        assert_eq!(
            brain_face_base_for(other),
            "http://127.0.0.1:61999/v1",
            "the brain face base must follow the listener we actually own, not a constant"
        );
    }

    /// ⚠️⚠️ **顺序钉桩：bind 必须先于 build_face**（2026-11-09）。
    ///
    /// ⇒ ⇒ 这是那一刀的**全部** ⇒ ⇒ 顺序反了 ⇒ ⇒ 海马体拿到的地址
    ///    上坐的**可能不是我们** ⇒ ⇒ 记忆打进陌生的大脑。
    ///
    /// ⚠️ **为什么用源码扫描**：这一格是**时序**，运行期看不到（海马体
    ///    只在第一次请求时才用那个地址）⇒ ⇒ 判据必须落在源码形状上。
    /// ⇒ ⇒ **孪生**：顺序反了的那份源码 ⇒ ⇒ 判据必须**红**（否则这条
    ///    钉桩恒绿 ⇒ ⇒ 等于没有）。
    #[test]
    fn the_brain_face_is_bound_before_the_endbrain_is_built() {
        let src = include_str!("telencephalon_http.rs");
        let product = src.split_once("mod tests {").map(|(head, _)| head).unwrap_or(src);
        let bind_at = product.find("bind_until_owned(").expect("the bind call must exist");
        let build_at = product.find("build_face(").expect("the build call must exist");
        assert!(
            bind_at < build_at,
            "bind must come before build_face: the endbrain hands the hippocampus the brain address at boot, so the port must already be ours — otherwise the hippocampus may talk to a stranger's brain"
        );
    }

    /// ⚠️ **反向孪生**：顺序反了的那份源码 ⇒ ⇒ 判据**必须红**。
    ///
    /// ⇒ ⇒ 否则上面那条钉桩可能恒绿（判据没咬住）⇒ ⇒ 等于没有判据。
    #[test]
    fn the_order_judgement_rejects_a_reversed_source() {
        let reversed = "let f = build_face(x); let l = bind_until_owned(y);";
        let bind_at = reversed.find("bind_until_owned(").unwrap();
        let build_at = reversed.find("build_face(").unwrap();
        assert!(
            bind_at > build_at,
            "the twin source really is reversed — otherwise the twin proves nothing"
        );
        assert!(
            !(bind_at < build_at),
            "a reversed source must not satisfy the ordering judgement"
        );
    }
    /// 叶区清单不能变少 —— 少一个就少一条链路上能到达的能力
    /// （temporal = 对话 / 意图，prefrontal = 任务，parietal = 编排）。
    ///
    /// ⚠️ **判据换成「注册表里真的有」**（2026-11-03）—— 以前断言的是一个
    /// **硬编码名单**，而那份名单只说明「我们打算支持谁」；真正决定叶区能不能
    /// 被打到的是**注册表里有没有它** ⇒ ⇒ 断言必须对着真相源。
    #[test]
    fn native_lobes_cover_the_chain() {
        let lobes = encephalon::telencephalon::lobes::NativeLobeRegistry::with_temporal();
        let names: Vec<String> = lobes.all_manifests().into_iter().map(|m| m.name).collect();
        for expected in ["temporal", "prefrontal", "parietal"] {
            assert!(
                names.iter().any(|n| n == expected),
                "lobe {expected} must be registered — otherwise that capability is unreachable"
            );
        }
    }
}
