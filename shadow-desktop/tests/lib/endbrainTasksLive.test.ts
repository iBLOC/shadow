/**
 * 真运行级读数 —— 桌面客户端 ↔ **真端脑**（不是 mock）。
 *
 * ⚠️ **为什么要有这一份**：组件级判据（`EndbrainTaskSection.test.tsx`）用的是
 * **mock 客户端** ⇒ ⇒ mock **不校验请求体** ⇒ ⇒ 「请求体少一个字段」这一类缺陷
 * 在组件级**永远抓不到**（每一步都绿，而真打过去是 400）⇒ ⇒ 必须有一层
 * **真发出去**的判据。
 *
 * ⚠️ **它默认是跳过的**（`SHADOW_LIVE_ENDBRAIN` 不等于 `1` 就整份跳过）⇒ ⇒
 * CI 里没有端脑也不会红 ⇒ ⇒ 但它也**不假装绿**（跳过就是跳过，不是通过）。
 *
 * ## 怎么跑（真端脑 ⇒ 真请求）
 *
 * ```powershell
 * # 1. 起一个真端脑（独立形态：间脑+端脑+海马体+neuron 一个进程）
 * $env:TELENCEPHALON_ADMIN_KEY = 'live-admin-token'
 * $env:TELENCEPHALON_TASKS_FILE = 'C:/Projects/iBLOC/shadow/.local/live-tasks.json'
 * C:/Projects/iBLOC/encephalon/target/debug/encephalon-server.exe --port 60080 --bind 127.0.0.1
 *
 * # 2. 跑这一份
 * $env:SHADOW_LIVE_ENDBRAIN = '1'
 * $env:SHADOW_LIVE_ADMIN_TOKEN = 'live-admin-token'
 * npx vitest run tests/lib/endbrainTasksLive.test.ts
 *
 * # 3.（跨进程重启后还在）把第 2 步打印出来的任务号带回来
 * $env:SHADOW_LIVE_EXPECT_TASK_ID = 'task-1'
 * ```
 */
import { beforeAll, describe, expect, it } from 'vitest';
import { telencephalonClient } from '../../src/lib/telencephalonClient';
import { __resetAdminTokenCache } from '../../src/lib/adminToken';
import { useTaskBoardDataStore } from '../../src/stores/taskBoardDataStore';

const LIVE = process.env.SHADOW_LIVE_ENDBRAIN === '1';
const TOKEN = process.env.SHADOW_LIVE_ADMIN_TOKEN ?? '';
const BASE_URL =
  process.env.SHADOW_LIVE_ENDBRAIN_URL ?? 'http://127.0.0.1:60080';
/** 上一轮跑出来的任务号 —— 用来验「**杀进程重启后还在**」。 */
const EXPECT_ID = process.env.SHADOW_LIVE_EXPECT_TASK_ID ?? '';

/** 桌面的 web 形态没有 sidecar ⇒ admin token 从 localStorage 取（见 `lib/adminToken.ts`）。 */
function useToken(token: string | null): void {
  if (token === null) {
    window.localStorage.removeItem('shadow-admin-token');
  } else {
    window.localStorage.setItem('shadow-admin-token', token);
  }
  __resetAdminTokenCache();
}

describe.skipIf(!LIVE)('端脑任务面 —— 真端脑', () => {
  beforeAll(() => {
    telencephalonClient.setBaseUrl(BASE_URL);
    useToken(TOKEN);
  });

  it('负控：没有钥匙 ⇒ 读门不放行（证明门不是摆设、客户端没走后门）', async () => {
    useToken(null);
    try {
      await expect(telencephalonClient.getTasks()).rejects.toThrow(/401/);
    } finally {
      useToken(TOKEN);
    }
  });

  it('建一条 ⇒ 桌面的 store 看得见 ⇒ 确认 ⇒ 状态真的变', async () => {
    const created = await telencephalonClient.createTask({
      title: '真运行级探针',
      description: '桌面 → 真端脑',
    });
    const id: string = created?.id ?? created?.task_id;
    expect(id, '端脑建出来的任务必须有任务号').toBeTruthy();
    // eslint-disable-next-line no-console
    console.log(`LIVE_TASK_ID=${id}`);

    // —— 走**生产那条路**：store 的切片 → 客户端 → 形状模块 ——
    await useTaskBoardDataStore.getState().fetchEndbrainTasks();
    const state = useTaskBoardDataStore.getState();
    expect(state.endbrainError).toBeNull();

    const seen = state.endbrainTasks.find((t) => t.id === id);
    expect(seen, '桌面任务板必须看得见这条端脑任务').toBeTruthy();
    expect(seen?.title).toBe('真运行级探针');
    expect(seen?.confirmed, '刚建出来的任务还没点头').toBe(false);

    // —— 确认（写门：POST ⇒ auto ⇒ admin）——
    await useTaskBoardDataStore.getState().confirmEndbrainTask(id, true);

    const after = useTaskBoardDataStore
      .getState()
      .endbrainTasks.find((t) => t.id === id);
    expect(after?.confirmed, '确认之后这条应当已经点头').toBe(true);
  });

  it('杀进程重启后还在（真运行级的落盘读数）', async () => {
    if (!EXPECT_ID) return; // 没给任务号 ⇒ 这一条不跑（不是「通过」）
    await useTaskBoardDataStore.getState().fetchEndbrainTasks();
    const found = useTaskBoardDataStore
      .getState()
      .endbrainTasks.some((t) => t.id === EXPECT_ID);
    expect(found, `重启后端脑任务 ${EXPECT_ID} 必须还在`).toBe(true);
  });
});