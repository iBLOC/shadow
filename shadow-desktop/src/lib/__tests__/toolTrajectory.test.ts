import { describe, expect, it } from 'vitest';
import { intentSignatureOf, lastUnsettledToolCall, trajectoryStep } from '../toolTrajectory';
import type { Message, ToolCallStatus } from '../../types';

const card = (name: string, status: ToolCallStatus): Message => ({
  id: name,
  role: 'assistant',
  content: '',
  timestamp: new Date(),
  tool_call: { id: name, name, args: {}, status },
});

describe('intentSignatureOf（与移动端 chat_provider.dart 同一条口径）', () => {
  it('去空白与标点（含全角）、小写', () => {
    expect(intentSignatureOf('帮 我，设置 主题！')).toBe('帮我设置主题');
    expect(intentSignatureOf('Open the "settings" page.')).toBe(
      'openthesettingspage',
    );
    expect(intentSignatureOf('「调暗」灯光：客厅')).toBe('调暗灯光客厅');
  });
  it('截前 40 字符', () => {
    expect(intentSignatureOf('a'.repeat(60))).toHaveLength(40);
  });
  it('空/纯标点输入 → 空串（learner 不进分组）', () => {
    expect(intentSignatureOf('')).toBe('');
    expect(intentSignatureOf(null)).toBe('');
    expect(intentSignatureOf(undefined)).toBe('');
    expect(intentSignatureOf('   ')).toBe('');
    expect(intentSignatureOf('，。！')).toBe('');
  });
});

describe('trajectoryStep', () => {
  it('at 缺省 ⇒ 当前 UTC ISO（Z 结尾）', () => {
    const step = trajectoryStep('set_theme', true);
    expect(step.tool).toBe('set_theme');
    expect(step.ok).toBe(true);
    expect(step.at.endsWith('Z')).toBe(true);
  });
  it('at 可显式给定（确定性）', () => {
    expect(trajectoryStep('set_theme', false, '2026-11-12T00:00:00.000Z')).toEqual({
      tool: 'set_theme',
      ok: false,
      at: '2026-11-12T00:00:00.000Z',
    });
  });
});

describe('lastUnsettledToolCall（侧栏徽章的数据源）', () => {
  it('取最后一张还没落定的卡', () => {
    const messages = [
      card('a', 'succeeded'),
      card('b', 'running'),
      card('c', 'succeeded'),
    ];
    expect(lastUnsettledToolCall(messages)?.name).toBe('b');
  });
  it('awaiting-approval 也算没落定', () => {
    const messages = [card('a', 'awaiting-approval')];
    expect(lastUnsettledToolCall(messages)?.name).toBe('a');
  });
  it('全落定 ⇒ null（徽章退化为纯「运行中」）', () => {
    const messages = [card('a', 'failed'), card('b', 'succeeded')];
    expect(lastUnsettledToolCall(messages)).toBeNull();
  });
  it('空消息流 ⇒ null', () => {
    expect(lastUnsettledToolCall([])).toBeNull();
  });
});
