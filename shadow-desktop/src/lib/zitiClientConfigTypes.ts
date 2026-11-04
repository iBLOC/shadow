/**
 * 「切到远端大脑」配置的**纯类型** —— 与 Rust 侧 `ZitiClientConfig` 同形。
 *
 * 单独一个文件 ⇒ 组件测试 / 表单层只 import 类型时不会被
 * `tauriSafe`（它 import `platform` ⇒ `isTauri`）的模块图牵进去。
 */

/** 持久化的客户端配置。⚠️ **不含任何秘密**（凭据走环境变量）。 */
export interface ZitiClientConfig {
  /** 开关 —— 关着 ⇒ 文件即使存在也不生效（回落环境变量）。 */
  enabled: boolean;
  /** ziti 身份文件路径（enrollment 产物）。 */
  identityPath: string;
  /** 要拨的零信任服务名。 */
  service: string;
}
