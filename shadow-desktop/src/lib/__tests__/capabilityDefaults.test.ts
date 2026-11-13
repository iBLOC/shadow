/**
 * `image_gen` 的候选面 —— **两套命名空间的并集**（本地注册表 ＋ 云供应商目录）。
 *
 * ⚠️ 为什么只有这一档要并：端脑 `api/images.rs` 的分流是「解析出的 id 先查
 * **云供应商模型表** ⇒ 命中就代理云端；否则才进本地 imagegen 注册表」⇒ ⇒
 * 目录面里的云图片模型 id 在那一档**真的能用**。
 * 而 `api/voice.rs`（asr/tts）**只有注册表一条腿** ⇒ 目录面的 id 端脑解析
 * 不到 ⇒ 并进来就是「存得进去、用不了」（2026-11-09 实测根因）。
 *
 * ⚠️ 与移动端 `brain_model_source_provider.dart` 的 `catalogResolvedTiers`
 * 是同一条判据的两份实现 —— 这两份**必须同一口径**（本文件钉桌面这份）。
 */
import { describe, expect, it } from 'vitest';

import {
  CATALOG_RESOLVED_TIERS,
  capabilityOptionsByCapability,
  unusableCapabilityDefaults,
  type CapabilityModelCandidate,
  type EngineResolvedInfo,
} from '../capabilityDefaults';

const catalog: Record<string, CapabilityModelCandidate[]> = {
  image_gen: [
    { id: 'moss-image', label: 'Candle · MOSS' },
    { id: 'cogview-4', label: 'Zhipu · CogView-4' },
  ],
  asr: [{ id: 'whisper-base', label: 'Whisper base' }],
};

describe('capabilityOptionsByCapability —— 已注册面 ∪ 目录面（仅 image_gen）', () => {
  it('image_gen：本地注册的在前、目录面的补在后、同 id 只留一条', () => {
    const info: EngineResolvedInfo = {
      engineResolved: ['image_gen'],
      registered: { image_gen: ['moss-image'] },
    };
    const out = capabilityOptionsByCapability(catalog, info);
    expect(out.image_gen.map((o) => o.id)).toEqual(['moss-image', 'cogview-4']);
    // 同一个 id 两套显示名更让人困惑 ⇒ 用目录面那份。
    expect(out.image_gen[0].label).toBe('Candle · MOSS');
  });

  it('⚠️ asr 不许把目录面的 id 并进来（voice 面没有云端腿）', () => {
    const info: EngineResolvedInfo = {
      engineResolved: ['asr'],
      registered: { asr: ['whisper-model'] },
    };
    const out = capabilityOptionsByCapability(catalog, info);
    expect(out.asr.map((o) => o.id)).toEqual(['whisper-model']);
  });

  it('放行名单只含 image_gen（改名单要连移动端一起改）', () => {
    expect([...CATALOG_RESOLVED_TIERS]).toEqual(['image_gen']);
  });
});

describe('unusableCapabilityDefaults —— 别把「能用」报成「用不了」', () => {
  const info: EngineResolvedInfo = {
    engineResolved: ['asr', 'image_gen'],
    registered: { asr: ['whisper-model'], image_gen: [] },
  };

  it('image_gen 的云模型 id（在目录面里）⇒ 不算用不了', () => {
    expect(
      unusableCapabilityDefaults({ image_gen: 'cogview-4' }, info, catalog),
    ).toEqual([]);
  });

  it('⚠️ 放行不是「一律不报」：两处都不在的 id 照旧要说', () => {
    expect(
      unusableCapabilityDefaults({ image_gen: 'not-anywhere' }, info, catalog),
    ).toHaveLength(1);
    // asr 的目录面 id：voice 面没有云端腿 ⇒ 仍然用不了。
    expect(
      unusableCapabilityDefaults({ asr: 'whisper-base' }, info, catalog),
    ).toHaveLength(1);
  });

  it('不传目录面 ⇒ 回到旧口径（image_gen 的云 id 会被报 —— 调用方必须传）', () => {
    expect(
      unusableCapabilityDefaults({ image_gen: 'cogview-4' }, info),
    ).toHaveLength(1);
  });
});
