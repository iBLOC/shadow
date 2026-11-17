// @vitest-environment node
/**
 * AG-UI —— **客户端这一侧**对着一个活的端脑跑一遍。
 *
 * ## 为什么要有这个文件
 *
 * `aguiClient.test.ts` 喂的是**录下来的字节** ⇒ ⇒ 它证明「协议解析对不对」
 * ⇒ ⇒ 证明**不了**：
 *
 *   ① 端脑**真的**在 `ag-ui:stream` 上吐那几帧（不是我们以为的形状）；
 *   ② **我们自己的客户端代码**（`AguiClient` 发请求 ＋ SSE 解析 ＋ 归约 ＋
 *      `AguiDriver` 收口）真的能对着**活的**端脑跑完一轮；
 *   ③ 真模型真的回话了 ⇒ ⇒ 这一跳不是拿 fixture 冒充的。
 *
 * ⚠️ 与 `a2ui.live.test.tsx` 是**同一族**：没设环境变量就整组跳过 ⇒ ⇒ 常规
 * `vitest run` 不受影响（不许让「端脑没起」变成一条红）。
 *
 * ## 请求面**照生产那一版**
 *
 * ⚠️ 这一条是刻意的：生产是 `runAguiTurn`（`lib/agui/conversationTurn.ts`）
 * ⇒ ⇒ 它发的是 `{ messages, tools? }` ⇒ ⇒ **不带 `threadId`／`runId`**
 * （端脑那一路认的是**路径里**的会话 id，body 里的 `threadId` 只是规范字段）
 * ⇒ ⇒ 内容也用生产那个构造函数（`buildAguiUserParts` ⇒ `ContentPart[]`）
 * ⇒ ⇒ 这一条判据跑的**就是生产发的那个形状** ⇒ ⇒ 形状错了这里就红。
 *
 * ## 怎么跑
 *
 * ```powershell
 * $env:AGUI_LIVE_URL         = 'http://127.0.0.1:60080'
 * $env:AGUI_LIVE_KEY         = '<shadow key>'
 * $env:AGUI_LIVE_ADMIN_TOKEN = '<admin token>'   # 清理会话用
 * pnpm vitest run src/lib/agui/__tests__/agui.live.test.ts
 * ```
 *
 * ⚠️ 端脑**不必**跑在本机 —— `scripts/prove-agui-live-client.ps1`
 * 会把**手机里那台端脑**（App 内嵌的运行时）用 `adb forward` 转到本机 60080。
 */
import { describe, it, expect } from 'vitest';

import { AguiClient } from '../client';
import { AguiDriver } from '../driver';
import { buildAguiUserParts } from '../bridge';

const LIVE_URL = process.env.AGUI_LIVE_URL;
const LIVE_KEY = process.env.AGUI_LIVE_KEY;
const LIVE_ADMIN = process.env.AGUI_LIVE_ADMIN_TOKEN;

const live = Boolean(LIVE_URL && LIVE_KEY && LIVE_ADMIN);

/** 同一句 prompt ⇒ ⇒ 真端脑那一路的读数可比（也够短，不至于把真模型拖超时）。 */
const PROMPT = '请只回两个字：收到';

function base(): string {
  return (LIVE_URL ?? '').replace(/\/+$/, '');
}

/** 建一条**本次运行独有**的会话 ⇒ ⇒ 断言才能精确到「我建的那条」。 */
async function createConversation(): Promise<string> {
  const resp = await fetch(`${base()}/shadow/v1/conversations`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', 'X-Shadow-Key': LIVE_KEY! },
    body: '{}',
  });
  if (!resp.ok) {
    throw new Error(`建会话失败：HTTP ${resp.status} ${await resp.text().catch(() => '')}`);
  }
  const body = (await resp.json()) as { id?: string };
  if (!body.id) throw new Error('建会话失败：响应里没有 id');
  return body.id;
}

/** 收尾：只删**本次建的**那条（走 admin 门）。 */
async function deleteConversation(id: string): Promise<void> {
  await fetch(`${base()}/shadow/v1/conversations/${encodeURIComponent(id)}`, {
    method: 'DELETE',
    headers: { 'X-Admin-Token': LIVE_ADMIN! },
  }).catch(() => undefined);
}

/** 生产那个请求面（`runAguiTurn` 发的一模一样）。 */
function runRequest() {
  return { messages: [{ role: 'user' as const, content: buildAguiUserParts(PROMPT) }] };
}

describe.skipIf(!live)('AG-UI — 对着活的端脑（live）', () => {
  it('端脑真的在 ag-ui:stream 上吐那 5 帧（客户端协议层吃得下）', async () => {
    const convId = await createConversation();
    try {
      const client = new AguiClient({
        baseUrl: base(),
        readHeaders: async () => ({ 'X-Shadow-Key': LIVE_KEY! }),
      });
      const types: string[] = [];
      let text = '';
      for await (const ev of client.streamTurn(convId, runRequest())) {
        types.push(ev.type);
        if (ev.type === 'TEXT_MESSAGE_CONTENT') {
          text += typeof (ev as { delta?: unknown }).delta === 'string'
            ? (ev as { delta: string }).delta
            : '';
        }
      }
      // ⚠️ **逐字断言**：真机上量到的那一串就是这五个（端脑侧探针量过）
      // ⇒ ⇒ 多一帧少一帧都红 ⇒ ⇒ 「我们以为的形状」与「真形状」分不开。
      expect(types).toEqual([
        'RUN_STARTED',
        'TEXT_MESSAGE_START',
        'TEXT_MESSAGE_CONTENT',
        'TEXT_MESSAGE_END',
        'RUN_FINISHED',
      ]);
      expect(text.trim().length).toBeGreaterThan(0);
    } finally {
      await deleteConversation(convId);
    }
  });

  it('**客户端 driver 真的能对着活端脑跑完一轮**（收口事件 ＋ 真模型回话）', async () => {
    const convId = await createConversation();
    try {
      const client = new AguiClient({
        baseUrl: base(),
        readHeaders: async () => ({ 'X-Shadow-Key': LIVE_KEY! }),
      });
      const driver = new AguiDriver({ client });
      const kinds: string[] = [];
      let text = '';
      for await (const ev of driver.streamTurn(convId, runRequest())) {
        kinds.push(ev.kind);
        if (ev.kind === 'text') text += ev.delta ?? '';
      }
      // ⚠️ **收口那一格才是承重的**：没有 RUN_FINISHED ⇒ driver 会抛 ⇒ ⇒
      // 这里能跑到最后 ⇒ ⇒ 真端脑那一路**真的**收口了。
      expect(kinds[kinds.length - 1]).toBe('finished');
      expect(kinds.filter((k) => k === 'text').length).toBeGreaterThan(0);
      expect(text.trim().length).toBeGreaterThan(0);
    } finally {
      await deleteConversation(convId);
    }
  });
});
