/**
 * 提醒收件箱 —— 桌面端把端脑的提醒**送到用户眼前**的那一段。
 *
 * ## 为什么需要它（2026-11-09 真机取证）
 *
 * 端脑以前**在生产上从不构造**调度器 ⇒ ⇒ 用户在对话里说「提前 10 分钟
 * 提醒我」⇒ ⇒ 端脑把提醒**存进任务库**⇒ ⇒ **永远不响** ⇒ ⇒ 而每一步都
 * 成功 ⇒ ⇒ **失败长得像成功**。
 *
 * 现在端脑会响了 ⇒ ⇒ 但**响了没人收到**是同一种失败 ⇒ ⇒ 这一段就是
 * 「收到」那个出口：**轮询 → 送到眼前 → 确认**。
 *
 * ## 为什么是轮询
 *
 * 端脑的 SSE 面是**按对话**的（`/shadow/v1/conversations/{id}/messages:stream`）
 * ⇒ ⇒ 那不是广播面 ⇒ ⇒ 「提醒 → 用户眼前」要另开一条通道 ⇒ ⇒ 轮询是
 * 最省事的一条，而且在息屏 / 后台 / 断网恢复之后都成立。
 *
 * ## ⚠️ 一条不许省的纪律
 *
 * **只有真的送出去了才确认** —— 送不出去（没权限 / 不是 Tauri）⇒ ⇒ 提醒
 * **留在待办里**⇒ ⇒ 下个周期再送 ⇒ ⇒ 绝不「确认掉一条用户没看到的提醒」
 * ⇒ ⇒ 那会让提醒**静默消失**＝失败长得像成功。
 */

import type { ReminderNotification } from './telencephalonClient';

export interface ReminderSource {
  /** 未确认的提醒（端脑的收件箱）。 */
  listNotifications(): Promise<ReminderNotification[]>;
  /** 确认（= 「已经送到用户眼前了」）。 */
  ackNotifications(ids: string[]): Promise<void>;
}

export interface ReminderPollerOptions {
  source: ReminderSource;
  /**
   * 真的送到用户眼前了吗？
   *
   * ⚠️ 返回 `false` ⇒ ⇒ **不确认** ⇒ ⇒ 那条提醒留在端脑的待办里，
   * 下一个周期再送一次（直到送出去为止）。
   */
  deliver: (n: ReminderNotification) => Promise<boolean> | boolean;
  /** 轮询周期（毫秒）—— 默认 30 秒。 */
  intervalMs?: number;
  onError?: (e: unknown) => void;
}

/**
 * 轮询端脑的提醒 ⇒ ⇒ 逐条送到用户眼前 ⇒ ⇒ 送出去了才确认。
 *
 * @returns 停掉轮询的函数（组件卸载时调用）。
 */
export function startReminderPoller(options: ReminderPollerOptions): () => void {
  let stopped = false;
  let timer: ReturnType<typeof setTimeout> | undefined;

  const tick = async (): Promise<void> => {
    if (stopped) return;
    try {
      const pending = await options.source.listNotifications();
      for (const n of pending) {
        if (stopped) return;
        // ⚠️ **先送，再确认** —— 送不出去就不确认（提醒留在待办里）。
        const delivered = await options.deliver(n);
        if (!delivered) {
          options.onError?.(
            new Error(`reminder ${n.id} was not delivered — it stays pending`),
          );
          continue;
        }
        await options.source.ackNotifications([n.id]);
      }
    } catch (e) {
      options.onError?.(e);
    }
    if (!stopped) {
      timer = setTimeout(() => {
        void tick();
      }, options.intervalMs ?? 30_000);
    }
  };

  void tick();

  return () => {
    stopped = true;
    if (timer !== undefined) clearTimeout(timer);
  };
}
