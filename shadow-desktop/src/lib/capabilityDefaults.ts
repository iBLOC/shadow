/**
 * 「按能力分档的默认模型」—— **纯逻辑**（无 React、无网络）。
 *
 * ## 为什么单独成文件
 *
 * ⚠️ 移动端有一份**同名**的 Dart 实现（`brain_model_source_provider.dart`
 * 里的 `capabilityCandidatesByCapability` / `mergeCapabilityDefaultsForPush`
 * ⇒ ⇒ 两边的算法必须**一模一样** ⇒ ⇒ 否则「界面显示的当前值」跟「实际
 * 生效的」会分叉 ⇒ ⇒ 失败长得像成功。
 * ⇒ ⇒ 改一边的时候，另一边要跟着改（这里每条规则都写成了可单测的形状）。
 *
 * ## 数据从哪来
 *
 * - **能力词表 ＋ 当前默认值** ⇒ ⇒ 端脑（`GET
 *   /api/telencephalon/lobes/capability-defaults`）⇒ ⇒ 端脑是单一真源，
 *   客户端不自己造词。
 * - **候选模型** ⇒ ⇒ 大脑供应商目录里每条模型的 `capability` 标注 ⇒ ⇒
 *   与「这条模型是什么类型」是同一份数据 ⇒ ⇒ 界面不会自相矛盾。
 */

/** 某一档能力下的一条候选模型。 */
export interface CapabilityModelCandidate {
  /**
   * **上游模型 id** —— 端脑按 id 选引擎（`asr_registry.runtime_for(id)`）
   * ⇒ ⇒ 这里必须存**端脑认的那个 id**，不是显示名。
   */
  id: string;

  /** 显示名（供应商名 · 模型名）—— 只给人看。 */
  label: string;
}

/**
 * 大脑供应商目录里的一条模型（**只取我们要的那几个字段**）。
 *
 * ⚠️ 两种形状都读：synapse 目录那份是**单个** `capability`（字符串），
 * 大脑自己那份是 `capabilities` **数组** ⇒ ⇒ 只认一种 ⇒ ⇒ 另一半会
 * **静默丢成 null** ⇒ ⇒ 界面上分不出「这条是聊天模型还是语音模型」。
 */
export interface CatalogModelEntry {
  id?: string;
  model_id?: string;
  name?: string;
  display_name?: string;
  capability?: string;
  capabilities?: string[];
}

/** 大脑供应商目录里的一家。 */
export interface CatalogProviderEntry {
  name?: string;
  models?: CatalogModelEntry[];
}

/** 取一条模型的**第一个**能力词（两种形状都读；没有 ⇒ null）。 */
export function firstCapabilityOf(model: CatalogModelEntry): string | null {
  const single = model.capability;
  if (typeof single === 'string' && single.trim()) {
    return single.trim().toLowerCase();
  }
  const caps = model.capabilities;
  if (Array.isArray(caps)) {
    for (const c of caps) {
      if (typeof c === 'string' && c.trim()) return c.trim().toLowerCase();
    }
  }
  return null;
}

/** 模型 id（两种字段名都读）。 */
export function modelIdOf(model: CatalogModelEntry): string {
  return (model.id ?? model.model_id ?? '').trim();
}

/**
 * 把供应商目录里的模型**按能力分组**。
 *
 * ⚠️ **没有能力标注的模型不进任何一档**（不猜）—— 一个看不懂的词下面挂
 * 一堆模型，比没有这一行更糟。
 * ⚠️ **空 id 不进候选** —— 端脑按 id 选引擎 ⇒ ⇒ 空 id 必失败 ⇒ ⇒ 界面
 * 不能给用户一个「选了必失败」的选项。
 * ⚠️ **同一个 id 在两个供应商下 ⇒ 只留一条**。
 */
export function capabilityCandidatesByCapability(
  providers: CatalogProviderEntry[],
): Record<string, CapabilityModelCandidate[]> {
  const out: Record<string, CapabilityModelCandidate[]> = {};
  for (const p of providers ?? []) {
    for (const m of p.models ?? []) {
      const cap = firstCapabilityOf(m);
      if (!cap) continue;
      const id = modelIdOf(m);
      if (!id) continue;
      const list = out[cap] ?? (out[cap] = []);
      if (list.some((c) => c.id === id)) continue;
      const modelName = (m.name ?? m.display_name ?? '').trim() || id;
      const providerName = (p.name ?? '').trim();
      list.push({
        id,
        label: providerName ? `${providerName} · ${modelName}` : modelName,
      });
    }
  }
  return out;
}

/**
 * 构造「要下发给端脑的那一份」分档默认。
 *
 * ⚠️ 端脑那一面是**整份替换** ⇒ ⇒ 基线必须是「本地副本 ∪ 端脑当前值」
 * ⇒ ⇒ 只拿一份去发 ⇒ ⇒ 会把**另一边**已有的档位抹掉。
 *
 * ⚠️ 改的那一档：空值 ⇒ ⇒ **删掉这一档**（不是「配成空串」—— 空串在端脑
 * 那边会被 400 拒掉）。
 */
export function mergeCapabilityDefaultsForPush(
  local: Record<string, string>,
  remote: Record<string, string>,
  capability: string,
  model: string | null | undefined,
): Record<string, string> {
  const next: Record<string, string> = { ...(local ?? {}), ...(remote ?? {}) };
  const id = (model ?? '').trim();
  if (!id) {
    delete next[capability];
  } else {
    next[capability] = id;
  }
  return next;
}

/** 桌面端的 durable 副本键（与移动端那份**不是**同一个存储，仅供重下发用）。 */
export const CAPABILITY_DEFAULTS_STORAGE_KEY = 'brain_capability_defaults';

/** 读 durable 副本（坏数据 ⇒ 空表，不许把设置页卡死）。 */
export function readCapabilityDefaultsSnapshot(): Record<string, string> {
  try {
    const raw = globalThis.localStorage?.getItem(CAPABILITY_DEFAULTS_STORAGE_KEY);
    if (!raw) return {};
    const parsed = JSON.parse(raw);
    if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) return {};
    const out: Record<string, string> = {};
    for (const [k, v] of Object.entries(parsed as Record<string, unknown>)) {
      if (typeof v === 'string' && v.trim()) out[k] = v.trim();
    }
    return out;
  } catch {
    return {};
  }
}

/** 写 durable 副本（坏数据不许进来）。 */
export function writeCapabilityDefaultsSnapshot(
  defaults: Record<string, string>,
): void {
  try {
    const clean: Record<string, string> = {};
    for (const [k, v] of Object.entries(defaults ?? {})) {
      if (typeof v === 'string' && v.trim()) clean[k] = v.trim();
    }
    globalThis.localStorage?.setItem(
      CAPABILITY_DEFAULTS_STORAGE_KEY,
      JSON.stringify(clean),
    );
  } catch {
    // 存不进去（隐私模式 / 配额满）⇒ ⇒ 不许因此假装「已保存」。
  }
}
