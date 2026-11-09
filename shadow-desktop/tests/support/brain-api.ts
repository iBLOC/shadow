/**
 * wdio / tauri-e2e 两族共用的「端脑读面」探针。
 *
 * ## 为什么不再用「浏览器抓 body 文本」
 *
 * ⚠️ 原来的写法是 `browser.url(端脑路径)` ＋ `body.getText()` ＋ `expect(text).toBeTruthy()`
 *   ⇒ ⇒ 那条断言在**任何**渲染出来的页面上都成立 —— 包括 404 页、401 页
 *   ⇒ ⇒ **端脑整个坏了它照样绿**。
 *   ⇒ ⇒ 而且 2026-11-09 真机实测发现：桌面端自己的 60080 口上，这些路径全部 **401**
 *   ⇒ ⇒ 「抓文本」量到的是**错误页**，不是端脑的读面。
 *
 * ⇒ ⇒ 现在直接打**端脑**并断言**状态码** ＋ 回包里的**具体字段**。
 *
 * ## 凭据：读门 ＝ 影子锁 ∪ admin token（各有就带，空的绝不带）
 *
 * 门形真源＝端脑 `src/api/door_policy.txt`；产品实现＝桌面端
 * `src/lib/readDoorHeaders.ts` ⇒ ⇒ 这一族与它们**同一套规则**。
 */

/** 端脑的根地址 —— 可用 `SHADOW_TELENCEPHALON_URL` 覆盖。 */
export const BRAIN_URL = (
  process.env.SHADOW_TELENCEPHALON_URL ?? 'http://localhost:60080'
).replace(/\/$/, '');

/**
 * 读门的**全部**钥匙（影子锁 ∪ admin token）—— **各一把，有就带**。
 *
 * ⚠️ **拿不到就不带那个头** —— 空串会被门当成一把钥匙（`ct_eq` 相等）。
 */
export function doorHeaders(): Record<string, string> {
  const headers: Record<string, string> = {};
  const shadow = process.env.SHADOW_TEST_SHADOW_KEY?.trim();
  const admin = process.env.SHADOW_TEST_ADMIN_TOKEN?.trim();
  if (shadow) headers['X-Shadow-Key'] = shadow;
  if (admin) headers['X-Admin-Token'] = admin;
  return headers;
}

export type BrainResponse = { status: number; body: string };

/** 打端脑一个 GET，拿到**状态码**与**回包文本**。 */
export async function brainGet(path: string): Promise<BrainResponse> {
  const res = await fetch(`${BRAIN_URL}${path}`, { headers: doorHeaders() });
  return { status: res.status, body: await res.text() };
}