/**
 * **重启应用** —— 记忆存储迁移完成后的那一步。
 *
 * ⚠️ 为什么必须重启：大脑的存储根**只在 boot 时读一次**（`boot.rs` →
 * `hippocampus_host_config`），运行中的那份海马体状态不可热换
 * ⇒ ⇒ 换了 `storage_uri` 之后，新根要下一次启动才生效。
 *
 * ⚠️ 走 Tauri 自己的 `restart_app` 命令（`AppHandle::restart()`，Tauri 2 自带）
 * —— 不加插件、不加新的 capability 权限。
 *
 * ⚠️ 浏览器 / vitest 里没有 Tauri ⇒ 退回 `location.reload()`：至少让前端
 * 重新拉一次配置（后端状态还在，真机上这一步由重启完成）。
 */
import { invoke } from '@tauri-apps/api/core';

export async function restartApp(): Promise<void> {
  try {
    await invoke('restart_app');
  } catch (e) {
    // 没有 Tauri（浏览器 / 测试态）⇒ 刷新页面；**不吞掉**（日志里留痕，
    // 免得「点了重启没反应」变成静默失败）。
    console.warn('[appRestart] restart_app unavailable, reloading instead', e);
    globalThis.location?.reload?.();
  }
}
