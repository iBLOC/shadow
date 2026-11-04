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

/** 读当前配置（web 构建回落默认值 ⇒ 表照常渲染，保存时会明确报不可用）。 */
export async function getZitiClientConfig(): Promise<ZitiClientConfig> {
  const cfg = await safeInvoke<ZitiClientConfig>(
    'ziti_client_get_config',
    undefined,
    DEFAULT_ZITI_CLIENT_CONFIG,
  );
  return cfg ?? DEFAULT_ZITI_CLIENT_CONFIG;
}

/**
 * 保存配置。开着但字段不全 ⇒ Rust 侧**明确拒绝**（这里会把 Err 抛出来）
 * ⇒⇒ 所以走 `safeInvokeOrThrow`，**不吞错**（吞了就是「点了保存没反应」）。
 * ⚠️ 只落盘 —— 重启后生效。
 */
export async function setZitiClientConfig(
  config: ZitiClientConfig,
): Promise<ZitiClientConfig> {
  return safeInvokeOrThrow<ZitiClientConfig>('ziti_client_set_config', {
    enabled: config.enabled,
    identityPath: config.identityPath,
    service: config.service,
  });
}
