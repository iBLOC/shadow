/**
 * 「叶区 × 类型」矩阵卡 —— 两条写路径各归各的面。
 *
 * 判据：
 * - **引擎档（asr / tts / image_gen）** ⇒ `setCapabilityDefaults(defaults,
 *   lobe_defaults)`（分档面），整份合并、只装显式覆盖；
 * - **llm** ⇒ `setLobeModels({providers: [], lobe_models})`（路由面，三态：
 *   跟随全局＝不进表、强制本地＝null、串＝该模型）；
 * - 两张表都从**当前覆盖表**合并 ⇒ 不抹掉别处写的叶区。
 *
 * ⚠️ 全局 setup 把 `t` 做成「键透传」⇒ 断言里用键名；但 `t(key, default)`
 * 返回的是 default 串（与 CapabilityDefaultsCard 的测试同一口径）。
 */

import { describe, it, expect, vi, afterEach } from 'vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { LobeModelMatrixCard } from '../LobeModelMatrixCard';
import {
  telencephalonClient,
  type CapabilityDefaultsView,
  type LobeManifestSummary,
  type LobeRoutingView,
  type ModelProvider,
} from '../../../lib/telencephalonClient';

afterEach(() => {
  vi.restoreAllMocks();
  // ⚠️ 卡片会把逐叶区覆盖写进 localStorage（大脑重启后重下发的副本）⇒ ⇒
  // 不清会在用例之间串状态 ⇒ ⇒ 后一条用例的「重下发」路径被意外触发
  // （失败长得像成功的镜像：**前一条的状态长得像这一条的输入**）。
  globalThis.localStorage?.clear();
});

const lobes: LobeManifestSummary[] = [
  { name: 'parietal', description: 'Sensory integration' },
  { name: 'temporal', description: 'Conversation / chat' },
];

const capsView: CapabilityDefaultsView = {
  defaults: { asr: 'global-asr', tts: '' },
  lobe_defaults: {},
  capabilities: ['llm', 'asr', 'tts', 'image_gen', 'embedding'],
  engine_resolved: ['asr', 'tts', 'image_gen'],
  registered: { asr: ['whisper-model'], tts: [], image_gen: [] },
};

const cloudProvider: ModelProvider = {
  id: 'qianwenai',
  name: 'Qwen AI MaaS',
  provider_type: 'openai_compatible',
  api_base: 'https://maas.example.com/compatible-mode/v1',
  models: [
    {
      id: 'qwenai-qwen38-max',
      name: 'qwen3.8-max',
      model_id: 'qwen3.8-max',
      is_default: true,
      // ⚠️ 端脑读面已把上游的 `chat` 归一到 `llm`（`normalize_word`）⇒ 客户端
      // 拿到的是词表内的词 ⇒ 矩阵卡不再自己合并 chat 桶（与 㔢 同一决定）。
      capabilities: ['llm'],
      supports_vision: false,
      supports_function_calling: true,
    },
  ],
};

const routing: LobeRoutingView = {
  default_model: null,
  lobe_models: {},
  lobe_capability_models: {},
};

function mockBackend(over: Partial<{
  routing: LobeRoutingView;
  caps: CapabilityDefaultsView;
}> = {}) {
  vi.spyOn(telencephalonClient, 'getLobeManifests').mockResolvedValue(lobes);
  vi.spyOn(telencephalonClient, 'getLobeRouting').mockResolvedValue(
    over.routing ?? routing,
  );
  vi.spyOn(telencephalonClient, 'getCapabilityDefaults').mockResolvedValue(
    over.caps ?? capsView,
  );
  vi.spyOn(telencephalonClient, 'listProviders').mockResolvedValue([cloudProvider]);
}

/** 取某叶区某档那一行的 select（label 里既有叶区名也有档名）。 */
async function selectOf(lobe: string, tierLabel: string): Promise<HTMLSelectElement> {
  const section = (await screen.findByText(lobe)).closest('section');
  expect(section).not.toBeNull();
  const label = [...section!.querySelectorAll('label')].find((l) =>
    (l.textContent ?? '').includes(tierLabel),
  );
  expect(label).toBeTruthy();
  return label!.querySelector('select') as HTMLSelectElement;
}

describe('LobeModelMatrixCard（叶区 × 类型）', () => {
  it('每个叶区各档一行；「跟随全局」显示全局那一档的当前值', async () => {
    mockBackend();
    render(<LobeModelMatrixCard />);

    await screen.findByText('parietal');
    // llm 的兜底标签是中文串（t(key, default) 返回 default）。
    const llmSel = await selectOf('parietal', '文本模型');
    expect(llmSel.value).toBe(''); // 跟随全局
    const first = [...llmSel.options][0];
    expect(first.textContent).toContain('lobeModelMatrix.followGlobalLocal');

    // asr 档：全局**有值** ⇒ 跟随全局那一项是「带值」那一条文案
    // （测试里 `t` 是键透传 ⇒ 认键名；真界面上它渲染成「跟随全局（global-asr）」）。
    const asrSel = await selectOf('parietal', 'asr');
    expect([...asrSel.options][0].textContent).toContain(
      'lobeModelMatrix.followGlobalWith',
    );
    // tts 档：全局没配 ⇒ 另一条文案（本地 / 第一个可用）。
    const ttsSel = await selectOf('parietal', 'tts');
    expect([...ttsSel.options][0].textContent).toContain(
      'lobeModelMatrix.followGlobalLocal',
    );
    // 候选来自**已注册面**。
    expect([...asrSel.options].map((o) => o.value)).toContain('whisper-model');
  });

  it('选引擎档 ⇒ setCapabilityDefaults(defaults, lobe_defaults)，不碰路由面', async () => {
    mockBackend();
    const setCaps = vi
      .spyOn(telencephalonClient, 'setCapabilityDefaults')
      .mockResolvedValue({ ...capsView, lobe_defaults: {} });
    const setLobe = vi.spyOn(telencephalonClient, 'setLobeModels');
    render(<LobeModelMatrixCard />);

    const asrSel = await selectOf('parietal', 'asr');
    await userEvent.selectOptions(asrSel, 'whisper-model');

    expect(setCaps).toHaveBeenCalledTimes(1);
    const [defaults, lobeDefaults] = setCaps.mock.calls[0];
    expect(defaults).toEqual({ asr: 'global-asr', tts: '' });
    expect(lobeDefaults).toEqual({ parietal: { asr: 'whisper-model' } });
    // ⚠️ 引擎档不进路由面（那一面没有这个字段 ⇒ 会被静默丢掉）。
    expect(setLobe).not.toHaveBeenCalled();
  });

  it('⚠️ 合并写回：别的叶区已有的覆盖不许被抹掉', async () => {
    mockBackend({
      caps: {
        ...capsView,
        lobe_defaults: { temporal: { tts: 'voxcpm2' } },
      },
    });
    const setCaps = vi
      .spyOn(telencephalonClient, 'setCapabilityDefaults')
      .mockResolvedValue({ ...capsView, lobe_defaults: {} });
    render(<LobeModelMatrixCard />);

    // 先让卡片读到「temporal 有覆盖」的视图（getCapabilityDefaults 已被
    // mock 成这份）⇒ 改 parietal 的 asr ⇒ 下发里 temporal 那条还在。
    const asrSel = await selectOf('parietal', 'asr');
    await userEvent.selectOptions(asrSel, 'whisper-model');

    expect(setCaps.mock.calls[0][1]).toEqual({
      temporal: { tts: 'voxcpm2' },
      parietal: { asr: 'whisper-model' },
    });
  });

  it('选「跟随全局」⇒ 那一格从覆盖表里删掉（不是存成空串）', async () => {
    mockBackend({
      caps: {
        ...capsView,
        lobe_defaults: { temporal: { tts: 'voxcpm2', asr: 'whisper-model' } },
      },
    });
    const setCaps = vi
      .spyOn(telencephalonClient, 'setCapabilityDefaults')
      .mockResolvedValue({ ...capsView, lobe_defaults: {} });
    render(<LobeModelMatrixCard />);

    const asrSel = await selectOf('temporal', 'asr');
    expect(asrSel.value).toBe('whisper-model');
    await userEvent.selectOptions(asrSel, '');

    expect(setCaps.mock.calls[0][1]).toEqual({ temporal: { tts: 'voxcpm2' } });
  });

  it('llm：选云模型 ⇒ setLobeModels({providers: [], lobe_models})，不带 default_model', async () => {
    mockBackend();
    const setLobe = vi
      .spyOn(telencephalonClient, 'setLobeModels')
      .mockResolvedValue({
        default_model: null,
        applied: {},
        overrides: { parietal: 'qwenai-qwen38-max' },
        unknown: [],
        registered: 0,
      });
    const setCaps = vi.spyOn(telencephalonClient, 'setCapabilityDefaults');
    render(<LobeModelMatrixCard />);

    const llmSel = await selectOf('parietal', '文本模型');
    // 云模型（capability=chat）必须出现在文本档的候选里（chat→llm 别名）。
    expect([...llmSel.options].map((o) => o.value)).toContain('qwenai-qwen38-max');
    await userEvent.selectOptions(llmSel, 'qwenai-qwen38-max');

    expect(setLobe).toHaveBeenCalledTimes(1);
    const req = setLobe.mock.calls[0][0];
    expect(req.providers).toEqual([]);
    expect(req.lobe_models).toEqual({ parietal: 'qwenai-qwen38-max' });
    // ⚠️ 不给 default_model ⇒ 端脑不动全局默认（三态：字段不出现＝不动）。
    expect('default_model' in req).toBe(false);
    expect(setCaps).not.toHaveBeenCalled();
  });

  it('llm：强制本地 ⇒ lobe_models 里是 null；跟随全局 ⇒ 删掉这个键', async () => {
    mockBackend({
      routing: { ...routing, lobe_models: { parietal: 'qwenai-qwen38-max' } },
    });
    const setLobe = vi
      .spyOn(telencephalonClient, 'setLobeModels')
      .mockResolvedValue({
        default_model: null,
        applied: {},
        overrides: {},
        unknown: [],
        registered: 0,
      });
    render(<LobeModelMatrixCard />);

    const llmSel = await selectOf('parietal', '文本模型');
    expect(llmSel.value).toBe('qwenai-qwen38-max');

    await userEvent.selectOptions(llmSel, '__local__');
    expect(setLobe.mock.calls[0][0].lobe_models).toEqual({ parietal: null });

    // 下一次写（跟随全局）⇒ 键被删掉，整份表变空。
    await userEvent.selectOptions(llmSel, '');
    expect(setLobe.mock.calls[1][0].lobe_models).toEqual({});
  });

  it('读不到叶区清单 ⇒ 说真话，不画成「没有叶区」', async () => {
    mockBackend();
    const spy = vi
      .spyOn(telencephalonClient, 'getLobeManifests')
      .mockRejectedValue(new Error('lobes unreachable'));
    render(<LobeModelMatrixCard />);

    // ⚠️ **必须核 spy 真被调用过** —— 只断言界面文案的话，替身生不生效都
    // 看不出来（闸 R5「替身空转」抓的就是这种恒绿用例）。
    expect(spy).toHaveBeenCalledTimes(1);
    expect(await screen.findByText(/lobes unreachable/)).toBeTruthy();
    expect(screen.queryByText('lobeModelMatrix.empty')).toBeNull();
  });
});
