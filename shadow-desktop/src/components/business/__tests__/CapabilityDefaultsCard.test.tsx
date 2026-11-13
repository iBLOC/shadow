import { describe, it, expect, vi, afterEach } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { CapabilityDefaultsCard } from '../CapabilityDefaultsCard';
import { telencephalonClient, type CapabilityDefaultsView, type ModelProvider } from '../../../lib/telencephalonClient';
import { CAPABILITY_DEFAULTS_STORAGE_KEY } from '../../../lib/capabilityDefaults';

// ⚠️ stub 还原纪律（与仓库其它 vitest 同一条）：不还原会泄漏给同 worker
// 的后续文件 ⇒ 失败长得像成功。
afterEach(() => {
  vi.restoreAllMocks();
  globalThis.localStorage?.removeItem(CAPABILITY_DEFAULTS_STORAGE_KEY);
});

// ⚠️ 全局 setup 把 `react-i18next` 的 `t` 做成**键透传** ⇒ 断言里用的是键名。

const NINE_CAPS = ['llm', 'asr', 'tts', 'vad', 'rerank', 'embedding', 'vision', 'forecast', 'image_gen'];

function defaultsView(defaults: Record<string, string> = {}): CapabilityDefaultsView {
  return {
    defaults,
    capabilities: NINE_CAPS,
    engine_resolved: ['asr', 'tts', 'image_gen'],
    registered: { asr: [], tts: [], image_gen: [] },
  };
}

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
      capabilities: ['chat', 'tools'],
      supports_vision: false,
      supports_function_calling: true,
    },
  ],
};

const builtinProvider: ModelProvider = {
  id: 'builtin-neuron',
  name: 'builtin-neuron',
  provider_type: 'builtin',
  api_base: 'http://127.0.0.1:60080',
  models: [
    {
      id: 'minicpm5-1b',
      name: 'minicpm5-1b',
      model_id: 'minicpm5-1b',
      is_default: false,
      capabilities: ['llm'],
      supports_vision: false,
      supports_function_calling: false,
    },
  ],
};

function mockBackend(opts: { defaults?: Record<string, string> } = {}) {
  vi.spyOn(telencephalonClient, 'getCapabilityDefaults').mockResolvedValue(defaultsView(opts.defaults));
  vi.spyOn(telencephalonClient, 'listProviders').mockResolvedValue([cloudProvider, builtinProvider]);
}

/** 找「某一档」的 select（卡片每档一行 label + select）。 */
async function findRowSelect(labelKey: string) {
  const label = await screen.findByText(labelKey);
  const row = label.closest('label');
  expect(row).not.toBeNull();
  return row!.querySelector('select') as HTMLSelectElement;
}

// ⚠️ setup 的 t(key, 'default') 返回 **default 串** ⇒ llm 行的标签是
// 卡片里的 CAPABILITY_FALLBACK_LABELS 兜底（'文本模型'），不是键名。
const LLM_ROW_LABEL = '文本模型';

describe('CapabilityDefaultsCard（分档默认卡 · llm 路由真消费面）', () => {
  it('llm 行候选含云模型（chat→llm 别名）＋ 词表没有 chat 行', async () => {
    mockBackend();
    render(<CapabilityDefaultsCard />);

    const llmSelect = await findRowSelect(LLM_ROW_LABEL);
    const values = [...llmSelect.options].map((o) => o.value);
    expect(values).toContain('qwenai-qwen38-max'); // 云模型（capability=chat）进文本模型档
    expect(values).toContain('minicpm5-1b'); // 内置（capability=llm）照旧

    // 9 档各一行 ＝ 9 个 select；chat 桶并掉后不多出第 10 行。
    expect(document.querySelectorAll('select')).toHaveLength(NINE_CAPS.length);
  });

  it('选云模型 ⇒ setCapabilityDefaults 之外还调 setLobeModels（注册＋全局默认；payload 无 api_key）', async () => {
    mockBackend();
    const setLobeModels = vi
      .spyOn(telencephalonClient, 'setLobeModels')
      .mockResolvedValue({
        default_model: 'qwenai-qwen38-max',
        applied: {},
        overrides: {},
        unknown: [],
        registered: 1,
      });
    vi.spyOn(telencephalonClient, 'setCapabilityDefaults').mockResolvedValue(defaultsView());

    render(<CapabilityDefaultsCard />);
    const llmSelect = await findRowSelect(LLM_ROW_LABEL);

    await userEvent.selectOptions(llmSelect, 'qwenai-qwen38-max');

    await waitFor(() => expect(setLobeModels).toHaveBeenCalledTimes(1));
    // ⚠️ 路由键是**上游 id**（model_id='qwen3.8-max'），不是目录复合 id。
    expect(setLobeModels).toHaveBeenCalledWith({
      providers: [
        {
          id: 'qianwenai',
          base_url: 'https://maas.example.com/compatible-mode/v1',
          model: 'qwen3.8-max',
        },
      ],
      default_model: 'qwen3.8-max',
    });
    // ⚠️ key 不出大脑：注册条目不带 api_key 字段。
    const pushed = setLobeModels.mock.calls[0][0];
    expect(JSON.stringify(pushed)).not.toContain('api_key');
    expect(telencephalonClient.setCapabilityDefaults).toHaveBeenCalledTimes(1);
    // 本地副本照常落（先端脑后本地的「本地」半边）。
    expect(globalThis.localStorage.getItem(CAPABILITY_DEFAULTS_STORAGE_KEY)).toContain('qwenai-qwen38-max');
  });

  it('清空（选「未设置」）⇒ setLobeModels default_model: null（回落本地）', async () => {
    mockBackend({ defaults: { llm: 'qwenai-qwen38-max' } });
    const setLobeModels = vi
      .spyOn(telencephalonClient, 'setLobeModels')
      .mockResolvedValue({ default_model: null, applied: {}, overrides: {}, unknown: [], registered: 0 });
    vi.spyOn(telencephalonClient, 'setCapabilityDefaults').mockResolvedValue(defaultsView());

    render(<CapabilityDefaultsCard />);
    const llmSelect = await findRowSelect(LLM_ROW_LABEL);
    expect(llmSelect).toHaveValue('qwenai-qwen38-max');

    await userEvent.selectOptions(llmSelect, '');

    await waitFor(() => expect(setLobeModels).toHaveBeenCalledTimes(1));
    expect(setLobeModels).toHaveBeenCalledWith({ providers: [], default_model: null });
  });

  it('选内置模型（builtin-neuron）⇒ 不动路由（只写分档默认）', async () => {
    mockBackend();
    const setLobeModels = vi.spyOn(telencephalonClient, 'setLobeModels');
    vi.spyOn(telencephalonClient, 'setCapabilityDefaults').mockResolvedValue(defaultsView());

    render(<CapabilityDefaultsCard />);
    const llmSelect = await findRowSelect(LLM_ROW_LABEL);

    await userEvent.selectOptions(llmSelect, 'minicpm5-1b');

    await waitFor(() => expect(telencephalonClient.setCapabilityDefaults).toHaveBeenCalledTimes(1));
    expect(setLobeModels).not.toHaveBeenCalled();
  });

  it('setLobeModels 拒绝 ⇒ 说真话报错，本地副本不落（先端脑后本地）', async () => {
    mockBackend();
    vi.spyOn(telencephalonClient, 'setLobeModels').mockRejectedValue(new Error('boom: neuron 503'));
    vi.spyOn(telencephalonClient, 'setCapabilityDefaults').mockResolvedValue(defaultsView());

    render(<CapabilityDefaultsCard />);
    const llmSelect = await findRowSelect(LLM_ROW_LABEL);

    await userEvent.selectOptions(llmSelect, 'qwenai-qwen38-max');

    expect(await screen.findByText(/capabilityDefaults\.failed/)).toBeInTheDocument();
    expect(globalThis.localStorage.getItem(CAPABILITY_DEFAULTS_STORAGE_KEY)).toBeNull();
  });
});
