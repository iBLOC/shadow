/**
 * 「agent 声明所需模型能力」的**纯逻辑**（无 React、无网络）。
 *
 * ## 为什么要有这个配置项
 *
 * ⚠️ agent 注册时**不声明**自己要什么模型类型 ⇒ ⇒ 端脑那边只能「有什么给
 * 什么」⇒ ⇒ 一个只要语音识别的 agent 也可能被塞一个对话模型（或者反过来，
 * 一个 TTS agent 根本没被告知它需要 TTS）⇒ ⇒ **配了但没人用**。
 * ⇒ ⇒ 声明落在 `config["required_capabilities"]`（与既有 auto-match 同键）
 * ⇒ ⇒ 端脑按**严格词表**校验：不认识的词**整个拒绝**，本机没有的能力也拒。
 */

/** 能力词 → 用户语言（认得出的走 i18n；认不出的原样显示）。 */
export const AGENT_CAPABILITY_FALLBACK_LABELS: Record<string, string> = {
  llm: '文本模型',
  asr: '语音识别',
  tts: '语音合成',
  vad: '语音活动检测',
  rerank: '重排模型',
  embedding: '向量模型',
  vision: '视觉模型',
  forecast: '预测模型',
  // ⚠️ **词是 `image_gen`（带下划线）** —— 与端脑词表、synapse 云端目录
  // 同一拼法；写错一个字母，能力分档那一行就「认不出」了。
  image_gen: '图片生成',
};

/**
 * 勾选／取消一个能力词。
 *
 * ⚠️ **保持顺序**（用户勾的顺序）⇒ ⇒ 界面显示与提交内容一致。
 */
export function toggleRequiredCapability(
  current: string[],
  capability: string,
): string[] {
  const cap = capability.trim();
  if (!cap) return current;
  return current.includes(cap)
    ? current.filter((c) => c !== cap)
    : [...current, cap];
}

/**
 * 归一化声明列表：去空、去重、**保持顺序**。
 *
 * ⚠️ 空串不许进（端脑那边会把空串判成「配了但没配」⇒ ⇒ 400）。
 */
export function normalizeRequiredCapabilities(list: string[]): string[] {
  const out: string[] = [];
  for (const raw of list ?? []) {
    const cap = (raw ?? '').trim();
    if (!cap) continue;
    if (out.includes(cap)) continue;
    out.push(cap);
  }
  return out;
}

/**
 * 序列化成要递的那一份。
 *
 * ⚠️ **空 ⇒ undefined**（不是空数组）⇒ ⇒ 「没声明」与「声明了零项」在
 * 端脑那边是**两件不同的事** ⇒ ⇒ 一个都没勾时**不许**递一个空数组上去。
 */
export function serializeRequiredCapabilities(
  list: string[],
): string[] | undefined {
  const normalized = normalizeRequiredCapabilities(list);
  return normalized.length > 0 ? normalized : undefined;
}
