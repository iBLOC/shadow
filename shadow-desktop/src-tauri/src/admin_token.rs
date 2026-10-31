//! 桌面端的 admin token —— **每台安装自己一把**。
//!
//! ## 为什么要换掉那个常量
//!
//! 端脑原来有一条后门：`verify_admin_token` 里
//! `if expected == "dev-admin-key" { return Ok(()); }` ⇒ expected 恰好是那个
//! **源码里的字面量**时，**连请求头都不看**就放行（`telencephalon/
//! src/security/api_key.rs`，2026-10-31 删掉）。
//!
//! ⚠️ 而桌面端递进去的 expected **恰好就是** `dev-admin-key`（旧的
//! `desktop_admin_token()` 的默认值）⇒ ⇒ **桌面端的 admin 面任何请求都过**
//! ⇒ 再叠加端脑面的 `CorsLayer::permissive()`（任意 origin 可跨域、并且
//! **能读到响应**）⇒ ⇒ **浏览器里任意一个网站**都能：
//!
//! * 往用户的大脑里**插一个它自己写的叶区**
//!   （`POST /api/telencephalon/admin/agents/create`）= 往模型面前插一条
//!   自己写的路；
//! * **读走**用户的云端 LLM 密钥（`GET /models/providers` 回吐明文 —— 那条
//!   2026-10-31 一并改成掩码了）。
//!
//! ⇒ 端脑不再认任何人 ⇒ 桌面端于是**必须自己递一把真钥匙** ⇒ 就是这一档。
//!
//! ## 这把钥匙从哪来
//!
//! 优先级：**环境变量 → 持久化文件 → 首次生成**。
//!
//! * 环境变量（`TELENCEPHALON_ADMIN_KEY` / 旧的 `CORTEX_ADMIN_KEY`）最高
//!   ⇒ 运维显式指定时以它为准；
//! * 持久化文件（`<配置目录>/shadow/admin.key`）⇒ 每次启动读到**同一把**
//!   ⇒ 端脑重启后钥匙不变（前端不用重新配）；
//! * 都没有 ⇒ **生成一把新的**（32 字节随机 ⇒ hex 64 字符）并写盘。
//!
//! ⚠️ **绝不打日志**：只报长度与前 6 位（取证脚本同款规矩）。
//!
//! ⚠️ **文件权限**：Unix 下写 `0600`（只有本人可读）；Windows 下靠
//! `%APPDATA%` 本身的 ACL（用户目录，默认只有本人）。

use std::path::{Path, PathBuf};
use std::sync::OnceLock;

/// 环境变量名（按优先级）。
const ENV_KEYS: [&str; 2] = ["TELENCEPHALON_ADMIN_KEY", "CORTEX_ADMIN_KEY"];

/// 钥匙的字节数 ⇒ hex 之后是 64 个字符。
const TOKEN_BYTES: usize = 32;

/// 进程内只解析一次 —— ⚠️ **必须**：sidecar 与前端命令要拿到**同一把**，
/// 否则前端带的那把端脑不认（⇒ 桌面端的 agent 管理全 401）。
static TOKEN: OnceLock<String> = OnceLock::new();

/// 这台机器的 admin token（进程内唯一）。
pub fn admin_token() -> &'static str {
    TOKEN.get_or_init(resolve)
}

/// 钥匙文件在哪：`<配置目录>/shadow/admin.key`。
fn token_path() -> Option<PathBuf> {
    dirs::config_dir().map(|dir| dir.join("shadow").join("admin.key"))
}

/// 环境变量里指定的那把（有值才算）。
fn env_token() -> Option<String> {
    ENV_KEYS.iter().find_map(|key| {
        std::env::var(key)
            .ok()
            .map(|v| v.trim().to_string())
            .filter(|v| !v.is_empty())
    })
}

/// 已存的那把（有值才算 —— **空文件不是钥匙**）。
fn read_stored(path: &Path) -> Option<String> {
    let content = std::fs::read_to_string(path).ok()?;
    let token = content.trim().to_string();
    if token.is_empty() {
        None
    } else {
        Some(token)
    }
}

/// 写盘（Unix 下 `0600`）。
fn write_stored(path: &Path, token: &str) -> Result<(), String> {
    if let Some(parent) = path.parent() {
        std::fs::create_dir_all(parent)
            .map_err(|e| format!("create {}: {e}", parent.display()))?;
    }
    std::fs::write(path, token).map_err(|e| format!("write {}: {e}", path.display()))?;
    #[cfg(unix)]
    {
        use std::os::unix::fs::PermissionsExt;
        let _ = std::fs::set_permissions(path, std::fs::Permissions::from_mode(0o600));
    }
    Ok(())
}

/// 32 字节随机 ⇒ hex（64 字符）。
fn generate_token() -> String {
    use rand::RngCore;
    let mut bytes = [0u8; TOKEN_BYTES];
    rand::rngs::OsRng.fill_bytes(&mut bytes);
    let mut out = String::with_capacity(TOKEN_BYTES * 2);
    for b in bytes {
        out.push_str(&format!("{b:02x}"));
    }
    out
}

/// 两把候选里挑一把：**环境变量 > 已存的**。
///
/// ⚠️ 空串**不算**钥匙（那是「没配」，不是「配了一把空的」）。
fn choose(env_token: Option<String>, stored: Option<String>) -> Option<String> {
    env_token
        .filter(|t| !t.trim().is_empty())
        .or_else(|| stored.filter(|t| !t.trim().is_empty()))
        .map(|t| t.trim().to_string())
}

/// 解析出这把钥匙（**只跑一次**）。
fn resolve() -> String {
    let path = token_path();
    let stored = path.as_ref().and_then(|p| read_stored(p));
    let env = env_token();

    // 优先级：**环境变量 > 已存的**（`choose` 把空串当「没配」）。
    if let Some(token) = choose(env.clone(), stored) {
        let source = if env.is_some() {
            "the environment"
        } else {
            "the persisted file"
        };
        tracing::info!(len = token.len(), "desktop admin token: set by {source}");
        return token;
    }

    // 3) 都没有 ⇒ 生成一把新的并写盘。
    let token = generate_token();
    match path.as_ref() {
        Some(path) => {
            if let Err(e) = write_stored(path, &token) {
                // ⚠️ 写盘失败**不是致命错误**：钥匙仍然有效，只是下次启动
                // 会换一把 ⇒ 那时前端会拿到新钥匙（前端每次启动都问一次）。
                tracing::warn!("desktop admin token: could not persist ({e})");
            } else {
                tracing::info!(
                    len = token.len(),
                    "desktop admin token: generated and persisted"
                );
            }
        }
        None => {
            tracing::warn!(
                "desktop admin token: generated, but there is no config dir to persist it in"
            );
        }
    }
    token
}

/// 给前端用的 Tauri 命令 —— 前端要拿着它去带 `X-Admin-Token`。
///
/// ⚠️ **别把它打进日志**：前端任何一处 `console.log` 都会把它泄出去。
#[tauri::command]
pub fn get_admin_token() -> String {
    admin_token().to_string()
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn a_generated_token_is_64_hex_chars_and_different_every_time() {
        let a = generate_token();
        let b = generate_token();
        assert_eq!(a.len(), TOKEN_BYTES * 2, "32 字节 ⇒ 64 个 hex 字符");
        assert!(
            a.chars().all(|c| c.is_ascii_hexdigit()),
            "只能是 hex：{a}"
        );
        assert_ne!(a, b, "两次生成必须不同 —— 否则这把钥匙就是公开的");
    }

    #[test]
    fn the_environment_wins_over_the_stored_one() {
        let picked = choose(
            Some("from-env".to_string()),
            Some("from-file".to_string()),
        );
        assert_eq!(picked.as_deref(), Some("from-env"));
    }

    #[test]
    fn an_empty_value_is_not_a_token() {
        // ⚠️ 空串是「没配」，不是「配了一把空的」—— 这一条与端脑侧
        // 「空 expected ⇒ fail-closed」是同一条语义。
        assert_eq!(choose(Some("  ".to_string()), None), None);
        assert_eq!(choose(None, Some(String::new())), None);
        assert_eq!(choose(None, Some("from-file".to_string())).as_deref(), Some("from-file"));
    }

    #[test]
    fn the_stored_token_round_trips() {
        let dir = tempfile::tempdir().unwrap();
        let path = dir.path().join("admin.key");
        let token = generate_token();
        write_stored(&path, &token).unwrap();
        assert_eq!(read_stored(&path).as_deref(), Some(token.as_str()));

        // 空文件 ⇒ 不算钥匙。
        std::fs::write(&path, "   \n").unwrap();
        assert_eq!(read_stored(&path), None);
    }
}
