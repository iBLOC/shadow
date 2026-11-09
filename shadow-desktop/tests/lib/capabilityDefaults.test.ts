import { describe, it, expect, beforeEach } from 'vitest';
import {
  CAPABILITY_DEFAULTS_STORAGE_KEY,
  capabilityCandidatesByCapability,
  firstCapabilityOf,
  mergeCapabilityDefaultsForPush,
  modelIdOf,
  readCapabilityDefaultsSnapshot,
  writeCapabilityDefaultsSnapshot,
} from '../../src/lib/capabilityDefaults';

/**
 * 「按能力分档的默认模型」这一段的**纯逻辑**判据（桌面端）。
 *
 * ⚠️ 移动端有一份**同名**的 Dart 实现 ⇒ ⇒ 两边的规则必须一模一样
 * ⇒ ⇒ 这里逐条钉住桌面这一份的形状。
 */
describe('capabilityCandidatesByCapability', () => {
  it('按模型的能力标注分组', () => {
    const out = capabilityCandidatesByCapability([
      {
        name: 'OpenAI',
        models: [
          { id: 'gpt-4o', name: 'GPT-4o', capability: 'llm' },
          { id: 'whisper-1', name: 'Whisper', capability: 'asr' },
          { id: 'tts-1', name: 'TTS-1', capability: 'tts' },
        ],
      },
    ]);

    expect(Object.keys(out).sort()).toEqual(['asr', 'llm', 'tts']);
    expect(out.asr[0].id).toBe('whisper-1');
    expect(out.asr[0].label).toBe('OpenAI · Whisper');
  });

  it('没有能力标注的模型不进任何一档（不猜）', () => {
    const out = capabilityCandidatesByCapability([
      { name: 'X', models: [{ id: 'mystery', name: 'Mystery' }] },
    ]);
    expect(out).toEqual({});
  });

  it('同一个 id 在两个供应商下 ⇒ 只留一条（不重复）', () => {
    const out = capabilityCandidatesByCapability([
      { name: 'A', models: [{ id: 'whisper-1', name: 'W1', capability: 'asr' }] },
      { name: 'B', models: [{ id: 'whisper-1', name: 'W2', capability: 'asr' }] },
    ]);
    expect(out.asr.length).toBe(1);
  });

  it('空 id 不进候选（端脑按 id 选引擎 ⇒ 空 id 必失败）', () => {
    const out = capabilityCandidatesByCapability([
      { name: 'A', models: [{ id: '   ', name: 'Blank', capability: 'asr' }] },
    ]);
    expect(out.asr ?? []).toEqual([]);
  });

  it('两种能力形状都读（单个 capability 与 capabilities 数组）', () => {
    expect(firstCapabilityOf({ capability: 'TTS' })).toBe('tts');
    expect(firstCapabilityOf({ capabilities: ['llm', 'vision'] })).toBe('llm');
    expect(firstCapabilityOf({})).toBeNull();
  });

  it('模型 id 两种字段名都读', () => {
    expect(modelIdOf({ id: 'a' })).toBe('a');
    expect(modelIdOf({ model_id: 'b' })).toBe('b');
    expect(modelIdOf({ id: '  ' })).toBe('');
  });
});

describe('mergeCapabilityDefaultsForPush', () => {
  it('基线 = 本地副本 ∪ 端脑当前值（别把另一边的档位抹掉）', () => {
    const next = mergeCapabilityDefaultsForPush(
      { tts: 'tts-local' },
      { asr: 'whisper-1' },
      'llm',
      'gpt-4o',
    );
    expect(next).toEqual({
      tts: 'tts-local',
      asr: 'whisper-1',
      llm: 'gpt-4o',
    });
  });

  it('清空一档 ⇒ 那一档被删掉（不是空串）', () => {
    const next = mergeCapabilityDefaultsForPush(
      { asr: 'whisper-1', tts: 'tts-1' },
      {},
      'asr',
      null,
    );
    expect('asr' in next).toBe(false);
    expect(next.tts).toBe('tts-1');
  });

  it('端脑已有的那一档也要能被覆盖（远端值优先）', () => {
    const next = mergeCapabilityDefaultsForPush(
      {},
      { asr: 'old-model' },
      'asr',
      'new-model',
    );
    expect(next.asr).toBe('new-model');
  });
});

describe('durable 副本（桌面端本地留存）', () => {
  beforeEach(() => {
    globalThis.localStorage?.clear();
  });

  it('坏数据 ⇒ 空表（不许把设置页卡死）', () => {
    globalThis.localStorage?.setItem(CAPABILITY_DEFAULTS_STORAGE_KEY, 'not-json');
    expect(readCapabilityDefaultsSnapshot()).toEqual({});
  });

  it('空串值不进副本（配了但没配 = 失败长得像成功）', () => {
    globalThis.localStorage?.setItem(
      CAPABILITY_DEFAULTS_STORAGE_KEY,
      JSON.stringify({ asr: '   ', tts: 'tts-1' }),
    );
    expect(readCapabilityDefaultsSnapshot()).toEqual({ tts: 'tts-1' });
  });

  it('写进去能读回来', () => {
    writeCapabilityDefaultsSnapshot({ asr: 'whisper-1' });
    expect(readCapabilityDefaultsSnapshot()).toEqual({ asr: 'whisper-1' });
  });
});
