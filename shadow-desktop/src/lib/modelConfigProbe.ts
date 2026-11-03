/**
 * 「有没有配好模型」这个判定的**唯一实现**。
 *
 * ## 为什么是三态，不是两态
 *
 * 因为「**问不到**」既不是「有」也不是「没有」：
 *
 * * `/models/providers` 在端脑那边被放到了 **读门**（shadow ∪ admin）后面
 *   ⇒ 没配钥匙 ⇒ **401** ⇒ 而 **web 部署没有 sidecar ⇒ 没有 admin token
 *   ⇒「问不到」是常态**；
 * * 端脑没起 / 网关 5xx / 探测本身抛了 ⇒ 也是「问不到」。
 *
 * ⇒ ⇒ 以前「问不到」被折成「**没有**」⇒ ⇒ `hasCloud=false` ⇒ ⇒
 * ⇒ ⇒ **用户明明配好了，却被说成「没配模型」** ⇒ ⇒ **失败长得像成功**
 * ⇒ ⇒ 而且是在「门一上之后」才发作（门一上 ⇒ 探测全 401 ⇒ 全员被踢回向导）。
 *
 * ⇒ ⇒ 现在：**只有「确认没配」才说「没配」**；问不到 ⇒ `unknown` ⇒
 * ⇒ ⇒ **不踢**（宁可让用户自己逛，也别断言他没配好）。
 *
 * ## 为什么单独一个模块（而不是各写各的）
 *
 * ⚠️ 同一套判定**曾经被抄了两遍**：
 *
 * * `components/AppInitializer.tsx` 的 `hasConfiguredModelsWeb()` / `...Tauri()`
 * * `pages/ModelOnboardingPage.tsx` 的 `check()`
 *
 * ⇒ ⇒ 两边各写各的 ⇒ ⇒ **改了一边忘了另一边** ⇒ ⇒ 于是
 * ⇒ ⇒ 「AppInitializer 已经修好了（不踢）」而「onboarding 页还在说没配」
 * ⇒ ⇒ **同一个病，两个症状，一处好了一处没好** ⇒ ⇒ 而用户看到的
 * ⇒ ⇒ 恰恰是**没好的那一处**（onboarding 页就是「说没配」的那张脸）。
 *
 * ⇒ ⇒ 现在**一份实现、多处调用** ⇒ ⇒ 改一处两边一起好。
 *
 * ## 地址和凭据都由本模块自己拥有（而不是形参）
 *
 * ⚠️ **两条好处，都是硬要求**：
 *
 * ① **打不错地址**：两发探测（云供应商 ＋ 本地模型）必须打**同一台**端脑
 *    ⇒ ⇒ 而「base 在哪儿算」这件事**只在一个模块里写**，就不可能被另一个
 *    调用点带歪；
 * ② **凭据只注入一次**：`adminHeaders()` 与那把 shadow key 都只在这一处出现
 *    ⇒ ⇒ 「这一发到底带没带钥匙」**不需要靠人读代码**来判断 ⇒ ⇒
 *    ⇒ ⇒ 机器闸（`scripts/check-provider-admin-headers.mjs`）也能直接判
 *    ⇒ ⇒ （闸认得 `getApiKey` / `shadowKey` 这两个名字 ⇒ ⇒ 判得到）。
 */

import { adminHeaders } from './adminToken';
import { telencephalonClient } from './telencephalonClient';

/**
 * ⚠️ **一张面，一个 base**（2026-11-02 起）。
 *
 * ⇒ ⇒ 两发探测（云供应商 `/models/providers` ＋ 本地模型 `/v1/models`）
 * ⇒ ⇒ 打的是**同一个地址** —— `telencephalonClient.getBaseUrl()`。
 *
 * ⚠️⚠️ **为什么本地模型也走大脑那张面**（以前打的是 neuron's 自己的端口）：
 *
 * * neuron's route table 被端脑挂在**根**上（`telencephalon/src/api/mod.rs`
 *   的 `build_full_app` ⇒ `outer.merge(neuron_router)`）⇒ ⇒ 端脑面上
 *   **本来就有** `/v1/models` ⇒ ⇒ 客户端不需要第二个地址。
 * * 用户拍板：「**坚持嵌入式，所有的入口都在大脑，由大脑负责路由和分发**」
 *   ⇒ ⇒ 直连 neuron 是**绕过大脑的入口** ⇒ ⇒ 大脑那一侧看不见「谁在管
 *   本地模型」⇒ ⇒ `platform.neuronUrl()` 已删（2026-11-02）。
 *
 * ⚠️⚠️ **base 取自 client（不是 platform 的写死值）** ——
 * 「列表」那一发走的是 `telencephalonClient.request()` ⇒ ⇒ 它打的是
 * **client 的地址**（用户可在设置里改 ⇒ 持久化在 store 里 ⇒ 重启后复原）。
 * ⇒ ⇒ 而这一发以前打的是 `prefrontalUrl()`（**写死** `localhost:60080`）
 * ⇒ ⇒ ⇒ **用户改过地址之后，两发打的根本不是同一台端脑**
 * ⇒ ⇒ ⇒ 于是「列表读到了、探针说问不到」—— **同一个病，换了个面**。
 * ⇒ ⇒ ⇒ 现在两发**同一个地址、同一套凭据** ⇒ ⇒ 结构上不可能再分叉。
 *
 * ⚠️ **base 是「函数里」求值的，不是模块加载时求值的** —— 这不是随手写的：
 * ⇒ ⇒ 模块加载时就求值 ⇒ ⇒ **导入这个模块**就等于**立刻要求** platform
 * ⇒ ⇒ 的那些导出都在 ⇒ ⇒ 而既有测试里有对 platform 的**部分 mock**
 * ⇒ ⇒ （只给 isTauri / prefrontalUrl）⇒ ⇒ ⇒ 那些测试**直接加载失败**
 * ⇒ ⇒ ⇒ 惰性求值 ⇒ ⇒ 导入本模块不再碰 platform ⇒ ⇒ 老测试照旧。
 */

/**
 * 「有没有配好模型」的三态。
 *
 * * `configured` —— **确认**配好了（有云供应商，或本地有可用模型）。
 * * `not-configured` —— **确认**没配（问到了云那半，答案是空）。
 * * `unknown` —— **问不到**（门关着 / 端脑没起 / 网络不通 / 探测炸了）。
 */
export type ModelConfigState = 'configured' | 'not-configured' | 'unknown';

/**
 * 一次「读供应商列表」（**端脑面** `/models/providers`）的原始结果。
 *
 * ⚠️ `known` 与 `count` **必须分开**：
 * * `known: false` ⇒ **问不到**（这一发失败了：401 / 网络错 / 5xx / 形状不对）；
 * * `known: true, count: 0` ⇒ **问到了，而且确实是空的**。
 *
 * ⇒ ⇒ 以前这两者被折成同一个 `[]` ⇒ ⇒ 「读不到」长得像「没有」。
 */
export interface ProviderProbeResult {
  /** 问到了吗？false ⇒ 这一发失败了。 */
  known: boolean;
  /** 问到了的话，拿到了几个供应商。 */
  count: number;
}

/**
 * 一次「读本地模型列表」（**大脑面** `/v1/models`）的原始结果。
 *
 * ⚠️ `available` 才是「本地有没有**可用**模型」；`known` 只表示这一发
 * **有没有成功**。⚠️ **本地那半读不到时，`available` 恒 false** ——
 * 那表示「现在没有可用的本地模型」，**不是**「用户什么都没配」
 * ⇒ ⇒ 所以它**不参与**「有没有配好」的结论（见 `combineModelConfig`）。
 */
export interface LocalModelProbeResult {
  known: boolean;
  available: boolean;
}

/**
 * 把两发探测的结果合成一个结论 —— **这就是那个判定**。
 *
 * ⚠️ **合成规则**（与 `AppInitializer` 修复前的形状**逐条等价**，只是搬了家）：
 *
 * * 任一半**有** ⇒ `configured`（本地有模型也算 —— 用户不必配云供应商）；
 * * 否则 **云那半问到了**（`cloud.known`）⇒ `not-configured`
 *   （**确认**没有云供应商 ⇒ 该引导）；
 * * 否则 ⇒ `unknown`（**问不到** ⇒ **不许**说「没配」⇒ ⇒ 不引导）。
 *
 * ⚠️ **为什么本地那半不参与「有没有配好」的结论**：
 * 本地那半读不到时，「本地有没有模型」是**问不到**，不是「没有」⇒ ⇒
 * 若让它参与，就会把「问不到」折成「没有」⇒ ⇒ 那正是本模块要消灭的病。
 * ⇒ ⇒ 本地那半**只在「有」的时候加分**（把结论抬成 `configured`）。
 *
 * ⚠️ 换句话说：**只有云那半能说「你什么都没配」** —— 这与
 * `AppInitializer` 今天的行为**一模一样**（它也是 `cloudKnown` 说了算），
 * ⇒ ⇒ 本模块是**搬运**，不是**改判**。
 */
export function combineModelConfig(
  cloud: ProviderProbeResult,
  local: LocalModelProbeResult,
): ModelConfigState {
  if (cloud.count > 0 || local.available) return 'configured';
  if (cloud.known) return 'not-configured';
  return 'unknown';
}

/**
 * 读供应商列表（**端脑面** `/models/providers`）。
 *
 * ⚠️ 这一发**必须带凭据** ⇒ 它在读门（shadow ∪ admin）后面 ⇒
 * ⇒ 没带 ⇒ 401。⇒ ⇒ 拿不到钥匙时**就不带那个头**（端脑回 401，说人话）⇒ ⇒
 * ⇒ 绝不塞一个空值头（空串与空串 `ct_eq` 相等 ⇒ 等于带对了）。
 *
 * ⚠️ **两把都递（读门 = shadow ∪ admin）** —— 不是二选一：
 * 端脑认哪几把，客户端就递哪几把 ⇒ ⇒ 少递一把 ⇒ 就会在「只有那把对得上」
 * 的形态下被挡 ⇒ ⇒ 症状是「**读不到**」被显示成「**没有**」。
 *
 * ⚠️ shadow key 的**唯一出处**是 client（`telencephalonClient.getApiKey()`）
 * ⇒ ⇒ 与发请求的那个 client 是**同一把** ⇒ ⇒ 不会「列表用一把、探针用另一把」。
 *
 * ⚠️ **没有形参**（base 与凭据都在本模块里）⇒ ⇒ 机器闸能在**同一个文件**里
 * ⇒ ⇒ 追到「base 是端脑面」+「headers 来自 adminHeaders() / getApiKey()」
 * ⇒ ⇒ 判得准（闸认得 `getApiKey` 这个名字 ⇒ ⇒ 也认得 client 的地址）。
 */
export async function probeCloudProviders(): Promise<ProviderProbeResult> {
  try {
    // ⚠️ base **在函数里**求值（理由见上面那段注释）⇒ ⇒ 机器闸仍然能在
    // ⇒ ⇒ **同一个文件**里追到「base = client 的地址」。
    //
    // ⚠️⚠️ **取的是 client 的地址，不是 platform 的写死值** ——
    // ⇒ ⇒ 「列表」那一发走 `telencephalonClient.request()` ⇒ ⇒ 打的是
    // ⇒ ⇒ **client 的地址**（用户改过就改过）⇒ ⇒ 而这一发以前打
    // ⇒ ⇒ `prefrontalUrl()`（写死 localhost:60080）⇒ ⇒ ⇒ **两发不是同一台**
    // ⇒ ⇒ ⇒ 「列表读到了、探针说问不到」⇒ ⇒ ⇒ 同一个病，换了个面。
    const TELEENCEPHALON_BASE = telencephalonClient.getBaseUrl();
    // ⚠️ **读门 = shadow ∪ admin ⇒ 两把都递**（**不是**二选一）。
    //
    // ⚠️⚠️ 以前这里**刻意只递 admin**（注释写着「admin 是另一把钥匙 ⇒
    // 这一发带 admin 就够 ⇒ 不多递一把」）⇒ ⇒ **那个前提只在「客户端手里
    // 握有 admin token」时成立** ⇒ ⇒ 而在「独立端脑服务器 + 那台机器配了
    // shadow key + 桌面端填了 shadow key」这个形态上，桌面 sidecar 那把
    // admin token **对不上**（端脑的 admin 面 fail-closed ⇒ 只认
    // `TELENCEPHALON_ADMIN_KEY`）⇒ ⇒ 读面只剩 **shadow** 那把
    // ⇒ ⇒ **列表读得到、探针读不到** ⇒ ⇒ ⇒ 同一个客户端、同一张面，
    // 两处给出互相矛盾的说法。
    //
    // ⇒ ⇒ 规则：**客户端读面的凭据集合必须与门形一致** ⇒ 门认哪几把，
    // 客户端就递哪几把 ⇒ ⇒ 少递一把 ⇒ 就会在「只有那把对得上」的形态下
    // 被挡 ⇒ ⇒ 而症状是「读不到」伪装成「没有」。
    const shadowKey = telencephalonClient.getApiKey();
    const resp = await fetch(`${TELEENCEPHALON_BASE}/models/providers`, {
      headers: {
        ...(await adminHeaders()),
        // ⚠️ **拿不到就不带这个头** —— 绝不能塞空串
        // （空串与空串相等 ⇒ 等于带对了 ⇒ 反而把门骗开）。
        ...(shadowKey ? { 'X-Shadow-Key': shadowKey } : {}),
      },
    });
    // ⚠️ **不 ok ⇒ 问不到**（401 = 门关着 / 钥匙不对；5xx = 端脑坏了）
    // ⇒ ⇒ **不许**当成「空列表」。
    if (!resp.ok) return { known: false, count: 0 };
    const data = await resp.json();
    // ⚠️ **形状不对 ⇒ 也不是「确认空」** ⇒ ⇒ 端脑回的是 Json<Vec<ProviderView>>
    // ⇒ ⇒ （**一个数组**）⇒ ⇒ 拿到别的形状（代理的 HTML 错误页 / 版本不匹配）
    // ⇒ ⇒ 说明这一发**没问对**⇒ ⇒ 归「问不到」⇒ ⇒ **不许**说「你没配」。
    // ⚠️ 这一条比旧的内联写法**更严** ⇒ ⇒ 旧写法把非数组当成「空」
    // ⇒ ⇒ （=「确认没配」）⇒ ⇒ 那会让一个版本不匹配的部署**把用户踢回向导**。
    if (!Array.isArray(data)) return { known: false, count: 0 };
    return { known: true, count: data.length };
  } catch {
    // ⚠️ 网络错 / 端脑没起 / 拿钥匙炸了 ⇒ 也是「问不到」。
    return { known: false, count: 0 };
  }
}

/**
 * 读本地模型列表（**大脑那张面** `/v1/models`）。
 *
 * ⚠️ **本地模型的路由由大脑转发**（neuron's route table 挂在端脑面的根上）
 * ⇒ ⇒ 客户端**不需要**知道 neuron's 端口 ⇒ ⇒ 这一发与云那半**同一个地址**。
 *
 * ⚠️ **这一发失败（404 / 网络错）⇒ `available: false`** ⇒ ⇒
 * 「现在没有可用的本地模型」⇒ ⇒ **不是**「用户什么都没配」
 * ⇒ ⇒ 所以它**不参与**「有没有配好」的结论。
 */
export async function probeLocalModels(): Promise<LocalModelProbeResult> {
  try {
    // ⚠️ **同一个 base**（与云那半同一个函数求值）⇒ ⇒ 两发**同一台**端脑。
    const BRAIN_BASE = telencephalonClient.getBaseUrl();
    const resp = await fetch(`${BRAIN_BASE}/v1/models?engine=llm`, {
        // ⚠️ **门罩住整张面**（2026-11-03）⇒ ⇒ `/v1/*` 也在门型表管辖内
        // ⇒ ⇒ 不递钥匙就是 401 ⇒ ⇒ 「有没有配好模型」的探测会**假失败**。
        headers: await telencephalonClient.readHeaders(),
      });
    if (!resp.ok) return { known: false, available: false };
    const data = await resp.json();
    const list = (data?.data ?? []) as Array<{ available?: boolean }>;
    return { known: true, available: list.some((m) => m.available) };
  } catch {
    return { known: false, available: false };
  }
}

/**
 * 供应商列表的**显示态** —— 「读到了（可能为空）」与「读不到」分开。
 *
 * ⚠️ 以前 `catch { setProviders([]) }` ⇒ ⇒ 「读不到」被显示成「一个都没有」
 * ⇒ ⇒ 用户看见「暂无模型供应商」⇒ ⇒ 于是去**重新配一遍已经配好的东西**
 * ⇒ ⇒ 而真正的原因（门关着 / 端脑没起）**一个字都没人告诉他**
 * ⇒ ⇒ **失败长得像成功**。
 */
export type ProviderListState = 'ready' | 'empty' | 'unreadable';

/**
 * 供应商列表的显示态 —— **三态**。
 *
 * ⚠️ 为什么「empty」要单列一档：**「问到了，而且确实是空的」**与
 * **「问不到」**是**两件不同的事** ⇒ ⇒ 前者该说「还没配，去配一个」，
 * ⇒ ⇒ 后者该说「读不到」⇒ ⇒ 两者**不许**共用一句文案。
 *
 * @param providers 读到的供应商（可能是空数组 ⇒ 那是真的没有）
 * @param failed    这一发**失败**了吗（401 / 网络错 / 5xx）
 */
export function providerListState(
  providers: readonly unknown[] | null | undefined,
  failed: boolean,
): ProviderListState {
  // ⚠️ providers == null ⇒ 连「读到空列表」都不是 ⇒ 也是「问不到」。
  if (failed || providers == null) return 'unreadable';
  return providers.length === 0 ? 'empty' : 'ready';
}
