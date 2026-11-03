/**
 * 端脑面（127.0.0.1:60080）的状态 —— **这个 App 自己的**大脑上线了吗？
 *
 * ⚠️ 为什么前端需要知道这件事：
 *
 * 桌面前端只认 `127.0.0.1:60080`（`telencephalonStore.ts` 的
 * `DEFAULT_BASE_URL`）⇒ ⇒ 桌面端自己的端脑面起不来时，前端**不会**
 * 说「连不上自己的大脑」⇒ ⇒ 它**照常连上去**⇒ ⇒ 而那个端口上是谁，
 * 桌面端不控制 ⇒ ⇒ 用户的对话跑进了**陌生的大脑**（身份、记忆、叶区
 * 全不是他的）⇒ ⇒ 界面上只剩端脑自己吐的那句错
 * （「Failed to get models: error sending request for url
 * (http://127.0.0.1:56334/v1/models)」）⇒ ⇒ **失败长得像成功**。
 *
 * ⇒ 所以把「那张面上是谁」摆到明面上：`conflict` / `failed` ⇒
 * 界面必须说真话，而不是让用户去猜那个端口是谁的。
 */

import { safeInvoke } from './tauriSafe';

export type BrainFaceState = 'starting' | 'listening' | 'conflict' | 'failed';

export interface BrainFaceStatus {
  /** starting / listening / conflict / failed */
  state: BrainFaceState;
  /** 端脑面地址（一直是 127.0.0.1:60080）。 */
  addr: string;
  /** 出错时的真实原因（系统错误原文）—— 不许换成别的理由。 */
  error?: string | null;
  /** 桌面端自己的面是否在线。false ⇒ 前端连的不是这个 App 的大脑。 */
  owned: boolean;
}

/** 读端脑面状态 —— 读不到就返回 null（web 构建 / 命令不存在）。 */
export async function getBrainFaceStatus(): Promise<BrainFaceStatus | null> {
  return safeInvoke<BrainFaceStatus>('get_brain_face_status');
}
