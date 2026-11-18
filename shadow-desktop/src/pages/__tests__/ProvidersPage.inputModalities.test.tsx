import { describe, it, expect, vi, afterEach } from 'vitest';
import { fireEvent, render, screen } from '@testing-library/react';
import { ProvidersPage } from '../ProvidersPage';
import { telencephalonClient } from '../../lib/telencephalonClient';

/**
 * ⚠️ **输入模态**（2026-11-16）—— 供应商页那处模型行也要说清「吃什么」
 * ＋「那份模态从哪来」⇒ ⇒ 只给最终值不说来源 ⇒ ⇒ 猜错了没人发现。
 */
vi.mock('@tauri-apps/api/core', () => ({ invoke: vi.fn() }));

// eslint-disable-next-line @typescript-eslint/no-explicit-any
const { invoke } = (await import('@tauri-apps/api/core')) as any;

afterEach(() => {
  vi.restoreAllMocks();
  invoke.mockReset();
});

function providerEntry(models: unknown[]) {
  return {
    id: 'qianwenai',
    name: 'Qwen AI MaaS',
    base_url: 'https://maas.example.com/compatible-mode/v1',
    api_standard: 'openai',
    enabled: true,
    builtin: false,
    models,
  };
}

function mockBackend(models: unknown[]) {
  invoke.mockImplementation((cmd: string) => {
    if (cmd === 'provider_presets') return Promise.resolve([]);
    if (cmd === 'provider_list') return Promise.resolve([providerEntry(models)]);
    return Promise.resolve(null);
  });
  // ⚠️ **替身不许空转** —— 返回值必须**拿在手里**（R5：装了 spy 却没有办法检查它
  // ⇒ ⇒ 那条用例可能恒绿）⇒ ⇒ 这里把 spy 交回去，用例里断言它**确实被调用**。
  const capSpy = vi.spyOn(telencephalonClient, 'listCapabilityOverrides').mockResolvedValue({
    overrides: {},
    capabilities: ['llm', 'asr', 'tts', 'embedding', 'image_gen'],
  });
  return capSpy;
}

async function openTypeBlock() {
  const details = await screen.findByTestId('model-types-qianwenai');
  (details as HTMLDetailsElement).open = true;
  return details;
}

describe('ProvidersPage（输入模态 ＋ 来源）', () => {
  it('✅ 模型行显示模态，并把来源写进 title', async () => {
    const capSpy = mockBackend([
      {
        id: 'qwen3-vl-plus',
        display_name: 'qwen3-vl-plus',
        capability: 'llm',
        capability_source: 'catalog',
        available: true,
        input_modalities: ['text', 'image', 'video'],
        input_modalities_source: 'catalog',
      },
    ]);
    render(<ProvidersPage />);
    await openTypeBlock();

    const badge = screen.getByText('text / image / video');
    expect(badge).toBeInTheDocument();
    expect(badge.getAttribute('title')).toContain('models.inputModalitiesSource');
    expect(badge.getAttribute('title')).toContain('models.inputModalitiesSourceCatalog');
    // ⚠️ 替身承重：页面**确实**向端脑要了能力词表（不是「装上就算数」）。
    expect(capSpy).toHaveBeenCalled();
  });

  it('✅ 老数据没这个字段 ⇒ 不画模态徽章（不骗人）', async () => {
    const capSpy = mockBackend([
      {
        id: 'qwen3-max',
        display_name: 'qwen3-max',
        capability: 'llm',
        capability_source: 'catalog',
        available: true,
      },
    ]);
    render(<ProvidersPage />);
    await openTypeBlock();

    expect(screen.getByTestId('model-type-row-qwen3-max')).toBeInTheDocument();
    expect(screen.queryByText('text / image / video')).toBeNull();
    expect(capSpy).toHaveBeenCalled();
  });

  /**
   * ⚠️ **预览那一格**（「测试并获取模型」）也要说清「吃什么」＋来源
   * （2026-11-16）—— 这条是**真上游**（OpenRouter）那一轮跑出来的形状：
   * 上游的 `architecture.input_modalities` 归一后是
   * `audio / pdf / image / text / video`（上游的 `file` 要变成 `pdf`），
   * 来源标签是 `upstream`。
   *
   * ⚠️ 走「**不要钥匙**的预设」那条路 ⇒ ⇒ 点了就自动预览（不用等输入框
   * 的防抖）⇒ ⇒ 判据不依赖时间。
   */
  it('✅ 预览那一格也显示模态 ＋ 来源（真上游那份）', async () => {
    invoke.mockImplementation((cmd: string) => {
      if (cmd === 'provider_presets')
        return Promise.resolve([
          {
            id: 'openrouter',
            name: 'OpenRouter',
            base_url: 'https://openrouter.ai/api/v1',
            api_standard: 'openai',
            default_model: null,
            requires_key: false,
          },
        ]);
      if (cmd === 'provider_list') return Promise.resolve([]);
      if (cmd === 'provider_preview_fetch')
        return Promise.resolve([
          {
            id: 'google/gemini-4-hydrogen',
            display_name: 'google/gemini-4-hydrogen',
            capability: 'llm',
            input_modalities: ['audio', 'pdf', 'image', 'text', 'video'],
            input_modalities_source: 'upstream',
          },
        ]);
      return Promise.resolve(null);
    });
    const capSpy = vi.spyOn(telencephalonClient, 'listCapabilityOverrides').mockResolvedValue({
      overrides: {},
      capabilities: ['llm', 'asr', 'tts', 'embedding', 'image_gen'],
    });
    render(<ProvidersPage />);

    fireEvent.click(await screen.findByText('providers.add'));
    fireEvent.click(await screen.findByText('OpenRouter'));

    const badge = await screen.findByText('audio / pdf / image / text / video');
    expect(badge).toBeInTheDocument();
    // ⚠️ 来源标签：真上游 ⇒ ⇒ 说的是「上游真给的」，不是「按文档预设的」。
    expect(badge.getAttribute('title')).toContain('models.inputModalitiesSourceUpstream');
    // ⚠️ 替身承重：页面**确实**要了能力词表 ⇒ ⇒ 这个替身不是空转。
    expect(capSpy).toHaveBeenCalled();
  });
});
