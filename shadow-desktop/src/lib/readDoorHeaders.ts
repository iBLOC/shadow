/**
 * 读门的**全部**钥匙 —— 影子锁 ∪ admin token。
 *
 * ## 为什么要有这个文件
 *
 * ⚠️ **一条规则、一处实现**：客户端递的凭据集合必须与**门形**一致 ——
 * 门认哪几把，客户端就递哪几把（判据源：
 * `telencephalon/src/api/door_policy.txt` ⇒ 读门 = **影子锁 ∪ admin token**
 * ⇒ 判据实现 `security/api_key.rs::verify_read_credential`）。
 *
 * ⇒ 以前**读面**只递 `X-Admin-Token`（`adminHeaders()`）⇒ ⇒ 在「客户端手里
 * 只有影子锁」的形态上（独立端脑服务器 + 那台机器配了 shadow key + 桌面
 * sidecar 那把 admin token 对不上）⇒ ⇒ 读面 **401** ⇒ ⇒ 而同一张面的另一发
 * （走 `telencephalonClient.request()`）**读得到** ⇒ ⇒ ⇒ 「列表读得到、
 * 状态页读不到」—— 同一个客户端、同一张面，两处互相矛盾。
 *
 * ## 为什么 admin 也能开这道门
 *
 * admin token 是**更强**的钥匙（它能开整张 admin 面）⇒ ⇒ 拿它开读门
 * **不增加任何暴露面**；而**不给**它开 ⇒ ⇒ 宿主自己的客户端可能被挡在门外
 * （**门掐断主人**）。
 *
 * ## 两条不许省的纪律
 *
 * ⚠️ **拿不到就不带那个头** —— 绝不塞空串：空串与空串 `ct_eq` 相等 ⇒
 * 等于把门骗开（`security/api_key.rs::verify_admin_token` ⇒ 空 expected ⇒
 * 401 ⇒ 但**空值头**在旧实现里与空串相等 ⇒ 过）。
 *
 * ⚠️ **自己 trim 一次**（不信任上游模块的输出）：JS 里 `'   '` 是 **truthy**
 * ⇒ ⇒ 空白值会被当成一把钥匙发出去 ⇒ ⇒ 判据是「trim 之后还剩东西吗」。
 *
 * ⚠️ **两把钥匙绝不打日志** —— 只进 HTTP 头。
 */
import { getAdminToken } from './adminToken';

/**
 * 读面的全部钥匙 —— 影子锁 ∪ admin token（**各一把，有就带**）。
 *
 * @param shadowKey 端脑面的影子锁（`X-Shadow-Key`）—— 空 / undefined ⇒ 不带。
 */
export async function readDoorHeaders(
  shadowKey?: string,
): Promise<Record<string, string>> {
  const headers: Record<string, string> = {};
  const shadow = shadowKey?.trim();
  if (shadow) headers['X-Shadow-Key'] = shadow;
  const admin = (await getAdminToken())?.trim();
  if (admin) headers['X-Admin-Token'] = admin;
  return headers;
}
