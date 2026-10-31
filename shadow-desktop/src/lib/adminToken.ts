/**
 * 这台机器的 admin token —— 前端要拿它去带 `X-Admin-Token`。
 *
 * ## 为什么需要它（2026-10-31）
 *
 * 端脑原来有一条后门：`verify_admin_token` 里
 * `if expected == "dev-admin-key" { return Ok(()); }` ⇒ expected 恰好是那个
 * **源码里的字面量**时，**连请求头都不看**就放行。
 *
 * ⚠️ 而桌面端递进去的 expected **恰好就是** `dev-admin-key` ⇒ ⇒ 桌面端的
 * admin 面**任何请求都过**（不带凭据也过）⇒ 再叠加端脑面的
 * `CorsLayer::permissive()`（任意 origin 可跨域、并且**能读到响应**）⇒ ⇒
 * **浏览器里任意一个网站**都能往用户的大脑里插一个它自己写的叶区
 * （`POST /api/telencephalon/admin/agents/create`）= 往模型面前插一条自己
 * 写的路。
 *
 * ⇒ 端脑不再认任何人（`dev-admin-key` 现在只是一把**普通的** token）⇒
 * ⇒ 桌面端于是**自己生成一把随机的**并持久化（Rust 侧 `admin_token.rs`，
 * 环境变量可覆盖）⇒ ⇒ 前端通过 Tauri 命令 `get_admin_token` 拿到它。
 *
 * ⚠️ **绝不打日志**：这把钥匙进了日志 = 泄了。
 *
 * ## web 版
 *
 * web 版没有 sidecar ⇒ 钥匙由运维/用户自己放进
 * `localStorage['shadow-admin-token']` ⇒ **没有就是没有** ⇒ 不带那个头
 * （端脑会 401，并且说清楚原因）。
 */

import { invoke } from '@tauri-apps/api/core';
import { isTauri } from './platform';

/** web 版由用户/运维自己填（没有就是没有 ⇒ 不带那个头）。 */
const STORAGE_KEY = 'shadow-admin-token';

let cached: string | undefined;

/** 问 sidecar 要那把钥匙（Tauri）。 */
async function fromSidecar(): Promise<string | undefined> {
  if (!isTauri()) return undefined;
  try {
    const token = await invoke<string>('get_admin_token');
    return token?.trim() || undefined;
  } catch {
    // 老版本的 sidecar 没有这个命令 ⇒ 那就没有这把钥匙（不是致命错误）。
    return undefined;
  }
}

/** web 版：从 localStorage 取。 */
function fromStorage(): string | undefined {
  try {
    return window.localStorage.getItem(STORAGE_KEY)?.trim() || undefined;
  } catch {
    return undefined;
  }
}

/**
 * 这台机器的 admin token（Tauri 优先；拿不到就是 `undefined`）。
 *
 * ⚠️ 结果**在进程内缓存**：Tauri 命令是一次 IPC，缓存住 ⇒ 每次请求不必
 * 都过一趟 IPC。
 */
export async function getAdminToken(): Promise<string | undefined> {
  if (cached) return cached;
  const token = (await fromSidecar()) ?? fromStorage();
  if (token) cached = token;
  return token;
}

/**
 * 带凭据的 header —— **没有钥匙就不带那个头**。
 *
 * ⚠️ 故意**不**塞任何占位值：一个空的 `X-Admin-Token` 头在旧实现里与空串
 * `ct_eq` 相等 ⇒ **过**（手机上曾经就是这样 ⇒ 整个 admin 面开着）。⇒
 * 宁可不带（端脑回 401，说人话），也不要带一个假的。
 */
export async function adminHeaders(): Promise<Record<string, string>> {
  const token = await getAdminToken();
  return token ? { 'X-Admin-Token': token } : {};
}

/** 测试用：清掉进程内缓存。 */
export function __resetAdminTokenCache(): void {
  cached = undefined;
}
