/**
 * 真运行级读数 —— 桌面客户端 ↔ **真端脑**的通知面（不是 mock）。
 *
 * ## ⚠️ 为什么要有这一份
 *
 * 提醒链路一共四段：调度器（端脑）→ 通知收件箱（端脑）→ **HTTP 通知面**（端脑）
 * → 客户端轮询 → 确认。
 * ⇒ ⇒ 前三段端脑侧都有判据（`tests/task_reminder_reaches_the_client.rs` 钉的是
 * **真 HTTP 面**）⇒ ⇒ **第四段（客户端真的去轮询）只有 mock**
 * （`tests/lib/reminderInbox.test.ts` 用的是假 source）⇒ ⇒
 * ⇒ ⇒ **「真端脑序列化出来的形状」与「客户端声明的形状」对不对得上，从来没人验过**
 * ⇒ ⇒ 而这正是「mock 客户端不校验线上形状」那一族：
 * mock 把 `task_id`／`notification_type`／`due_time` 一个个手写成
 * 「端脑应该给的样子」⇒ ⇒ 端脑哪天改了字段名，mock **照样全绿**
 * ⇒ ⇒ 而真客户端会读到 `undefined` ⇒ ⇒ 提醒**送不出去**（标题空白、类型认不出）
 * ⇒ ⇒ ⇒ **失败长得像成功**（轮询成功、ack 成功、提醒就是没内容）。
 *
 * ## 怎么跑（真端脑 ⇒ 真请求）
 *
 * ```powershell
 * # 1. 起一个真端脑（独立形态：间脑+端脑+海马体+neuron 一个进程）
 * $env:TELENCEPHALON_ADMIN_KEY = 'live-admin-token'
 * $env:TELENCEPHALON_SHADOW_KEY = 'live-shadow-key'
 * C:/Projects/iBLOC/encephalon/target/debug/encephalon-server.exe --port 60190 --bind 127.0.0.1
 *
 * # 2. 跑这一份
 * $env:SHADOW_LIVE_ENDBRAIN = '1'
 * $env:SHADOW_LIVE_ADMIN_TOKEN = 'live-admin-token'
 * $env:SHADOW_LIVE_ENDBRAIN_URL = 'http://127.0.0.1:60190'
 * npx vitest run tests/lib/reminderNotificationsLive.test.ts
 * ```
 *
 * ⚠️ **它默认是跳过的**（`SHADOW_LIVE_ENDBRAIN` 不等于 `1` 就整份跳过）⇒ ⇒
 * CI 里没有端脑也不会红 ⇒ ⇒ 但它也**不假装绿**（跳过就是跳过，不是通过）。
 * ⚠️ **但它不是「永远不跑」** —— 夜间的 `desktop-e2e` workflow 里有一份
 * **真端脑**（回环）⇒ ⇒ 那里它**真跑**；而且那边「被跳过」判**红**
 * ⇒ ⇒ 端脑的线上形状漂移了不会没人知道。
 *
 * ## ⚠️ 一条不许省的纪律：读门必须是**两把钥匙都试**
 *
 * 通知面是**读门**（影子锁 ∪ admin token）⇒ ⇒ 只带 admin token 读得到
 * ⇒ ⇒ 只带影子锁也读得到 ⇒ ⇒ **两把都没有 ⇒ ⇒ 401**（不是 200 + 空数组
 * —— 那会把「拿不到」说成「没有提醒」⇒ ⇒ 失败长得像成功）。
 */
import { beforeAll, describe, expect, it } from 'vitest';
import { telencephalonClient } from '../../src/lib/telencephalonClient';
import { startReminderPoller } from '../../src/lib/reminderInbox';
import { __resetAdminTokenCache } from '../../src/lib/adminToken';

const LIVE = process.env.SHADOW_LIVE_ENDBRAIN === '1';
const TOKEN = process.env.SHADOW_LIVE_ADMIN_TOKEN ?? '';
const SHADOW = process.env.SHADOW_LIVE_SHADOW_KEY ?? '';
const BASE_URL =
  process.env.SHADOW_LIVE_ENDBRAIN_URL ?? 'http://127.0.0.1:60080';

/** 桌面的 web 形态没有 sidecar ⇒ admin token 从 localStorage 取（见 `lib/adminToken.ts`）。 */
function useToken(token: string | null): void {
  if (token === null) {
    window.localStorage.removeItem('shadow-admin-token');
  } else {
    window.localStorage.setItem('shadow-admin-token', token);
  }
  __resetAdminTokenCache();
}

/** 只带影子锁（admin token 摘掉）—— 用来验「读门认两把钥匙」。 */
function useOnlyShadowKey(): void {
  useToken(null);
  telencephalonClient.setApiKey(SHADOW);
}

/**
 * 在端脑那边**造一条会响的提醒** —— 判据不许依赖「别的判据留下的状态」。
 *
 * ⚠️ **为什么必须自己造**（2026-11-09 真机实测）：这份判据的第一版**桌面端绿、
 * 移动端红** ⇒ ⇒ 原因是桌面端那条 ack 判据**先跑完并 ack 掉了那条提醒**
 * ⇒ ⇒ 端脑待办空了 ⇒ ⇒ 另一份判据的「前提：端脑那边确实有待确认的提醒」
 * ⇒ ⇒ ⇒ **判据之间的顺序耦合**（谁先跑谁说了算）⇒ ⇒ 这样的判据是运气。
 */
async function plantReminder(): Promise<void> {
  const due = new Date(Date.now() + 5 * 60_000).toISOString();
  const created = await telencephalonClient.createTask({
    title: '桌面端真跑级探针',
    dueTime: due,
  }, PLANT_TIMEOUT_MS);
  const id: string = created?.id ?? created?.task_id;
  expect(id, '端脑建出来的任务必须有任务号').toBeTruthy();
  // ⚠️ 调度器**默认 60 秒**一个周期（首个 tick 延后一个周期）⇒ ⇒ 得等。
  for (let i = 0; i < 90; i++) {
    await new Promise((r) => setTimeout(r, 1000));
    if ((await telencephalonClient.listNotifications()).length > 0) return;
  }
  throw new Error('端脑那边 90 秒内没有响起提醒（调度器周期默认 60 秒）');
}

  // ⚠️ **超时预算**：调度器**默认 60 秒**一个周期 ⇒ ⇒ 造一条提醒要等它响
  // ⇒ ⇒ vitest 默认的 5s/10s **不够** ⇒ ⇒ 这份判据必须自己放宽。
  // ⚠️ **不是「把超时调大来掩盖失败」** —— 放宽的是**等待调度器**这件事的预算，
  // 断言本身（形状 / 门 / ack）仍是逐字相等 ⇒ ⇒ 尺子没被放松。
  const PLANT_TIMEOUT_MS = 180_000;

describe.skipIf(!LIVE)('端脑通知面 —— 真端脑', () => {
  beforeAll(() => {
    telencephalonClient.setBaseUrl(BASE_URL);
    useToken(TOKEN);
    telencephalonClient.setApiKey(SHADOW);
  });

  it('负控：两把钥匙都没有 ⇒ 读门不放行（不是 200 + 空数组）', async () => {
    useToken(null);
    telencephalonClient.setApiKey('');
    try {
      await expect(telencephalonClient.listNotifications()).rejects.toThrow(/401/);
    } finally {
      useToken(TOKEN);
      telencephalonClient.setApiKey(SHADOW);
    }
  });

  it('只带影子锁 ⇒ 读得到（读门 = 影子锁 ∪ admin token）', async () => {
    useOnlyShadowKey();
    try {
      const list = await telencephalonClient.listNotifications();
      expect(Array.isArray(list), '读面必须回一个数组').toBe(true);
    } finally {
      useToken(TOKEN);
      telencephalonClient.setApiKey(SHADOW);
    }
  });


  it('真端脑给的形状 ⇒ 客户端读到的每个字段都有值（形状钉住）', async () => {
    // ⚠️ 这一条钉的是**线上形状**：端脑 `notification_inbox::Notification`
    // 序列化成 snake_case（`task_id`／`task_title`／`notification_type`／`due_time`）
    // ⇒ ⇒ 客户端声明的也是这一套 ⇒ ⇒ 哪天端脑改了字段名 ⇒ ⇒ 这里立刻红
    // ⇒ ⇒ 而 mock 层**永远绿**（mock 把「应该长什么样」手写死了）。
    await plantReminder();
    const list = await telencephalonClient.listNotifications();
    expect(list.length, '真端脑那边应当至少有一条待确认的提醒').toBeGreaterThan(0);

    const n = list[0];
    expect(n.id, '通知自己的编号（ack 要用它）').toBeTruthy();
    expect(n.task_id, '任务号 —— 端脑分配的事实').toBeTruthy();
    expect(n.task_title, '任务标题').toBeTruthy();
    expect(
      ['Reminder', 'Overdue', 'NeedsConfirmation'],
      '通知类型必须是端脑的枚举字面量（客户端按它分支）',
    ).toContain(n.notification_type);
    expect(n.message, '提醒正文（客户端直接把它显示给用户）').toBeTruthy();
    expect(n.timestamp, '时间戳').toBeTruthy();
  }, PLANT_TIMEOUT_MS);

  it('送不出去 ⇒ 不确认 ⇒ 提醒留在端脑待办里（不许静默消失）', async () => {
    // ⚠️ **核心纪律**（与 mock 层那条孪生）：客户端送到用户眼前失败 ⇒ ⇒
    // **不许** ack ⇒ ⇒ 提醒留在端脑的待办里 ⇒ ⇒ 下个周期再送。
    // ⇒ ⇒ 确认掉一条用户没看到的提醒 ⇒ ⇒ 提醒**静默消失** ⇒ ⇒ 失败长得像成功。
    await plantReminder();
    const before = await telencephalonClient.listNotifications();
    expect(before.length, '前提：端脑那边确实有待确认的提醒').toBeGreaterThan(0);
    const target = before[0];

    // 走**生产那条路**：轮询器 ⇒ ⇒ deliver 返回 false（送不出去）。
    const stop = startReminderPoller({
      source: telencephalonClient,
      deliver: async () => false,
      intervalMs: 60_000,
    });
    await new Promise((r) => setTimeout(r, 400));
    stop();

    const stillThere = await telencephalonClient.listNotifications();
    expect(
      stillThere.some((x) => x.id === target.id),
      '送不出去 ⇒ ⇒ 不许确认 ⇒ ⇒ 提醒必须**留在端脑待办里**',
    ).toBe(true);
  });

  it('真 ack ⇒ 端脑待办里真的少了它（写门：只有 admin token 开得了）', async () => {
    await plantReminder();
    const before = await telencephalonClient.listNotifications();
    expect(before.length, '前提：端脑那边确实有待确认的提醒').toBeGreaterThan(0);
    const target = before[0];

    // ⚠️ **先钉住写门**：ack 是**写门** ⇒ ⇒ 影子锁开不了它 ⇒ ⇒
    // 不许替你的客户端把提醒标记成已送达。
    useOnlyShadowKey();
    try {
      await expect(telencephalonClient.ackNotifications([target.id])).rejects.toThrow(
        /401/,
      );
    } finally {
      useToken(TOKEN);
      telencephalonClient.setApiKey(SHADOW);
    }

    const stillThere = await telencephalonClient.listNotifications();
    expect(
      stillThere.some((x) => x.id === target.id),
      '影子锁 ack 不成 ⇒ 提醒必须**留在待办里**（不许静默消失）',
    ).toBe(true);

    // 带 admin token ⇒ ack 成功 ⇒ ⇒ 再读就没了。
    await telencephalonClient.ackNotifications([target.id]);
    const after = await telencephalonClient.listNotifications();
    expect(
      after.some((x) => x.id === target.id),
      '确认过的提醒不该还在待办里',
    ).toBe(false);
  }, PLANT_TIMEOUT_MS);
});
