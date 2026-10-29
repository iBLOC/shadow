import { hippocampusClient } from './hippocampusClient';

/**
 * 外观偏好的**记忆**表示。
 *
 * 「主题色也是记忆的一部分」—— 影子的外观偏好存在海马体
 * （`dimension=Agent`），而不只是躺在 localStorage 里。这样：
 *
 * - 换设备 / 重装后，只要连上海马体，影子还记得这个用户喜欢什么颜色；
 * - 一个海马体服务多个助理时，靠 `tenant_id` 区分各自的偏好。
 *
 * 用**一条稳定 uri** 而不是每次新增一条 —— 偏好是「当前值」，不是历史。
 * （巩固器产的洞见也在 `dimension=Agent` 里，靠 uri 区分。）
 */

/** 主题色偏好在海马体里的稳定 uri。 */
export const ACCENT_MEMORY_URI = 'preference://theme/accent';

/** 记忆里存的必须是合法 hex —— 坏值不能把主题搞崩。 */
const HEX = /^#(?:[0-9a-fA-F]{3}|[0-9a-fA-F]{4}|[0-9a-fA-F]{6}|[0-9a-fA-F]{8})$/;

/** 让影子记住当前的主题色。 */
export async function rememberAccent(accentSeed: string): Promise<void> {
  await hippocampusClient.upsertMemory({
    uri: ACCENT_MEMORY_URI,
    content: accentSeed,
    dimension: 'Agent',
  });
}

/**
 * 读回影子记住的主题色。
 *
 * 返回 `null` 表示「没记过 / 够不到海马体 / 记的是坏值」—— 三种情况
 * 对调用方是一样的：用本地那一份。
 */
export async function recallAccent(): Promise<string | null> {
  const found = await hippocampusClient.findMemoryByUri(ACCENT_MEMORY_URI, {
    dimension: 'Agent',
  });
  const seed = found?.content?.trim();
  return seed && HEX.test(seed) ? seed : null;
}
