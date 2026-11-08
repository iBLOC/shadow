//! 端脑面（`127.0.0.1:60080`）的状态 —— 起来了吗？还是被别人占了？
//!
//! ## 为什么这件事必须能被界面看见
//!
//! 桌面前端**只**认 `127.0.0.1:60080`（`telencephalonStore.ts` 的
//! `DEFAULT_BASE_URL`）⇒ ⇒ 桌面端自己的端脑面起不来时，前端**不会**
//! 说「连不上自己的大脑」⇒ ⇒ 它**照常连上去**⇒ ⇒ 而那个端口上是谁，
//! 桌面端不控制 ⇒ ⇒ 可能是一台**别的**端脑（独立端脑服务器 / 上一轮
//! 留下的残留进程）⇒ ⇒ 用户的对话跑进了**陌生的大脑**（身份、记忆、
//! 叶区全不是他的）⇒ ⇒ 而且**失败长得像成功**：界面只显示端脑自己
//! 吐的那句错（「Failed to get models: error sending request for url
//! (http://127.0.0.1:56334/v1/models)」）⇒ ⇒ 没人知道桌面端的大脑
//! 压根没上线。
//!
//! ## 这里只做两件事
//!
//! 1. **自愈**：端口被占 ⇒ 一直重试 ⇒ 占的人一走，桌面端立刻接管；
//! 2. **说真话**：状态可查 ⇒ 界面能说「现在连的不是这个 App 的大脑」。
//!
//! ⚠️ 「自己」是谁在管这件事：**只有桌面端进程内的那一面**才算「自己的」。
//! 端口上恰好有别人的端脑 ⇒ 那是**别人**的大脑 ⇒ `owned = false`。

use std::net::SocketAddr;
use std::sync::{Arc, RwLock};
use std::time::Duration;

use serde::Serialize;
use tokio::net::TcpListener;

/// 状态值 —— 与前端 `src/lib/brainFace.ts` 一一对应。
pub const STATE_STARTING: &str = "starting";
pub const STATE_LISTENING: &str = "listening";
/// 端口被别人占着（Windows 上是 os error **10048**）。
pub const STATE_CONFLICT: &str = "conflict";
/// 别的失败（不是「端口被占」）。
pub const STATE_FAILED: &str = "failed";

/// 端脑面此刻的状态 —— 给界面看的。
#[derive(Clone, Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct BrainFaceStatus {
    /// `starting` / `listening` / `conflict` / `failed`
    pub state: String,
    /// 端脑面地址（一直是 `127.0.0.1:60080`）。
    pub addr: String,
    /// 出错时的**真实原因**（系统错误原文）—— 不许换成别的理由。
    pub error: Option<String>,
    /// 桌面端**自己**的面是否在线。
    ///
    /// `false` ⇒ 前端此刻连的那个 60080 **不是**这个 App 的大脑。
    pub owned: bool,
}

/// 端脑面状态的可共享句柄 —— 启动路径写，界面读。
///
/// ⚠️ 用 `std::sync::RwLock`（不是 tokio 的）⇒ ⇒ 临界区里没有 await
/// ⇒ ⇒ 既不会「持有异步锁跨 await」，测试也不需要执行器。
#[derive(Clone)]
pub struct BrainFaceHandle {
    inner: Arc<RwLock<BrainFaceStatus>>,
}

impl BrainFaceHandle {
    /// 新建一个「还没起来」的状态。
    pub fn new(addr: impl Into<String>) -> Self {
        Self {
            inner: Arc::new(RwLock::new(BrainFaceStatus {
                state: STATE_STARTING.to_string(),
                addr: addr.into(),
                error: None,
                owned: false,
            })),
        }
    }

    /// 当前状态（界面读这个）。
    pub fn status(&self) -> BrainFaceStatus {
        self.inner.read().unwrap_or_else(|e| e.into_inner()).clone()
    }

    /// 写状态 —— **一处实现**，启动路径与测试共用。
    ///
    /// ⚠️ `owned` 不是独立字段而是**由状态推出来的** ⇒ ⇒ 不存在
    /// 「状态说 listening、owned 却是 false」这种自相矛盾。
    pub fn set(&self, state: &str, error: Option<String>) {
        let mut guard = self.inner.write().unwrap_or_else(|e| e.into_inner());
        guard.state = state.to_string();
        guard.error = error;
        guard.owned = state == STATE_LISTENING;
    }
}

/// 一次 bind 失败 ⇒ 这是「端口被占」还是「别的错」？
///
/// ⚠️ Windows 上「地址已被占用」是 os error **10048**
/// （`WSAEADDRINUSE`）⇒ ⇒ `ErrorKind::AddrInUse` 在老工具链上不
/// 一定认得 ⇒ ⇒ 两个都判（`raw_os_error` 是跨工具链都稳的那一半）。
pub fn classify_bind_error(e: &std::io::Error) -> &'static str {
    const WIN_ADDR_IN_USE: i32 = 10048;
    if e.kind() == std::io::ErrorKind::AddrInUse || e.raw_os_error() == Some(WIN_ADDR_IN_USE) {
        STATE_CONFLICT
    } else {
        STATE_FAILED
    }
}

/// 绑上面 —— 一直重试，直到**这个 App 自己的**端脑面拿到这个端口。
///
/// ⚠️ 以前这里是「绑不上就 warn 一句然后放弃」⇒ ⇒ 桌面端的大脑就此
/// 缺席 ⇒ ⇒ 而前端**照常**连 60080 ⇒ ⇒ 连上的是**占着这个端口的
/// 别人**（独立端脑服务器 / 上一轮留下的残留进程）⇒ ⇒ 用户的对话跑进
/// **陌生的大脑**（身份、记忆、叶区全不是他的）⇒ ⇒ 界面上只剩端脑
/// 自己吐的那句错（「Failed to get models: error sending request for url
/// (http://127.0.0.1:56334/v1/models)」）⇒ ⇒ **失败长得像成功**。
///
/// ⇒ 现在：绑不上 ⇒ 记下真实原因（状态可查 ⇒ 界面能说真话）⇒ ⇒
/// **继续重试** ⇒ 占的人一走就接管。（这是后台任务 ⇒ 桌面端照常起来、
/// 设置页照常用。）
///
/// ⚠️ 它住在**状态模块**里（不是 HTTP 面那个文件里）⇒ ⇒ 一处实现、
/// 一处可测 —— 测试不必链接整个桌面端（那个 exe 的链接要 6GB 内存）。
pub async fn bind_until_owned(
    face: &BrainFaceHandle,
    addr: SocketAddr,
    retry: Duration,
) -> TcpListener {
    let mut reported = false;
    loop {
        match TcpListener::bind(addr).await {
            Ok(listener) => {
                face.set(STATE_LISTENING, None);
                if reported {
                    tracing::info!(
                        "telencephalon http: {addr} is free now — this app owns the endbrain \
                         face again."
                    );
                }
                return listener;
            }
            Err(e) => {
                let state = classify_bind_error(&e);
                face.set(state, Some(e.to_string()));
                if !reported {
                    tracing::error!(
                        "telencephalon http: bind {addr} failed ({e}); the frontend will NOT be \
                         talking to this app's brain — retrying every {:?} until the port is free.",
                        retry
                    );
                    reported = true;
                }
                tokio::time::sleep(retry).await;
            }
        }
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn a_fresh_handle_is_starting_and_not_owned() {
        let handle = BrainFaceHandle::new("127.0.0.1:60080");
        let status = handle.status();
        assert_eq!(status.state, STATE_STARTING);
        assert_eq!(status.addr, "127.0.0.1:60080");
        assert!(!status.owned);
        assert!(status.error.is_none());
    }

    #[test]
    fn listening_means_owned_and_a_conflict_means_not() {
        let handle = BrainFaceHandle::new("127.0.0.1:60080");
        handle.set(STATE_LISTENING, None);
        let status = handle.status();
        assert_eq!(status.state, STATE_LISTENING);
        assert!(status.owned);
        assert!(status.error.is_none());

        handle.set(STATE_CONFLICT, Some("boom".into()));
        let status = handle.status();
        assert_eq!(status.state, STATE_CONFLICT);
        assert!(!status.owned, "别人的端脑 ⇒ 不是自己的大脑");
        assert_eq!(status.error.as_deref(), Some("boom"), "真实原因不许丢");
    }

    /// 用**真的**第二个 bind 去量这台机器上的错误形状。
    ///
    /// ⚠️ 为什么不能只测构造出来的 `Error`：2026-11-02 那次事故里的
    /// 真实错误是「通常每个套接字地址(协议/网络地址/端口)只允许使用一次。
    /// (os error 10048)」⇒ ⇒ 它到底落在 `ErrorKind::AddrInUse` 还是别的
    /// 变体上 ⇒ 是**操作系统 + 工具链**说了算 ⇒ ⇒ 不量就不知道分类判对了没有。
    #[tokio::test]
    async fn a_second_bind_to_a_taken_port_is_a_conflict() {
        let first = tokio::net::TcpListener::bind("127.0.0.1:0").await.unwrap();
        let addr = first.local_addr().unwrap();
        let second = tokio::net::TcpListener::bind(addr).await;
        let err = second.expect_err("binding a port twice must fail");
        assert_eq!(
            classify_bind_error(&err),
            STATE_CONFLICT,
            "os error shape: kind={:?} raw={:?} msg={err}",
            err.kind(),
            err.raw_os_error()
        );
    }

    /// 自愈：占着的时候状态是 **conflict**，占的人一走就**接管**。
    ///
    /// ⚠️ 这条就是 2026-11-02 那次事故的形状（端口被一台独立端脑服务器
    /// 占着 ⇒ 桌面端的大脑缺席 ⇒ 用户跟陌生的大脑说话）⇒ ⇒ 这里把它
    /// **做成一条会自己好的路径**，而不是一次性的失败。
    #[tokio::test]
    async fn the_face_takes_the_port_as_soon_as_it_is_free() {
        let squatter = tokio::net::TcpListener::bind("127.0.0.1:0").await.unwrap();
        let addr = squatter.local_addr().unwrap();
        let face = BrainFaceHandle::new(addr.to_string());

        let handle = face.clone();
        let task = tokio::spawn(async move {
            crate::brain_face::bind_until_owned(&handle, addr, Duration::from_millis(50)).await
        });

        // 占着的时候：状态必须是 conflict、而且**不是自己的**大脑
        tokio::time::sleep(Duration::from_millis(300)).await;
        let s = face.status();
        assert_eq!(s.state, STATE_CONFLICT, "端口被占 ⇒ 必须说 conflict");
        assert!(!s.owned, "别人的端脑 ⇒ 不是自己的大脑");
        assert!(s.error.is_some(), "真实原因不许丢");

        // 占的人走了 ⇒ 桌面端接管
        drop(squatter);
        let listener = task.await.unwrap();
        assert_eq!(listener.local_addr().unwrap(), addr);
        let s = face.status();
        assert_eq!(s.state, STATE_LISTENING);
        assert!(s.owned, "接管了 ⇒ 自己的大脑上线");
    }

    #[test]
    fn addr_in_use_is_a_conflict_and_other_errors_are_not() {
        let conflict = std::io::Error::from(std::io::ErrorKind::AddrInUse);
        assert_eq!(classify_bind_error(&conflict), STATE_CONFLICT);

        // Windows 的 10048：即便 ErrorKind 没认出来，raw_os_error 也要认。
        let raw = std::io::Error::from_raw_os_error(10048);
        assert_eq!(classify_bind_error(&raw), STATE_CONFLICT);

        let other = std::io::Error::from(std::io::ErrorKind::PermissionDenied);
        assert_eq!(classify_bind_error(&other), STATE_FAILED);
    }
}
