//! 任务 id → 目录路径的**唯一**入口。
//!
//! # 为什么有这一层
//!
//! 任务 id 是**外部输入**（Tauri 命令的入参，来自 webview；将来还会来自
//! 脑/task 系统），而它在三处被直接拼进文件系统路径：
//!
//! - `result_manager::repo_path` ⇒ `create_dir_all` ＋ `git init` ＋ 写
//!   README ＋ commit；
//! - `read_task_xlsx` ⇒ 读文件并**把字节回传给调用方**；
//! - `write_task_xlsx` ⇒ `create_dir_all` ＋ 写**调用方给的内容**。
//!
//! 未校验的 task_id ⇒ **路径穿越**：
//! - `../../../../tmp/x` ⇒ 逃出 `~/.shadow/results/`；
//! - Windows 上 `join` 遇**绝对路径**会**整体替换** base ⇒
//!   `C:\Users\victim\.ssh` 直接成为目标目录；
//! - ⇒ 任意目录创建、任意文件读（外泄）、任意文件写（内容任意）。
//!
//! ⇒ ⇒ 所以：**任何把 task_id 变成路径的地方，都必须先过这里**。
//!
//! # 判据（fail-closed）
//!
//! task id 必须是**恰好一个**普通路径分量：
//!
//! - 非空（去空白后）；
//! - `Path::components()` 恰好一个 `Component::Normal` —— 这一条同时挡掉
//!   绝对路径（Windows 盘符/UNC/Unix 根）、`..`、`.`、以及多段路径；
//! - 不含 `/` 或 `\` —— **跨平台**判据：Unix 上 `\` 是合法文件名字符，
//!   若只在 Unix 造出 `a\b`，到了 Windows 就是分隔符 ⇒ 必须两边都拒；
//! - 不含控制字符（NUL 之类会让后续 fs 调用以奇怪的方式失败）。

use std::path::{Component, Path, PathBuf};

/// 校验一个 task id 可否当作**单个目录名**使用。
///
/// 失败时返回一句**说人话**的原因（这个字符串会直接回到调用方的界面）。
pub fn validate_task_id(task_id: &str) -> Result<(), String> {
    let trimmed = task_id.trim();
    if trimmed.is_empty() {
        return Err("task id 不能为空".to_string());
    }
    if trimmed != task_id {
        return Err(format!(
            "task id 两侧有空白（{trimmed:?}）—— 拒绝，避免同一个任务有两个名字"
        ));
    }
    if trimmed.chars().any(|c| c.is_control()) {
        return Err("task id 含控制字符".to_string());
    }
    // 跨平台：两个平台都把这两个当分隔符。
    if trimmed.contains('/') || trimmed.contains('\\') {
        return Err(format!(
            "task id 含路径分隔符（{trimmed:?}）—— 任务目录只能是 base 下的一个名字"
        ));
    }
    // 恰好一个普通分量 ⇒ 挡掉绝对路径 / `..` / `.` / 多段。
    let mut components = Path::new(trimmed).components();
    let only = components.next();
    let extra = components.next();
    match (only, extra) {
        (Some(Component::Normal(_)), None) => Ok(()),
        (None, _) => Err("task id 不能为空".to_string()),
        (Some(Component::Normal(_)), Some(_)) => Err(format!(
            "task id 含多段路径（{trimmed:?}）—— 任务目录只能是 base 下的一个名字"
        )),
        (Some(_), _) => Err(format!(
            "task id 不是单个目录名（{trimmed:?}）—— 绝对路径与 `..` 都被拒绝"
        )),
    }
}

/// 任务目录 = `base/<task_id>`，task id 校验不过就**拒绝**。
pub fn task_dir(base: &Path, task_id: &str) -> Result<PathBuf, String> {
    validate_task_id(task_id)?;
    Ok(base.join(task_id))
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn accepts_a_plain_task_id() {
        assert!(validate_task_id("task-001").is_ok());
        assert!(validate_task_id("web_app_2026").is_ok());
    }

    #[test]
    fn rejects_parent_dir() {
        assert!(validate_task_id("..").is_err());
        assert!(validate_task_id("../evil").is_err());
        assert!(validate_task_id("..\\evil").is_err());
        assert!(validate_task_id("a/../../b").is_err());
    }

    #[test]
    fn rejects_current_dir() {
        assert!(validate_task_id(".").is_err());
    }

    #[test]
    fn rejects_absolute_paths() {
        assert!(validate_task_id("/etc/passwd").is_err());
        assert!(validate_task_id("C:\\Users\\victim").is_err());
        assert!(validate_task_id("\\\\server\\share").is_err());
    }

    #[test]
    fn rejects_separators_on_every_platform() {
        // Unix 上 `\` 是合法文件名字符 —— 但 Windows 上它是分隔符 ⇒
        // 两边都拒 ⇒ 一个 id 不会在另一个平台上变成路径。
        assert!(validate_task_id("a\\b").is_err());
        assert!(validate_task_id("a/b").is_err());
    }

    #[test]
    fn rejects_empty_and_whitespace_padded() {
        assert!(validate_task_id("").is_err());
        assert!(validate_task_id("   ").is_err());
        assert!(validate_task_id(" task-001").is_err());
        assert!(validate_task_id("task-001 ").is_err());
    }

    #[test]
    fn rejects_control_characters() {
        assert!(validate_task_id("task\u{0}001").is_err());
        assert!(validate_task_id("task\n001").is_err());
    }

    #[test]
    fn task_dir_joins_under_base() {
        let base = Path::new("/tmp/base");
        let dir = task_dir(base, "task-001").unwrap();
        assert_eq!(dir, Path::new("/tmp/base").join("task-001"));
        assert!(task_dir(base, "../escape").is_err());
    }
}
