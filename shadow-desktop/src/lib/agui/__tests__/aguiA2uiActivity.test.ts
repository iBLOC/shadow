import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

import { describe, expect, it } from 'vitest';

import { AguiClient } from '../client';
import { AguiDriver } from '../driver';
import { a2uiOpsFromEvent, a2uiSurfaceIdOf, A2UI_ACTIVITY_TYPE } from '../a2uiActivity';
import { initialAguiTurnState, reduceAguiEvent } from '../protocol';
import { surfaceFromMessages } from '../../a2uiProtocol';
import type { AguiEvent } from '../types';

/**
 * **发布的契约**（官方 `ACTIVITY_SNAPSHOT` 的形状）。
 *
 * ⚠️ 这里读的是**仓里那一份文件** ⇒ ⇒ 端脑 / 桌面端 / 移动端三份副本
 * 与它逐字一致这件事，由 `scripts/check-agui-a2ui-wire.mjs` 钉着。
 */
const contract = JSON.parse(
  readFileSync(
    resolve(process.cwd(), 'src/lib/agui/__tests__/fixtures/agui_activity_v1.json'),
    'utf8',
  ),
) as AguiEvent;

function fakeResponse(chunks: string[]) {
  const encoder = new TextEncoder();
  let i = 0;
  const body = {
    getReader() {
      return {
        read: async () =>
          i < chunks.length
            ? { done: false, value: encoder.encode(chunks[i++]) }
            : { done: true, value: undefined },
      };
    },
  };
  return {
    ok: true,
    status: 200,
    statusText: 'test',
    text: async () => '',
    body,
  } as unknown as Response;
}

function makeDriver(chunks: string[]) {
  const fetchImpl = (async () => fakeResponse(chunks)) as unknown as typeof fetch;
  const client = new AguiClient({
    baseUrl: 'http://127.0.0.1:8787',
    readHeaders: async () => ({}),
    fetchImpl,
  });
  return new AguiDriver({ client });
}

describe('AG-UI 承载 A2UI 的官方形状', () => {
  it('契约逐字是官方那五个字段', () => {
    expect(Object.keys(contract).sort()).toEqual(
      ['activityType', 'content', 'messageId', 'replace', 'type'].sort(),
    );
    expect(contract.type).toBe('ACTIVITY_SNAPSHOT');
    expect((contract as { activityType: string }).activityType).toBe(A2UI_ACTIVITY_TYPE);
    expect((contract as { replace: boolean }).replace).toBe(true);
  });

  it('从 activity 里取出 ops（逐字，不翻译）', () => {
    const ops = a2uiOpsFromEvent(contract);
    expect(ops).not.toBeNull();
    expect(ops).toHaveLength(1);
    expect(ops![0]).toEqual((contract as { content: unknown[] }).content[0]);
    expect(a2uiSurfaceIdOf(ops!)).toBe('shadow.tasks');
  });

  it('不是 activity ⇒ null；别的 activity ⇒ null（不归我们管）', () => {
    expect(a2uiOpsFromEvent({ type: 'CUSTOM', name: 'x', value: 1 } as unknown as AguiEvent)).toBeNull();
    expect(
      a2uiOpsFromEvent({
        type: 'ACTIVITY_SNAPSHOT',
        messageId: 'm',
        activityType: 'other-thing',
        content: [],
      } as unknown as AguiEvent),
    ).toBeNull();
  });

  it('形状不对 ⇒ **响亮地拒**（不许静默吞掉 ⇒ 失败不许长得像成功）', () => {
    expect(() =>
      a2uiOpsFromEvent({
        type: 'ACTIVITY_SNAPSHOT',
        messageId: 'm',
        activityType: A2UI_ACTIVITY_TYPE,
        content: { not: 'an array' },
      } as unknown as AguiEvent),
    ).toThrow(/operations array/);
    // ⚠️ v0.8 的旧信封 ⇒ 版本没对上 ⇒ 也要拒（只看键不看版本会被骗）
    expect(() =>
      a2uiOpsFromEvent({
        type: 'ACTIVITY_SNAPSHOT',
        messageId: 'm',
        activityType: A2UI_ACTIVITY_TYPE,
        content: [{ version: '0.8', surfaceUpdate: { surfaceId: 's' } }],
      } as unknown as AguiEvent),
    ).toThrow(/not an A2UI v1.0 message/);
  });

  it('归约器不许吞掉 activity（吞掉＝面静默消失）', () => {
    const state = reduceAguiEvent(initialAguiTurnState(), contract);
    expect(state.activities).toHaveLength(1);
    expect(state.activities[0].activityType).toBe(A2UI_ACTIVITY_TYPE);
    expect(state.unknownEventTypes).toEqual([]);
  });

  it('官方 SDK 收下这份契约 ⇒ 面真的存在（零翻译）', () => {
    const ops = a2uiOpsFromEvent(contract)!;
    const surface = surfaceFromMessages(ops);
    expect(surface).not.toBeNull();
    expect(surface!.rootId).toBeTruthy();
  });
});

describe('driver 把那块面交出去', () => {
  it('AG-UI 流里的 activity ⇒ 交成 a2ui_surface', async () => {
    const driver = makeDriver([
      'data:' + JSON.stringify(contract) + '\n\n',
      'data:{"type":"RUN_FINISHED","threadId":"t","runId":"r1"}\n\n',
    ]);
    const kinds: string[] = [];
    let ops: unknown = null;
    for await (const ev of driver.streamTurn('c', {
      messages: [{ role: 'user', content: 'a2ui:tasks' }],
    })) {
      kinds.push(ev.kind);
      if (ev.kind === 'a2ui_surface') ops = ev.ops;
    }
    expect(kinds).toContain('a2ui_surface');
    expect(ops).toHaveLength(1);
  });

  it('别的 activity ⇒ 不画（也不当成未知事件）', async () => {
    const driver = makeDriver([
      'data:{"type":"ACTIVITY_SNAPSHOT","messageId":"m","activityType":"other","content":[]}\n\n',
      'data:{"type":"RUN_FINISHED","threadId":"t","runId":"r1"}\n\n',
    ]);
    const kinds: string[] = [];
    for await (const ev of driver.streamTurn('c', {
      messages: [{ role: 'user', content: 'hi' }],
    })) {
      kinds.push(ev.kind);
    }
    expect(kinds).not.toContain('a2ui_surface');
  });
});
