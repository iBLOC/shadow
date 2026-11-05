/**
 * 「切到远端大脑」的开关 —— 桌面端零信任**客户端**模式的前端面。
 *
 * ## 它管什么
 *
 * 客户端模式 = 60080 上坐**零信任代理**（打进远端大脑）而不是本地大脑
 * 那张面 ⇒⇒ 前端的 baseUrl 一个字都不用改。Rust 侧的接线见
 * `src-tauri/src/ziti_client_config.rs`（落盘 ＋ 启动时应用）。
 *
 * ## ⚠️ 保存 ≠ 生效
 *
 * 60080 上坐谁是**启动时**定死的 ⇒⇒ 保存只落盘，**重启后生效**
 * —— 界面必须把这句话说清楚。
 *
 * ## ⚠️ 这份配置里没有秘密
 *
 * shadow key / admin token 仍走环境变量（`ZITI_CLIENT_SHADOW_KEY` /
 * `ZITI_CLIENT_ADMIN_TOKEN`）⇒⇒ 身份文件路径与服务名**不是**秘密，
 * 但身份文件本身是 —— 别把它打进日志。
 */

import { safeInvoke, safeInvokeOrThrow } from './tauriSafe';
import type { ZitiClientConfig } from './zitiClientConfigTypes';

export type { ZitiClientConfig } from './zitiClientConfigTypes';

/** 没配过时的默认值（web 构建下也用这份渲染）。 */
export const DEFAULT_ZITI_CLIENT_CONFIG: ZitiClientConfig = {
  enabled: false,
  identityPath: '',
  service: '',
};

/**
 * ⚠️ **producer 回的是 snake_case，界面这一侧用 camelCase** —— 两端必须在这里对齐。
 *
 * · Rust 侧 ZitiClientConfig { identity_path } 用 serde 的**默认字段名**序列化
 *   ⇒ ⇒ Tauri 命令的**回包**是 {"enabled":…,"identity_path":…,"service":…}（snake_case）。
 * · **实参**方向恰好相反：JS 传 camelCase、Tauri 自动映射到 Rust 的 snake_case
 *   ⇒ ⇒ 所以**保存**方向是通的（那正是测试 ② 钉着的地方）。
 * · ⇒ ⇒ **读回**方向曾经直接读 cfg.identityPath ⇒ ⇒ 拿到的是 undefined
 *   ⇒ ⇒ 用户存过的身份文件路径在设置页**回填不出来**；
 *   ⇒ ⇒ 而**保存**的回包同样没归一 ⇒ ⇒ 存完那一瞬输入框**被清空**
 *   ⇒ ⇒ ⇒ 用户看着像「保存没生效」。
 * ⇒ ⇒ 所以这里**显式**归一：producer 的 snake_case 与界面自己的 camelCase 都认。
 *
 * ⚠️ 落盘的 ziti-client.json **不动**（仍是 snake_case）⇒ ⇒ 老配置照常读得到。
 */
function normalizeConfig(raw: unknown): ZitiClientConfig {
  const r = (raw ?? {}) as Record<string, unknown>;
  return {
    enabled: Boolean(r.enabled),
    identityPath: String(r.identityPath ?? r.identity_path ?? ''),
    service: String(r.service ?? ''),
  };
}

/** 读当前配置（web 构建回落默认值 ⇒ 表照常渲染，保存时会明确报不可用）。 */
export async function getZitiClientConfig(): Promise<ZitiClientConfig> {
  const cfg = await safeInvoke<unknown>(
    'ziti_client_get_config',
    undefined,
    DEFAULT_ZITI_CLIENT_CONFIG,
  );
  return normalizeConfig(cfg);
}

/**
 * 保存配置。开着但字段不全 ⇒ Rust 侧**明确拒绝**（这里会把 Err 抛出来）
 * ⇒⇒ 所以走 `safeInvokeOrThrow`，**不吞错**（吞了就是「点了保存没反应」）。
 * ⚠️ 只落盘 —— 重启后生效。
 */
export async function setZitiClientConfig(
  config: ZitiClientConfig,
): Promise<ZitiClientConfig> {
  const saved = await safeInvokeOrThrow<unknown>('ziti_client_set_config', {
    enabled: config.enabled,
    identityPath: config.identityPath,
    service: config.service,
  });
  // ⚠️ 回包也要归一 —— 否则存完那一瞬输入框会被清空（producer 回 snake_case）。
  return normalizeConfig(saved);
}

/**
 * 这一次启动**实际在用**的模式 —— 60080 上坐的是不是零信任代理。
 *
 * ⚠️ 它与「保存的配置」可以不一致，而且**两个方向**都会：
 * · 保存只落盘、**重启才生效** ⇒ 刚存完：配置已开，运行中仍是本地大脑；
 * · 环境变量（`ZITI_CLIENT_IDENTITY`）也能打开客户端模式 ⇒ 配置关着，运行中却是客户端。
 * ⇒ ⇒ 徽章必须读**这个**，不能读勾选框（勾一下徽章就跟着变 = 界面在撒谎）。
 *
 * web 构建拿不到 ⇒ `null` ——「判不了」，**不是**「本地大脑」。
 */
export async function getZitiClientRuntimeMode(): Promise<boolean | null> {
  const mode = await safeInvoke<boolean>('ziti_client_runtime_mode');
  return typeof mode === 'boolean' ? mode : null;
}
