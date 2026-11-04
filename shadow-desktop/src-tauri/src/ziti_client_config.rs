//! 「切到远端大脑」的开关 —— 桌面端零信任**客户端**模式的持久化配置。
//!
//! ## 背景
//!
//! 客户端模式（60080 上坐**零信任代理**而不是本地大脑那张面）此前只能靠
//! 环境变量（`ZITI_CLIENT_IDENTITY` / `ZITI_CLIENT_SERVICE`）打开 ——
//! 那是「会用终端的人」的路径。这个模块把同一个决定搬进**设置页**：
//! 落盘一份非密钥配置，启动时读它 ⇒ ⇒ 与 env 走的是**同一条**
//! `encephalon::ziti_client` 接缝（`set_options`），行为零分叉。
//!
//! ## ⚠️ 这份文件里**没有秘密**
//!
//! shadow key / admin token **不进**这份配置 —— 它们仍走环境变量
//! （`ZITI_CLIENT_SHADOW_KEY` / `ZITI_CLIENT_ADMIN_TOKEN`）。
//! 落盘的即使被拷走，也换不来任何一台大脑的门
//! （不新增「明文密钥落盘」那族债）。
//!
//! ## 优先级：**这份文件（设置页）赢过环境变量**
//!
//! 用户在界面里说清楚了「这台机器当客户端」⇒ ⇒ 那是**最新的**
//! 显式决定 ⇒ ⇒ env 是没配开关时的后备（没文件 / 没启用 / 字段不全
//! ⇒ 一律回落 env，行为与今天一模一样）。
//!
//! ## 生效时机：**下一次启动**
//!
//! 60080 上坐谁是 `telencephalon_http::serve` 在启动时定的
//! （[`crate::telencephalon_http::serve`] 的 `is_client_mode()` 分支）
//! ⇒ ⇒ 保存只落盘，**运行中不换面** ⇒ ⇒ 界面必须把「重启后生效」说清楚。

use serde::{Deserialize, Serialize};
use std::path::{Path, PathBuf};

/// 持久化的客户端配置（**非密钥**）。
#[derive(Debug, Clone, Default, PartialEq, Eq, Serialize, Deserialize)]
pub struct ZitiClientConfig {
    /// 开关 —— 关着 ⇒ 文件即使存在也不生效（回落 env）。
    #[serde(default)]
    pub enabled: bool,
    /// ziti 身份文件路径（enrollment 产物）。
    #[serde(default)]
    pub identity_path: String,
    /// 要拨的零信任服务名（远端大脑发布的那条服务）。
    #[serde(default)]
    pub service: String,
}

impl ZitiClientConfig {
    /// 开了，且两个字段都齐 ⇒ 才算「配置完整」。
    /// ⚠️ 字段不齐**不报错也不半生效** —— 回落 env，把决定留给下一次保存。
    pub fn is_complete(&self) -> bool {
        self.enabled && !self.identity_path.trim().is_empty() && !self.service.trim().is_empty()
    }
}

/// 配置文件位置 —— 与 [`crate::admin_token`] 同一个目录约定。
fn default_config_path() -> Option<PathBuf> {
    dirs::config_dir().map(|dir| dir.join("shadow").join("ziti-client.json"))
}

/// 从 `path` 读配置。文件不存在 ⇒ `None`；**解析失败也 `None`**
/// （坏文件当成「没配」⇒ 回落 env，绝不 panic）。
pub fn load_from(path: &Path) -> Option<ZitiClientConfig> {
    let text = std::fs::read_to_string(path).ok()?;
    match serde_json::from_str::<ZitiClientConfig>(&text) {
        Ok(cfg) => Some(cfg),
        Err(e) => {
            tracing::warn!("ziti-client.json 解析失败（当成没配）: {e}");
            None
        }
    }
}

/// 把配置写到 `path`（父目录不存在就建）。
pub fn save_to(path: &Path, cfg: &ZitiClientConfig) -> Result<(), String> {
    if let Some(parent) = path.parent() {
        std::fs::create_dir_all(parent)
            .map_err(|e| format!("create {}: {e}", parent.display()))?;
    }
    let text =
        serde_json::to_string_pretty(cfg).map_err(|e| format!("serialize config: {e}"))?;
    std::fs::write(path, text).map_err(|e| format!("write {}: {e}", path.display()))
}

/// 启动时应用 —— **必须在 `telencephalon_http::serve` 之前调用**。
///
/// 配置完整 ⇒ `set_options(Some(...))`（显式 setter 赢过 env）；
/// 没文件 / 没启用 / 字段不全 ⇒ 什么都不做 ⇒ env 照旧生效。
pub fn apply_at_startup() {
    apply_at_startup_with(
        &default_config_path().map_or_else(PathBuf::new, |p| p),
    );
}

/// [`apply_at_startup`] 的可测形态（路径可注入）。
pub fn apply_at_startup_with(path: &Path) {
    if path.as_os_str().is_empty() {
        return; // 拿不到 config_dir ⇒ 这台机器没有设置页可配 ⇒ env 照旧
    }
    let Some(cfg) = load_from(path) else {
        return;
    };
    if !cfg.is_complete() {
        tracing::warn!(
            "ziti-client.json 开着但字段不全（identity/service 有空）⇒ 本次启动回落环境变量"
        );
        return;
    }
    let options = encephalon::ziti_client::ClientOptions::new(
        cfg.identity_path.trim(),
        cfg.service.trim(),
    );
    encephalon::ziti_client::set_options(Some(options));
    // ⚠️ 身份路径**不打全** —— 它指向的身份文件本身就是这台机器在网上的身份。
    tracing::info!(
        "零信任客户端模式（设置页配置）：identity=…{}，service={}",
        cfg.identity_path
            .rsplit(['/', '\\'])
            .next()
            .unwrap_or("?"),
        cfg.service
    );
}

/// 读当前配置（前端设置页用）。没配过 ⇒ 全默认。
#[tauri::command]
pub fn ziti_client_get_config() -> ZitiClientConfig {
    default_config_path()
        .and_then(|p| load_from(&p))
        .unwrap_or_default()
}

/// 保存配置（前端设置页用）。⚠️ **只落盘，运行中不换面** —— 重启后生效。
///
/// 开着但字段不全 ⇒ **明确拒绝**（不是先收下再说 —— 那会让
/// 「开关开了却毫无反应」长得像成功）。
#[tauri::command]
pub fn ziti_client_set_config(
    enabled: bool,
    identity_path: String,
    service: String,
) -> Result<ZitiClientConfig, String> {
    let cfg = ZitiClientConfig {
        enabled,
        identity_path: identity_path.trim().to_string(),
        service: service.trim().to_string(),
    };
    if cfg.enabled && !cfg.is_complete() {
        return Err(
            "启用零信任客户端需要同时填写身份文件路径与服务名".to_string(),
        );
    }
    let Some(path) = default_config_path() else {
        return Err("这台机器没有可用的配置目录".to_string());
    };
    save_to(&path, &cfg)?;
    Ok(cfg)
}

#[cfg(test)]
mod tests {
    use super::*;

    fn temp_path(tag: &str) -> PathBuf {
        let dir = std::env::temp_dir().join(format!(
            "ziti-client-config-test-{}-{tag}",
            std::process::id()
        ));
        std::fs::create_dir_all(&dir).unwrap();
        dir.join("ziti-client.json")
    }

    #[test]
    fn roundtrip_preserves_all_fields() {
        let path = temp_path("roundtrip");
        let cfg = ZitiClientConfig {
            enabled: true,
            identity_path: "/home/u/identity.json".to_string(),
            service: "shadow-brain".to_string(),
        };
        save_to(&path, &cfg).unwrap();
        let loaded = load_from(&path).unwrap();
        assert_eq!(loaded, cfg);
        std::fs::remove_dir_all(path.parent().unwrap()).unwrap();
    }

    #[test]
    fn missing_file_is_none_and_bad_json_is_none() {
        let path = temp_path("missing");
        std::fs::remove_file(&path).ok();
        assert!(load_from(&path).is_none());
        std::fs::write(&path, "{not json").unwrap();
        assert!(load_from(&path).is_none());
        std::fs::remove_dir_all(path.parent().unwrap()).unwrap();
    }

    #[test]
    fn completeness_requires_enabled_and_both_fields() {
        let base = |e: bool, i: &str, s: &str| ZitiClientConfig {
            enabled: e,
            identity_path: i.to_string(),
            service: s.to_string(),
        };
        assert!(!base(false, "/i", "s").is_complete());
        assert!(!base(true, "", "s").is_complete());
        assert!(!base(true, "/i", "  ").is_complete());
        assert!(base(true, "/i", "s").is_complete());
    }

    #[test]
    fn incomplete_config_never_sets_options() {
        // ⚠️ 这条钉的是「字段不全 ⇒ 回落 env，**不半生效**」。
        // set_options 影响的是进程级单例；这里先清掉，再喂一份不完整的
        // 配置 ⇒ 断言它**仍然**是 None（没被设置）。
        encephalon::ziti_client::set_options(None);
        let path = temp_path("incomplete");
        save_to(
            &path,
            &ZitiClientConfig {
                enabled: true,
                identity_path: String::new(),
                service: "shadow-brain".to_string(),
            },
        )
        .unwrap();
        apply_at_startup_with(&path);
        assert!(encephalon::ziti_client::explicit_options().is_none());
        std::fs::remove_dir_all(path.parent().unwrap()).unwrap();
    }

    #[test]
    fn complete_config_sets_options_explicitly() {
        encephalon::ziti_client::set_options(None);
        let path = temp_path("complete");
        save_to(
            &path,
            &ZitiClientConfig {
                enabled: true,
                identity_path: "/tmp/id.json".to_string(),
                service: "shadow-brain".to_string(),
            },
        )
        .unwrap();
        apply_at_startup_with(&path);
        let opts = encephalon::ziti_client::explicit_options()
            .expect("完整配置 ⇒ 显式 options 被设置");
        assert_eq!(opts.identity_path, "/tmp/id.json");
        assert_eq!(opts.service_name, "shadow-brain");
        // 清理：别把单例留给同进程的其它测试。
        encephalon::ziti_client::set_options(None);
        std::fs::remove_dir_all(path.parent().unwrap()).unwrap();
    }

    #[test]
    fn disabled_config_never_sets_options() {
        // 关着 ⇒ 文件即使存在也不生效（回落 env）。
        encephalon::ziti_client::set_options(None);
        let path = temp_path("disabled");
        save_to(
            &path,
            &ZitiClientConfig {
                enabled: false,
                identity_path: "/tmp/id.json".to_string(),
                service: "shadow-brain".to_string(),
            },
        )
        .unwrap();
        apply_at_startup_with(&path);
        assert!(encephalon::ziti_client::explicit_options().is_none());
        std::fs::remove_dir_all(path.parent().unwrap()).unwrap();
    }
}
