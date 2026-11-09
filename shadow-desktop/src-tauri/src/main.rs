// Prevents additional console window on Windows in release, DO NOT REMOVE!!
#![cfg_attr(not(debug_assertions), windows_subsystem = "windows")]

use std::path::PathBuf;

fn main() {
    // ⚠️ **必须在端脑起来之前指好落点** —— 端脑的 `TaskStore::new()`
    // 在构造时就把库读出来 ⇒ ⇒ 指晚了，前面那些任务就白建了。
    point_the_endbrain_at_a_task_file();
    shadow_desktop_lib::run()
}

/// **端脑任务库的落盘文件** —— 宿主显式给 ⇒ ⇒ 端脑零猜测。
///
/// ⚠️ **为什么桌面必须指**：端脑的 `TaskStore::new()` **只在宿主显式指过**
/// 时才落盘（`TELENCEPHALON_TASKS_FILE`；没指就退到「供应商文件的兄弟
/// 文件」—— 而桌面**没有**给供应商文件 ⇒ ⇒ 桌面端脑的任务**重启即失**
/// ⇒ ⇒ 「对话里建的任务，桌面重启后还在」这句话对不上。
///
/// ⚠️ **为什么不按 `$HOME` 猜**：端脑那边**故意**不设 `$HOME` 默认
/// ⇒ ⇒ 那是「跑一次 `cargo test` 就把测试任务写进用户真实文件」的污染入口
/// ⇒ ⇒ **只有宿主显式指过，才落盘**。
///
/// ⚠️ **落点跟 admin key 同目录**（`dirs::config_dir()/shadow/`）
/// ⇒ ⇒ 跟这把钥匙、跟桌面自己的用户数据住在一起（Windows 上是 `%APPDATA%`）。
fn tasks_file_path() -> Option<PathBuf> {
    dirs::config_dir().map(|dir| dir.join("shadow").join("tasks.json"))
}

/// 指路 —— **只在宿主没指过的时候**指（运维显式指定的赢）。
fn point_the_endbrain_at_a_task_file() {
    if std::env::var_os("TELENCEPHALON_TASKS_FILE").is_some() {
        return;
    }
    let Some(path) = tasks_file_path() else {
        return;
    };
    std::env::set_var("TELENCEPHALON_TASKS_FILE", path);
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn the_task_file_lives_beside_the_admin_key() {
        let path = tasks_file_path().expect("the desktop must have a config dir");
        assert!(path.ends_with("shadow/tasks.json"), "got: {path:?}");
        // ⚠️ **跟 admin key 同一个目录** ⇒ ⇒ 一个地方能找到两样东西。
        let admin = dirs::config_dir()
            .expect("config dir")
            .join("shadow")
            .join("admin.key");
        assert_eq!(
            path.parent(),
            admin.parent(),
            "the task file must live beside the admin key"
        );
    }
}
