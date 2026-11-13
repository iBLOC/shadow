import { describe, it, expect, vi, afterEach, beforeEach } from 'vitest';
import { render, screen, waitFor, fireEvent } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { ProvidersPage } from '../ProvidersPage';
import { telencephalonClient } from '../../lib/telencephalonClient';

// ⚠️ 这个页面走 Tauri 命令（`provider_list` / `provider_presets`），而
// **模型类型**的写入走 telencephalonClient（同一张脑面，admin 门）。
vi.mock('@tauri-apps/api/core', () => ({ invoke: vi.fn() }));

// eslint-disable-next-line @typescript-eslint/no-explicit-any
const { invoke } = (await import('@tauri-apps/api/core')) as any;

// ⚠️ stub 还原纪律：不还原会泄漏给同 worker 的后续文件。
afterEach(() => {
  vi.restoreAllMocks();
  invoke.mockReset();
});

function providerEntry(overrides: Partial<Record<string, unknown>> = {}) {
  return {
    id: 'qianwenai',
    name: 'Qwen AI',
    base_url: 'https://maas.example.com/v1',
    api_standard: 'openai',
    enabled: true,
    builtin: false,
    models: [
      {
        id: 'qwen-audio-3.1-realtime-flash',
        display_name: 'qwen-audio',
        capability: 'asr',
        capability_source: 'catalog',
        available: true,
      },
      {
        id: 'kimi-k3.1-pro',
        display_name: 'kimi',
        capability: 'llm',
        capability_source: 'inferred',
        available: true,
      },
      {
        id: 'my-custom-model',
        display_name: 'my-custom',
        capability: 'embedding',
        capability_source: 'user',
        available: true,
      },
    ],
    ...overrides,
  };
}

function mockBackend(list: unknown[], opts: { putRejects?: Error } = {}) {
  invoke.mockImplementation((cmd: string) => {
    if (cmd === 'provider_presets') return Promise.resolve([]);
    if (cmd === 'provider_list') return Promise.resolve(list);
    return Promise.resolve(null);
  });
  vi.spyOn(telencephalonClient, 'listCapabilityOverrides').mockResolvedValue({
    overrides: { 'my-custom-model': 'embedding' },
    capabilities: ['llm', 'asr', 'tts', 'vad', 'rerank', 'embedding', 'vision', 'forecast', 'image_gen'],
  });
  const put = vi.spyOn(telencephalonClient, 'putCapabilityOverrides');
  if (opts.putRejects) put.mockRejectedValue(opts.putRejects);
  else put.mockResolvedValue({ overrides: {}, capabilities: [] });
  return put;
}

async function openTypeBlock() {
  const details = await screen.findByTestId('model-types-qianwenai');
  // <details> 默认收起 ⇒ 打开它（jsdom 里 open 属性即可让子节点可见）。
  (details as HTMLDetailsElement).open = true;
  return details;
}

describe('ProvidersPage（模型类型）', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('每个模型一行：来源徽章按 capability_source 显示（自定义/清单/推断）', async () => {
    mockBackend([providerEntry()]);
    render(<ProvidersPage />);
    await openTypeBlock();

    expect(screen.getByTestId('model-type-row-my-custom-model')).toBeInTheDocument();
    expect(
      screen.getByText('providers.modelType.source_user'),
    ).toBeInTheDocument();
    expect(
      screen.getByText('providers.modelType.source_catalog'),
    ).toBeInTheDocument();
    expect(
      screen.getByText('providers.modelType.source_inferred'),
    ).toBeInTheDocument();
  });

  it('只有 user 来源的那行进「已覆盖」形态（select 有值），其余显示「自动」', async () => {
    mockBackend([providerEntry()]);
    render(<ProvidersPage />);
    await openTypeBlock();

    const row = screen.getByTestId('model-type-row-my-custom-model');
    const select = row.querySelector('select') as HTMLSelectElement;
    expect(select.value).toBe('embedding');

    const inferredRow = screen.getByTestId('model-type-row-kimi-k3.1-pro');
    const inferredSelect = inferredRow.querySelector('select') as HTMLSelectElement;
    expect(inferredSelect.value).toBe('');
  });

  it('改类型 ⇒ PUT { modelId: "asr" } 并重读列表', async () => {
    const put = mockBackend([providerEntry()]);
    render(<ProvidersPage />);
    await openTypeBlock();

    const row = screen.getByTestId('model-type-row-kimi-k3.1-pro');
    const select = row.querySelector('select') as HTMLSelectElement;
    await userEvent.selectOptions(select, 'asr');

    await waitFor(() => expect(put).toHaveBeenCalledTimes(1));
    expect(put).toHaveBeenCalledWith({ 'kimi-k3.1-pro': 'asr' });
  });

  it('选「自动」⇒ PUT { modelId: null }（清掉覆盖）', async () => {
    const put = mockBackend([providerEntry()]);
    render(<ProvidersPage />);
    await openTypeBlock();

    const row = screen.getByTestId('model-type-row-my-custom-model');
    const select = row.querySelector('select') as HTMLSelectElement;
    await userEvent.selectOptions(select, '');

    await waitFor(() => expect(put).toHaveBeenCalledTimes(1));
    expect(put).toHaveBeenCalledWith({ 'my-custom-model': null });
  });

  it('写入失败 ⇒ 把端脑原话显示出来（不许静默）', async () => {
    mockBackend([providerEntry()], {
      putRejects: new Error('telencephalon 400: unknown capability word(s): foo'),
    });
    render(<ProvidersPage />);
    await openTypeBlock();

    const row = screen.getByTestId('model-type-row-kimi-k3.1-pro');
    const select = row.querySelector('select') as HTMLSelectElement;
    // userEvent 会因 select 值回弹而报错；用 fireEvent 直接触发 change。
    fireEvent.change(select, { target: { value: 'asr' } });

    await waitFor(() =>
      expect(
        screen.getByText(/unknown capability word/),
      ).toBeInTheDocument(),
    );
  });

  it('内置条目**不显示**模型类型区（能力来自 neuron 目录，不归用户改）', async () => {
    mockBackend([
      providerEntry({
        id: 'builtin-neuron',
        builtin: true,
        models: [
          {
            id: 'moss-image',
            display_name: 'moss-image',
            capability: 'image_gen',
            capability_source: 'upstream',
            available: false,
          },
        ],
      }),
    ]);
    render(<ProvidersPage />);

    // 内置条目的模型下拉（neuron 目录）会渲染出来，但**类型区**不许有。
    await screen.findByText('moss-image', { exact: false });
    expect(screen.queryByTestId('model-types-builtin-neuron')).toBeNull();
  });
});
