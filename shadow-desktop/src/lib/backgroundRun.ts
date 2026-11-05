/**
 * 「开机自启」—— 桌面端后台运行补齐的前端面（tauri-plugin-autostart）。
 *
 * ## 它管什么
 *
 * 托盘常驻已经让 Shadow 在**关窗后**活着；自启把这件事延展到
 * **登录时** —— 开机即驻，不用用户手动点开。Rust 侧接线见
 * `src-tauri/src/lib.rs`（`tauri_plugin_autostart::init`），
 * 权限见 `src-tauri/capabilities/default.json` 的 `autostart:default`。
 *
 * ## ⚠️ 读不到 ≠ 关着
 *
 * web 构建没有这个能力 ⇒ `isAutostartEnabled()` 回 **null**（「判不了」）
 * —— 界面据此**禁用**开关并说明，**不许**把 null 显示成「未开启」
 * （那是撒谎：web 构建根本没有「开」这个状态）。
 */

import { isTauri } from './platform';

/**
 * 当前自启状态。boolean = 真实状态；null = 判不了（web 构建 / 命令失败）。
 */
export async function isAutostartEnabled(): Promise<boolean | null> {
  if (!isTauri()) return null;
  try {
    const { isEnabled } = await import('@tauri-apps/plugin-autostart');
    return await isEnabled();
  } catch {
    return null;
  }
}

/**
 * 设置自启。web 构建 ⇒ 明确抛错（调用方把错误说出来，不静默吞）。
 */
export async function setAutostartEnabled(value: boolean): Promise<void> {
  if (!isTauri()) {
    throw new Error('autostart is not available in the web build');
  }
  const { enable, disable } = await import('@tauri-apps/plugin-autostart');
  if (value) {
    await enable();
  } else {
    await disable();
  }
}
