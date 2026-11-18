import { describe, it, expect, vi, afterEach } from 'vitest';
import { render, screen } from '@testing-library/react';
import { ProvidersPage } from '../ProvidersPage';
import { telencephalonClient } from '../../lib/telencephalonClient';

/**
 * ⚠️ **模型清单的来源**（2026-11-16）—— 端脑在「上游压根没有「模型列表」
 * 这个接口」时会顶上**按官方文档预设的清单** ⇒ ⇒ 界面必须说清那份
 * **不是实时拉的** ⇒ ⇒ 否则「失败长得像成功」。
 */
vi.mock('@tauri-apps/api/core', () => ({ invoke: vi.fn() }));

// eslint-disable-next-line @typescript-eslint/no-explicit-any
const { invoke } = (await import('@tauri-apps/api/core')) as any;

afterEach(() => {
  vi.restoreAllMocks();
  invoke.mockReset();
});

function providerEntry(overrides: Record<string, unknown> = {}) {
  return {
    id: 'gemini',
    name: 'Google Gemini',
    base_url: 'https://generativelanguage.googleapis.com/v1beta/openai',
    api_standard: 'openai',
    enabled: true,
    builtin: false,
    models: [{ id: 'gemini-2.5-flash', capability: 'llm', available: true }],
    ...overrides,
  };
}

function mockBackend(list: unknown[]) {
  invoke.mockImplementation((cmd: string) => {
    if (cmd === 'provider_presets') return Promise.resolve([]);
    if (cmd === 'provider_list') return Promise.resolve(list);
    return Promise.resolve(null);
  });
  vi.spyOn(telencephalonClient, 'listCapabilityOverrides').mockResolvedValue({
    overrides: {},
    capabilities: ['llm', 'asr', 'tts', 'embedding', 'image_gen'],
  });
}

describe('ProvidersPage（模型清单的来源）', () => {
  it('⚠️ 清单是「按文档预设」⇒ 界面标出来', async () => {
    mockBackend([providerEntry({ models_source: 'preset' })]);
    render(<ProvidersPage />);

    expect(await screen.findByText('providers.modelsFromDocs')).toBeInTheDocument();
  });

  it('✅ 清单是实时拉的 ⇒ 不标「按文档预设」', async () => {
    mockBackend([providerEntry({ models_source: 'upstream' })]);
    render(<ProvidersPage />);

    expect(await screen.findByText('Google Gemini')).toBeInTheDocument();
    expect(screen.queryByText('providers.modelsFromDocs')).toBeNull();
  });

  it('✅ 老数据没这个字段 ⇒ 不标', async () => {
    mockBackend([providerEntry()]);
    render(<ProvidersPage />);

    expect(await screen.findByText('Google Gemini')).toBeInTheDocument();
    expect(screen.queryByText('providers.modelsFromDocs')).toBeNull();
  });

  /**
   * ⚠️ **上游没列的条目**（2026-11-16）—— 上游的「模型列表」**只列对话模型**
   * （MiniMax 逐字只给两条语言模型 ⇒ ⇒ 出图 MiniMax-H3-Image / 视频
   * MiniMax-H3 / 语音 speech-* **压根不在那个列表里**）⇒ ⇒ 那些条目是
   * **按官方文档补进来的** ⇒ ⇒ 界面**必须**标出来 ⇒ ⇒ 否则「来源标签说谎」。
   */
  it('⚠️ 有条目是「按文档补的」⇒ 逐条标出来 ＋ 列表级说清有几条', async () => {
    mockBackend([
      providerEntry({
        models_source: 'upstream',
        models: [
          {
            id: 'MiniMax-M3.1-Flash',
            capability: 'llm',
            model_source: 'upstream',
            available: true,
          },
          {
            id: 'MiniMax-H3-Image',
            capability: 'image_gen',
            model_source: 'preset',
            available: true,
          },
        ],
      }),
    ]);
    render(<ProvidersPage />);

    // ❶ 逐条徽章（按文档补的那条）。
    expect(await screen.findByText('models.entrySourcePreset')).toBeInTheDocument();
    // ❷ 列表级：说清「有几条不是实时拉的」。
    expect(screen.getByText('providers.modelsPartlyFromDocs')).toBeInTheDocument();
  });

  it('✅ 全是上游列的 ⇒ 不标「按文档补的」', async () => {
    mockBackend([
      providerEntry({
        models_source: 'upstream',
        models: [
          {
            id: 'MiniMax-M3.1-Flash',
            capability: 'llm',
            model_source: 'upstream',
            available: true,
          },
        ],
      }),
    ]);
    render(<ProvidersPage />);

    expect(await screen.findByText('Google Gemini')).toBeInTheDocument();
    expect(screen.queryByText('models.entrySourcePreset')).toBeNull();
    expect(screen.queryByText('providers.modelsPartlyFromDocs')).toBeNull();
  });
});
