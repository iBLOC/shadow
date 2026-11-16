import { describe, expect, it } from 'vitest';

import { ToolOutcomeGate, failedOutcome } from '../toolOutcomeGate';

/**
 * 结算闸的判据 —— 钉的是**机制**：一次调用只兑现一次、没登记的不兑现、
 * 放弃时**每一条都兑现成失败**（模型不许干等）。
 */
describe('ToolOutcomeGate', () => {
  it('兑现一次就生效 —— 第二次不兑现(模型只看见一条结果)', async () => {
    const gate = new ToolOutcomeGate();
    const p = gate.open('c1');
    expect(gate.isOpen('c1')).toBe(true);
    expect(gate.settle('c1', { ok: true, content: 'done' })).toBe(true);
    expect(gate.settle('c1', { ok: true, content: 'again' })).toBe(false);
    expect(await p).toEqual({ ok: true, content: 'done' });
    expect(gate.openCount).toBe(0);
  });

  it('没登记过的 id ⇒ ⇒ 不兑现(不许凭空多一条结果)', () => {
    const gate = new ToolOutcomeGate();
    expect(gate.settle('never-opened', { ok: true, content: 'x' })).toBe(false);
  });

  it('放弃全部 ⇒ ⇒ 每条都兑现成失败(模型不干等)', async () => {
    const gate = new ToolOutcomeGate();
    const a = gate.open('c1');
    const b = gate.open('c2');
    gate.abandonAll('页面被关掉了');
    expect((await a).ok).toBe(false);
    expect((await a).error).toBe('页面被关掉了');
    expect((await b).ok).toBe(false);
    expect(gate.openCount).toBe(0);
  });

  it('失败的原因不许留空(空着＝把失败说成成功)', () => {
    expect(failedOutcome('   ').error).toBeTruthy();
    expect(failedOutcome('boom').error).toBe('boom');
  });
});
