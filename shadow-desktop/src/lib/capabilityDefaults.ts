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

  /**
   * 这条候选来自**云供应商**（OpenAI 兼容的 HTTP 面）还是**内置 neuron
   * 目录**（本地权重，`provider_type === 'neuron'`）。
   *
   * ⚠️ 为什么分：asr/tts 档并目录面 id 时，**只有云供应商的 id 端脑真的
   * 解析得到**（先查云供应商模型表 ⇒ 代理云端）；内置目录的本地 id
   * （`whisper-base` 那套）要**注册**了才能用 ⇒ ⇒ 并进来就是「存得进去、
   * 用不了」（2026-11-09 实测根因——别让它回来）。
   */
  cloud: boolean;
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
  /** `openai` / `openai_compatible` / `neuron`（内置目录）……—— 分「云/本地」用。 */
  provider_type?: string;
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
    // ⚠️ 内置 neuron 目录（`provider_type === 'neuron'`）的 id 是**本地
    // 权重**（要注册了才能用），云供应商的 id 端脑能按 id 代理 ⇒ 分开记。
    const cloud = (p.provider_type ?? '').trim().toLowerCase() !== 'neuron';
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
        cloud,
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

/* ────────────────────────────────────────────────────────────────────────────
 * 「**此刻能不能用**」—— 目录面 ≠ 已注册面（2026-11-09 实测的根因）
 *
 * ⚠️⚠️ **这是两套不同的 id 命名空间**：
 * · 客户端候选来自**目录面**（`GET /models/providers` ⇒ neuron's
 *   `catalog_models_from_state`）⇒ ⇒ asr 的 id 形如 `whisper-base` /
 *   `whisper-tiny` / `sensevoice-small`，tts 形如 `voxcpm2` /
 *   `voxcpm-0.5b`；
 * · 端脑**真的解析引擎**时用的是**已注册面**（`asr_registry.runtime_for(id)`
 *   ⇒ ⇒ 精确匹配 `RegisteredAsr.model_id`）⇒ ⇒ id 来自部署的注册动作
 *   （env 开关 / `config.registrations` / 运行期注册）⇒ ⇒ 形如
 *   `whisper-model` / `sensevoice-small` / `voxcpm-model` / `voxcpm2`。
 *
 * ⇒ ⇒ 两套**只有 `sensevoice-small` 与 `voxcpm2` 恰好同名** ⇒ ⇒ 用户从
 * 目录面挑一个 `whisper-base` ⇒ ⇒ 端脑按那个 id **永远解析不到** ⇒ ⇒
 * **存得进去、用不了**（失败长得像成功）。
 *
 * ⇒ ⇒ 所以：**哪几档按引擎 id 解析**（端脑说了算：`engine_resolved`）、
 * **那些档此刻注册了哪些 id**（端脑说了算：`registered`）—— 客户端照它
 * 渲染，**不许**拿目录面冒充「此刻能用」。
 * ──────────────────────────────────────────────────────────────────────────── */

/** 端脑说的「哪几档按引擎 id 解析」＋「那些档此刻注册了哪些 id」。 */
export interface EngineResolvedInfo {
  /**
   * **按引擎 id 解析**的能力词（如 `asr` / `tts`）—— 端脑说了算。
   *
   * ⚠️ **不在这个表里的档 ⇒ 不按引擎 id 解析**（走供应商路由）⇒ ⇒ 那一档
   * 的候选仍然是目录面那套 id（那是它该用的命名空间）。
   */
  engineResolved: string[];

  /**
   * 那些档**此刻已注册**的引擎 id（能力词 → id 列表）。
   *
   * ⚠️ **空列表 = 这台大脑此刻没有已注册的引擎**（不是「没有这个能力」）。
   */
  registered: Record<string, string[]>;
}

/** 下拉框里的一条可选项。 */
export interface CapabilityCandidateOption {
  /** 端脑认的那个 id。 */
  id: string;

  /** 显示名。 */
  label: string;

  /**
   * **此刻这台大脑能不能真的用它**。
   *
   * ⚠️ 对**按引擎 id 解析**的档 ⇒ ⇒ 恒为 `true`（能列出来的都已注册）
   * ⇒ ⇒ 对**不按引擎 id 解析**的档 ⇒ ⇒ 恒为 `true`（那一档的可用性不由
   * 注册表决定 ⇒ ⇒ 不许在这里说「不可用」—— 那是另一套说法）。
   */
  usableNow: boolean;
}

/**
 * **按引擎 id 解析、但目录面的 id 端脑也解析得到**的那几档。
 *
 * ⚠️ 三档全收（2026-11-14，小米 MiMo 那刀后）—— 端脑的分流现在是「先查
 * **云供应商模型表** ⇒ 命中就代理云端；否则才进本地引擎注册表」：
 * · `image_gen`：`api/images.rs` 一直有云腿 ⇒ 目录面里标了 `image_gen` 的
 *   云模型 id 在那一档**真的能用**；
 * · `asr` / `tts`：`api/voice.rs` 2026-11-14 起补上了同一形状的云腿
 *   （`/audio/transcriptions` / `/audio/speech`，key 不出大脑）⇒ 供应商目录
 *   里标了这两档的云模型 id（小米 MiMo 的 `mimo-2.5-tts` / `mimo-2.5-asr`）
 *   同样**真的能用**。
 *
 * ⚠️ 历史教训仍然成立（2026-11-09 实测的根因）：**voice 只认本地注册表的
 * 年代**，目录面 id 收进来就是「存得进去、用不了」⇒ ⇒ 那一刀把 asr/tts
 * 挡在外面是对的；**云腿落地之后**，挡在外面就成了「用户少看到一半能用的
 * 模型」⇒ ⇒ 两刀是一对，缺谁都不行。
 *
 * ⚠️ 与移动端 `brain_model_source_provider.dart` 的 `catalogResolvedTiers`
 * **必须一模一样**（两端纯模块同源，改一边就改另一边）。
 */
export const CATALOG_RESOLVED_TIERS: ReadonlySet<string> = new Set([
  'image_gen',
  'asr',
  'tts',
]);

/**
 * [CATALOG_RESOLVED_TIERS] 之中，目录面**只并「云供应商」条目**的那几档。
 *
 * ⚠️ `asr` / `tts` 在列：内置 neuron 目录的本地 id（`whisper-base` /
 * `voxcpm2` 那套）端脑按 id **解析不到**（那是另一套命名空间——已注册面
 * 才算数）⇒ ⇒ 并进来就是「存得进去、用不了」（2026-11-09 实测根因）。
 * 云供应商的 id（小米 MiMo 的 `mimo-2.5-tts`）走云端代理 ⇒ 真的能用。
 * ⚠️ `image_gen` **不在**：内置目录的 imagegen 条目（`moss-image`）在
 * imagegen 注册表那套同名 ⇒ 维持原状（整档并）。
 *
 * ⚠️ 与移动端 `brain_model_source_provider.dart` 的 `cloudOnlyUnionTiers`
 * **必须一模一样**（两端纯模块同源，改一边就改另一边）。
 */
export const CLOUD_ONLY_UNION_TIERS: ReadonlySet<string> = new Set([
  'asr',
  'tts',
]);

/**
 * 每档的**可选项** —— 端脑说哪几档按引擎 id 解析，就按哪套命名空间取。
 *
 * ⚠️ **按引擎 id 解析的档 ⇒ 候选取「已注册面」**（不是目录面）—— 目录面
 * 里的 id 端脑解析不到 ⇒ ⇒ 列出来就是「选了必然失败」⇒ ⇒ 那是另一种
 * 撒谎（**失败长得像成功**的界面面）。
 * ⚠️ **不按引擎 id 解析的档 ⇒ 候选取目录面**（原样，不许被这一刀改掉）。
 * ⚠️ 已注册的 id 若同时在目录面里 ⇒ ⇒ **显示名用目录面那份**（同一个 id
 * 两套显示名更让人困惑）。
 * ⚠️ **[CATALOG_RESOLVED_TIERS] 那几档（asr / tts / image_gen）是两套的
 * 并集** —— 它们既有本地引擎注册表、又有云供应商那条腿 ⇒ 只给一半 ⇒
 * 用户少看到一半能用的模型。
 */
export function capabilityOptionsByCapability(
  catalog: Record<string, CapabilityModelCandidate[]>,
  info: EngineResolvedInfo,
): Record<string, CapabilityCandidateOption[]> {
  const engineResolved = new Set(info?.engineResolved ?? []);
  const registered = info?.registered ?? {};
  const out: Record<string, CapabilityCandidateOption[]> = {};

  for (const [cap, list] of Object.entries(catalog ?? {})) {
    if (!engineResolved.has(cap)) {
      out[cap] = (list ?? []).map((c) => ({
        id: c.id,
        label: c.label,
        usableNow: true,
      }));
      continue;
    }
    const ids = registered[cap] ?? [];
    const labels = new Map((list ?? []).map((c) => [c.id, c.label]));
    const options = ids.map((id) => ({
      id,
      label: labels.get(id) ?? id,
      usableNow: true,
    }));
    if (CATALOG_RESOLVED_TIERS.has(cap)) {
      const seen = new Set(options.map((o) => o.id));
      for (const c of list ?? []) {
        if (seen.has(c.id)) continue;
        // ⚠️ asr/tts 只并**云供应商**条目 —— 内置目录的本地 id 端脑解析
        // 不到（[CLOUD_ONLY_UNION_TIERS]）。image_gen 整档并（原状）。
        if (CLOUD_ONLY_UNION_TIERS.has(cap) && !c.cloud) continue;
        options.push({ id: c.id, label: c.label, usableNow: true });
      }
    }
    out[cap] = options;
  }

  // ⚠️ **按引擎 id 解析、但目录面里没有这一档** ⇒ ⇒ 也要列出来（已注册的
  // id 是唯一真相 ⇒ ⇒ 它可能压根不在供应商目录里，比如部署注册的自建 id）。
  for (const cap of engineResolved) {
    if (out[cap]) continue;
    const ids = registered[cap] ?? [];
    if (ids.length === 0) continue;
    out[cap] = ids.map((id) => ({ id, label: id, usableNow: true }));
  }

  return out;
}

/**
 * **当前默认值里，此刻用不了的那几档**（要拿去提醒用户）。
 *
 * ⚠️ 只对**按引擎 id 解析**的档说「用不了」—— 那一档的 id 必须已注册，
 * 否则端脑一调用就报「按那个 id 找不到」⇒ ⇒ **存得进去、用不了**。
 * ⚠️ **不按引擎 id 解析的档不在这里说**（那是供应商路由的事 ⇒ ⇒ 客户端
 * 没有依据判断 ⇒ ⇒ 不许编）。
 * ⚠️ **别把「能用」报成「用不了」**：[CATALOG_RESOLVED_TIERS] 那几档的
 * 目录面 id 端脑也解析得到（走云端代理）⇒ 传了 [catalog] 就一并放行。
 */
export function unusableCapabilityDefaults(
  defaults: Record<string, string>,
  info: EngineResolvedInfo,
  catalog: Record<string, CapabilityModelCandidate[]> = {},
): { capability: string; modelId: string }[] {
  const engineResolved = new Set(info?.engineResolved ?? []);
  const registered = info?.registered ?? {};
  const out: { capability: string; modelId: string }[] = [];
  for (const [cap, modelId] of Object.entries(defaults ?? {})) {
    if (!engineResolved.has(cap)) continue;
    const id = (modelId ?? '').trim();
    if (!id) continue;
    const ids = registered[cap] ?? [];
    if (ids.includes(id)) continue;
    if (
      CATALOG_RESOLVED_TIERS.has(cap) &&
      (catalog[cap] ?? []).some(
        (c) =>
          c.id === id &&
          // ⚠️ asr/tts 的目录面放行只对**云供应商**的 id 成立（内置目录的
          // 本地 id 端脑解析不到 ⇒ 照旧要报）。
          (!CLOUD_ONLY_UNION_TIERS.has(cap) || c.cloud),
      )
    ) {
      continue;
    }
    out.push({ capability: cap, modelId: id });
  }
  return out;
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

/** 写 durable 副本的结果 —— **存没存住要分得清**。 */
export interface SnapshotWriteResult {
  /** 真的落盘了吗。 */
  ok: boolean;

  /** 没落盘的原因（ok 为 false 时有）。 */
  error?: string;
}

/**
 * 写 durable 副本。
 *
 * ⚠️ **返回「存没存住」，不许静默吞掉** —— 端脑那份是权威、本地这份只是
 * 「重启后重下发」的缓存 ⇒ ⇒ 写进不去**不等于**这次设置没生效 ⇒ ⇒ 但界面
 * **必须说真话**（「已下发到大脑，但本地副本没存住 ⇒ 重启后这一档会回到
 * 默认」）⇒ ⇒ 否则用户以为「持久了」，重启一次设置全丢 ⇒ ⇒ **失败长得像
 * 成功**。
 *
 * ⚠️ **不抛错** —— 端脑那边已经写成功了 ⇒ ⇒ 抛错会把「**已经生效**」说
 * 成「全失败」⇒ ⇒ 调用方会重试（白重发一遍）⇒ ⇒ 那是另一种撒谎。
 */
export function writeCapabilityDefaultsSnapshot(
  defaults: Record<string, string>,
): SnapshotWriteResult {
  const clean: Record<string, string> = {};
  for (const [k, v] of Object.entries(defaults ?? {})) {
    if (typeof v === 'string' && v.trim()) clean[k] = v.trim();
  }
  try {
    const storage = globalThis.localStorage;
    // ⚠️ **没有 localStorage**（SSR / 无 DOM 的测试环境）⇒ ⇒ 那也是
    // 「没存住」⇒ ⇒ 不许用一个可选链把它悄悄吞成「存住了」。
    if (!storage) {
      return { ok: false, error: 'localStorage is not available' };
    }
    storage.setItem(CAPABILITY_DEFAULTS_STORAGE_KEY, JSON.stringify(clean));
    return { ok: true };
  } catch (e) {
    // 存不进去（隐私模式 / 配额满）⇒ ⇒ **说清没存住**，别假装。
    return {
      ok: false,
      error: e instanceof Error ? e.message : String(e),
    };
  }
}
