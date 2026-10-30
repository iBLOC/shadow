/**
 * 海马体租户的常量。
 *
 * 单独一个文件，是因为**两层都要用**它，而它俩不在同一层：
 * `lib/`（客户端、迁移）和 `stores/`（身份 store）。放在 `stores/` 里会让
 * `lib/` 反向依赖 store。
 */

/**
 * 兜底租户 —— 「背后没有人」时读写的就是这一桶。
 *
 * 它也是海马体自己的默认值：`list_memories` / `add_memory` 在请求不带
 * 租户时都回退到 `"default"`（`hippocampus-server/src/handlers.rs`）。
 *
 * 端脑在没有账号、也没有凭证时也用这一桶（`hippo_store::hippo_auth()`
 * 的回退分支）⇒ **老部署（没账号）的行为逐字节不变**。
 */
export const FALLBACK_TENANT_ID = 'default';
