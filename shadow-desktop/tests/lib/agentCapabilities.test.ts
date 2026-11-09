import { describe, it, expect } from 'vitest';
import {
  AGENT_CAPABILITY_FALLBACK_LABELS,
  normalizeRequiredCapabilities,
  serializeRequiredCapabilities,
  toggleRequiredCapability,
} from '../../src/lib/agentCapabilities';

/**
 * 「agent 注册时声明所需模型能力」这一段的**纯逻辑**判据。
 *
 * ⚠️ 这些判据钉的是**声明的形状**（勾选、去重、空 ⇒ 不声明）⇒ ⇒ 端脑
 * 那边「不认识的词整个拒绝」「空串 = 配了但没配」那两条规则在端脑侧另有
 * 判据（tests/capability_defaults_and_agent_declaration.rs）。
 */
describe('toggleRequiredCapability', () => {
  it('勾上 ⇒ 加进去（保持用户勾的顺序）', () => {
    expect(toggleRequiredCapability([], 'llm')).toEqual(['llm']);
    expect(toggleRequiredCapability(['llm'], 'asr')).toEqual(['llm', 'asr']);
  });

  it('再点一次 ⇒ 取消', () => {
    expect(toggleRequiredCapability(['llm', 'asr'], 'llm')).toEqual(['asr']);
  });

  it('空词不进表（端脑那边空串 = 配了但没配 ⇒ ⇒ 400）', () => {
    expect(toggleRequiredCapability(['llm'], '   ')).toEqual(['llm']);
  });
});

describe('normalizeRequiredCapabilities', () => {
  it('去空、去重、保持顺序', () => {
    expect(
      normalizeRequiredCapabilities(['llm', '  ', 'asr', 'llm', ' tts ']),
    ).toEqual(['llm', 'asr', 'tts']);
  });

  it('空列表 ⇒ 空表（不炸）', () => {
    expect(normalizeRequiredCapabilities([])).toEqual([]);
  });
});

describe('serializeRequiredCapabilities', () => {
  it('一个都没勾 ⇒ undefined（不是空数组）', () => {
    // ⚠️ 「没声明」与「声明了零项」在端脑那边是**两件不同的事**。
    expect(serializeRequiredCapabilities([])).toBeUndefined();
    expect(serializeRequiredCapabilities(['  '])).toBeUndefined();
  });

  it('勾了就整份递上去（去重后的）', () => {
    expect(serializeRequiredCapabilities(['llm', 'llm', 'asr'])).toEqual([
      'llm',
      'asr',
    ]);
  });
});

describe('能力词 → 用户语言', () => {
  it('认得的能力词有中文兜底（认不出的原样显示）', () => {
    expect(AGENT_CAPABILITY_FALLBACK_LABELS.llm).toBe('文本模型');
    expect(AGENT_CAPABILITY_FALLBACK_LABELS.asr).toBe('语音识别');
    expect(AGENT_CAPABILITY_FALLBACK_LABELS.tts).toBe('语音合成');
    // ⚠️ 端脑加了新能力 ⇒ 词表里没有 ⇒ 界面原样显示那个词（不吞）。
    expect(AGENT_CAPABILITY_FALLBACK_LABELS.some_new_word).toBeUndefined();
  });
});
