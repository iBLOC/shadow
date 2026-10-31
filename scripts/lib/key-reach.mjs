/**
 * 「这把钥匙，用户拿得到吗？」—— **可达性**判据。
 *
 * ## 它补的是哪个洞
 *
 * 闸（`check-agent-surface-credentials.mjs`）第一版只问「**这一发带没带凭据**」。
 * ⚠️⚠️ 那不够：**「代码里写了 shadow」≠「这一发真的带了 shadow」**。
 *
 * 桌面端的事实（2026-11-01 逐行核过 HEAD 源码）：
 *   · `telencephalonClient.ts`（HEAD）**根本没有 `setApiKey` 方法**；
 *   · singleton 是 `new TelencephalonClient()` ⇒ **实参为空** ⇒ `this.apiKey` 恒 `undefined`；
 *   ⇒ ⇒ 桌面端**从来没有**发出过 `X-Shadow-Key`。
 * ⇒ ⇒ 而闸把那一处判成「⚠️ 只带 shadow（用户没配就 401）」⇒ ⇒ **那是说小了**：
 * ⇒ ⇒ 用户**配不出来**（没有输入入口）⇒ ⇒ 端脑一配 `shadow.api_key` ⇒ **必 401**
 * ⇒ ⇒ 该判**红**。⇒ ⇒ 「上锁的代价」被报小了 ⇒ ⇒ 拍板材料是错的。
 *
 * ⇒ ⇒ 所以闸要多问一句：「**这把钥匙，用户拿得到吗？**」
 * ⇒ ⇒ 三档：`always`（恒有）/ `optional`（能配、但可能没配）/ `never`（配不出来）。
 *
 * ## 三种形态（端脑是同一台，但**客户端拿钥匙的条件不同**）
 *
 * | 形态 | 客户端 | shadow key | admin token |
 * |---|---|---|---|
 * | 桌面·Tauri | Tauri + 本机 sidecar | never | always（sidecar 生成并持久化） |
 * | 桌面·web | 浏览器（**没有 sidecar**） | never | optional（用户自己放 localStorage） |
 * | 移动·内嵌 | App + 内嵌端脑 | always（宿主 `ShadowKey.getOrCreate`） | always |
 *
 * ⚠️ **移动端 ⇄ 外部端脑不算形态** —— 那是**跨机**（判定表 D 类）⇒
 * 不在「本机面上锁」的提问范围里 ⇒ ⇒ 且移动端对外部端脑**明确不带**内嵌那把钥匙
 * （`telencephalon_provider.dart`：`_client.setApiKey(null)`）⇒ 那是**另一种机制**
 * （每台远端一份凭据）⇒ ⇒ **别混进来**（混进来会把代价算成一个不存在的洞）。
 *
 * ## ⚠️ 为什么移动·内嵌的 shadow 是 `always`（哪怕 `.so` 是旧的）
 *
 * 旧 `.so` 时宿主拿不到钥匙 ⇒ 客户端**不带**头 ⇒ **但那台端脑自己也没配 key**
 * ⇒ ⇒ 它的读门是**敞开**的（`verify_shadow_token`：expected 为空 ⇒ 放行）
 * ⇒ ⇒ 请求照样通。⇒ ⇒ 两种情形都通 ⇒ ⇒ `always`。
 *
 * （反过来会出事：**有钥匙但对端不认** —— 那就是「拿错钥匙」，不是这一档。）
 */

export const ALWAYS = 'always';
export const OPTIONAL = 'optional';
export const NEVER = 'never';

/**
 * 桌面端：shadow key 用户拿得到吗？
 *
 * @param {string} clientText `shadow-desktop/src/lib/telencephalonClient.ts` 全文
 * @param {string[]} uiTexts 桌面端**其它**源文件全文（**不含** client 自身与 store ——
 *   store 里的 `telencephalonClient.setApiKey(...)` 是**接线**，不是**用户入口**）
 */
export function desktopShadowReach(clientText, uiTexts) {
  // ① client 上有没有 setter（能把这把钥匙塞进去）？
  const hasSetter = /\bsetApiKey\s*\(/.test(clientText);
  // ② 有没有**用户输入入口**（某个组件调用它）？
  const uiEntry = uiTexts.some((t) => /\.setApiKey\s*\(/.test(t));
  // ③ singleton 构造时有没有直接把 key 塞进去（那样恒有）？
  const singleton = /new\s+TelencephalonClient\s*\(([\s\S]*?)\)\s*;/.exec(clientText);
  const singletonHasKey = singleton ? /\bapiKey\b/.test(singleton[1]) : false;

  let reach;
  let how;
  if (singletonHasKey) {
    reach = ALWAYS;
    how = 'singleton 构造时就带上了 key ⇒ 恒有';
  } else if (hasSetter && uiEntry) {
    reach = OPTIONAL;
    how = '有 setter、也有用户输入入口 ⇒ 用户能配（没配就没有）';
  } else if (hasSetter && !uiEntry) {
    reach = NEVER;
    how = '**有 setter，但没有用户输入入口** ⇒ 用户配不出来 ⇒ 端脑一配 key 就断';
  } else {
    reach = NEVER;
    how = 'client 上**连 setter 都没有** ⇒ 这把钥匙发不出去';
  }
  return { reach, hasSetter, uiEntry, singletonHasKey, how };
}

/**
 * 桌面端：admin token 拿得到吗？
 *
 * @param {string} adminTokenText `shadow-desktop/src/lib/adminToken.ts` 全文
 * @param {'tauri'|'web'} form
 */
export function desktopAdminReach(adminTokenText, form) {
  // sidecar 生成并持久化 ⇒ Tauri 形态恒有
  const sidecar = /get_admin_token/.test(adminTokenText);
  // web 版从 localStorage 取 ⇒ 用户自备 ⇒ 没放就没有
  const storage = /localStorage/.test(adminTokenText);
  if (form === 'tauri') {
    return sidecar
      ? { reach: ALWAYS, how: 'sidecar 生成并持久化（`admin_token.rs`）⇒ 前端 `get_admin_token` 拿得到' }
      : { reach: OPTIONAL, how: 'sidecar 没有 `get_admin_token` 命令 ⇒ 老 sidecar 上拿不到' };
  }
  return storage
    ? { reach: OPTIONAL, how: 'web 版**没有 sidecar** ⇒ 用户自己放 `localStorage` ⇒ 没放就没有' }
    : { reach: NEVER, how: 'web 版：没有任何来源' };
}

/**
 * 移动端（内嵌端脑）：两把钥匙拿得到吗？
 *
 * @param {string} providerText `shadow-mobile/lib/providers/telencephalon_provider.dart` 全文
 * @param {string} kotlinText `MainActivity.kt` 全文（宿主自动生成钥匙）
 */
export function mobileEmbeddedReach(providerText, kotlinText) {
  // provider 的**内嵌**分支：把宿主给的那两把钥匙递进 client
  const embeddedWired =
    /_agentSurfaceOwned\s*=\s*true/.test(providerText) &&
    /_client\.setApiKey\s*\(shadowKey\)/.test(providerText) &&
    /_client\.setAdminToken\s*\(adminToken\)/.test(providerText);
  // 宿主**自动生成**（getOrCreate）⇒ 恒有（不存在「没配」这个状态）
  const hostAuto = /ShadowKey\.getOrCreate/.test(kotlinText) && /AdminKey\.getOrCreate/.test(kotlinText);

  const shadow = embeddedWired
    ? { reach: ALWAYS, how: '宿主自动生成（`ShadowKey.getOrCreate`）⇒ 恒有；旧 `.so` 时端脑自己也没配 key ⇒ 门是敞的 ⇒ 也通' }
    : { reach: OPTIONAL, how: '内嵌分支的接线**读不到** ⇒ 不能保证恒有' };
  const admin = embeddedWired && hostAuto
    ? { reach: ALWAYS, how: '宿主自动生成（`AdminKey.getOrCreate`）⇒ 恒有' }
    : { reach: OPTIONAL, how: 'admin token 的来源**读不到** ⇒ 不能保证恒有' };
  return { shadow, admin, embeddedWired, hostAuto };
}
