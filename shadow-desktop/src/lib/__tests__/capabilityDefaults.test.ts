/**
 * 分档候选面 —— **两套命名空间的并集**（本地注册表 ＋ 云供应商目录）。
 *
 * ⚠️ 哪几档要并：端脑的分流是「解析出的 id 先查**云供应商模型表** ⇒ 命中
 * 就代理云端；否则才进本地引擎注册表」⇒ ⇒ 目录面里标了那一档的云模型 id
 * **真的能用**：
 * · `image_gen`：`api/images.rs` 一直有云腿；
 * · `asr` / `tts`：`api/voice.rs` 2026-11-14 起补上同一形状的云腿
 *   （小米 MiMo 的 `mimo-2.5-tts` / `mimo-2.5-asr` 就是从这里进的分档卡）。
 *
 * ⚠️ **但内置 neuron 目录的本地 id 不并**（asr/tts 档）：那是另一套命名
 * 空间（`whisper-base` 要**注册**了才能用）⇒ ⇒ 并进来就是「存得进去、
 * 用不了」（2026-11-09 实测根因——别让它回来）。
 *
 * ⚠️ 与移动端 `brain_model_source_provider.dart` 的 `catalogResolvedTiers`
 * ＋ `cloudOnlyUnionTiers` 是同一条判据的两份实现 —— 这两份**必须同一
 * 口径**（本文件钉桌面这份）。
 */
import { describe, expect, it } from 'vitest';

import {
  CATALOG_RESOLVED_TIERS,
  CLOUD_ONLY_UNION_TIERS,
  capabilityCandidatesByCapability,
  capabilityOptionsByCapability,
  unusableCapabilityDefaults,
  type CatalogProviderEntry,
  type CapabilityModelCandidate,
  type EngineResolvedInfo,
} from '../capabilityDefaults';

const catalog: Record<string, CapabilityModelCandidate[]> = {
  image_gen: [
    { id: 'moss-image', label: 'Candle · MOSS', cloud: false },
    { id: 'cogview-4', label: 'Zhipu · CogView-4', cloud: true },
  ],
  asr: [
    { id: 'whisper-base', label: '本地 neuron（内置） · whisper-base', cloud: false },
    { id: 'mimo-2.5-asr', label: 'Xiaomi MiMo · mimo-2.5-asr', cloud: true },
  ],
  tts: [
    { id: 'voxcpm2', label: '本地 neuron（内置） · voxcpm2', cloud: false },
    { id: 'mimo-2.5-tts', label: 'Xiaomi MiMo · mimo-2.5-tts', cloud: true },
  ],
};

describe('capabilityCandidatesByCapability —— 云/本地分家', () => {
  it('内置 neuron 目录 ⇒ cloud:false；云供应商 ⇒ cloud:true', () => {
    const providers: CatalogProviderEntry[] = [
      {
        name: '本地 neuron（内置）',
        provider_type: 'neuron',
        models: [{ id: 'whisper-base', capability: 'asr' }],
      },
      {
        name: 'Xiaomi MiMo',
        provider_type: 'openai_compatible',
        models: [
          { id: 'mimo-2.5-tts', capability: 'tts' },
          { id: 'mimo-2.5-asr', capability: 'asr' },
        ],
      },
    ];
    const out = capabilityCandidatesByCapability(providers);
    expect(out.asr?.map((c) => [c.id, c.cloud])).toEqual([
      ['whisper-base', false],
      ['mimo-2.5-asr', true],
    ]);
    expect(out.tts?.map((c) => [c.id, c.cloud])).toEqual([['mimo-2.5-tts', true]]);
  });
});

describe('capabilityOptionsByCapability —— 已注册面 ∪ 目录面（三档）', () => {
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

  it('asr/tts：只并**云供应商**的 id（小米 MiMo），内置目录的本地 id 不并', () => {
    const info: EngineResolvedInfo = {
      engineResolved: ['asr', 'tts'],
      registered: { asr: ['whisper-model'], tts: [] },
    };
    const out = capabilityOptionsByCapability(catalog, info);
    // whisper-model（已注册面）在前；目录面里只有云的 mimo-2.5-asr 补进来，
    // 内置的 whisper-base **不许**回来（那是「选了必然失败」的另一族）。
    expect(out.asr.map((o) => o.id)).toEqual(['whisper-model', 'mimo-2.5-asr']);
    // 本地一个都没注册 ⇒ 目录面里云的 MiMo 就是全部候选。
    expect(out.tts.map((o) => o.id)).toEqual(['mimo-2.5-tts']);
  });

  it('放行名单是三档（asr/tts/image_gen —— 改名单要连移动端一起改）', () => {
    expect([...CATALOG_RESOLVED_TIERS].sort()).toEqual(['asr', 'image_gen', 'tts']);
    // 其中只收云条目的两档（image_gen 维持整档并的原状）。
    expect([...CLOUD_ONLY_UNION_TIERS].sort()).toEqual(['asr', 'tts']);
  });
});

describe('unusableCapabilityDefaults —— 别把「能用」报成「用不了」', () => {
  const info: EngineResolvedInfo = {
    engineResolved: ['asr', 'tts', 'image_gen'],
    registered: { asr: ['whisper-model'], tts: [], image_gen: [] },
  };

  it('云模型 id（在目录面里）⇒ 不算用不了（三档同理）', () => {
    expect(
      unusableCapabilityDefaults(
        { image_gen: 'cogview-4', asr: 'mimo-2.5-asr', tts: 'mimo-2.5-tts' },
        info,
        catalog,
      ),
    ).toEqual([]);
  });

  it('⚠️ 内置目录的本地 id（asr/tts）照旧要报（端脑解析不到）', () => {
    const flagged = unusableCapabilityDefaults(
      { asr: 'whisper-base', tts: 'voxcpm2' },
      info,
      catalog,
    );
    expect(flagged.map((f) => f.modelId).sort()).toEqual(['voxcpm2', 'whisper-base']);
  });

  it('⚠️ 放行不是「一律不报」：两处都不在的 id 照旧要说', () => {
    expect(
      unusableCapabilityDefaults({ image_gen: 'not-anywhere' }, info, catalog),
    ).toHaveLength(1);
    expect(
      unusableCapabilityDefaults({ tts: 'gone-model' }, info, catalog),
    ).toHaveLength(1);
  });

  it('不传目录面 ⇒ 回到旧口径（目录面的云 id 会被报 —— 调用方必须传）', () => {
    expect(
      unusableCapabilityDefaults({ image_gen: 'cogview-4' }, info),
    ).toHaveLength(1);
    expect(
      unusableCapabilityDefaults({ tts: 'mimo-2.5-tts' }, info),
    ).toHaveLength(1);
  });
});
