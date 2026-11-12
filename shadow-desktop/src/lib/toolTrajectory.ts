/** 「历史工具记录喂给思维定式（flow）」的纯逻辑半边 —— 与移动端
 *  lib/providers/chat_provider.dart 的 intentSignatureOf / 轨迹行形状
 *  同一条口径：两端对同一句话必须产出同一个键，learner 才能把两端
 *  的轨迹归进同一个意图组。
 *
 *  ⚠️ 签名规则刻意**笨**（去空白与标点、小写、截前 40 字符）——
 *  **确定性比聪明重要**（同一句话两次必须得到同一个键；
 *  签名错了顶多分组不准，不会错动作）。 */

/** 一条轨迹行 —— 端脑 ingest 端点吃的形状（{tool, ok, at}）。 */
export interface ToolTrajectoryStep {
  tool: string;
  ok: boolean;
  /** UTC ISO-8601（Date#toISOString 恒为 UTC）。 */
  at: string;
}

/** 执行完成的一步 —— 成功失败都记（learner 蒸馏成功的成 flow 草稿；
 *  意图检索靠失败记录避开坏路径）。 */
export function trajectoryStep(
  tool: string,
  ok: boolean,
  at?: string,
): ToolTrajectoryStep {
  return { tool, ok, at: at ?? new Date().toISOString() };
}

/** 「意图签名」：把用户指令规范化成检索键（learner 按它把相似轮次
 *  分组、再蒸馏成 flow 草稿）。无签名不进分组 ⇒ 空输入返回空串。 */
export function intentSignatureOf(input: string | null | undefined): string {
  if (!input) return '';
  const flattened = input
    .toLowerCase()
    .replace(/[\s，。！？、,.!?;；:："「」()（）]+/g, '');
  if (flattened.length === 0) return '';
  return flattened.length > 40 ? flattened.slice(0, 40) : flattened;
}

import type { Message, ToolCallMessage, ToolCallStatus } from '../types';

/** 还没落定的工具状态（这些卡还「正在干活/等人」）。 */
const UNSETTLED_TOOL_STATUSES: ReadonlySet<ToolCallStatus> = new Set<
  ToolCallStatus
>(['pending', 'running', 'awaiting-approval', 'awaiting-input']);

/** 「正在执行的工具」—— 取**最后一张还没落定**的工具卡片；
 *  全落定了返回 null ⇒ 徽章退化为纯「运行中」。 */
export function lastUnsettledToolCall(
  messages: Message[],
): ToolCallMessage | null {
  for (let i = messages.length - 1; i >= 0; i--) {
    const call = messages[i]?.tool_call;
    if (call && UNSETTLED_TOOL_STATUSES.has(call.status)) return call;
  }
  return null;
}
