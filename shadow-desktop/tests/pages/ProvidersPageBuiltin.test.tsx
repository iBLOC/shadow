import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { ProvidersPage } from '../../src/pages/ProvidersPage';

// ⚠️⚠️ 内置供应商（neuron）—— 大脑自带的那个**本地模型**供应商。
//
// ⚠️ 它在注册表里**只读**（读视图里合成，不在存储里）⇒ ⇒ 界面**不能**给
// 「启停 / 编辑 / 删除」—— 那些动作写不进去 ⇒ ⇒ 按下去只会拿到 400 ⇒ ⇒
// 界面给一个必然失败的按钮 = 把「大脑拒了」包装成「界面坏了」。
//
// ⚠️⚠️ **但「选中哪个本地模型」是允许写的**（用户拍板 2026-11-03）⇒ ⇒
// ⇒ ⇒ 那一条**要能选** ⇒ ⇒ 而**没下载的不能选**（选了也跑不起来 ⇒ ⇒
// ⇒ ⇒ 大脑那边会拒 400 ⇒ ⇒ 界面不该给一个必然失败的选择）。

const invokeMock = vi.fn();

vi.mock('@tauri-apps/api/core', () => ({
  invoke: (...args: unknown[]) => invokeMock(...args),
}));

vi.mock('react-i18next', () => ({
  useTranslation: () => ({
    t: (key: string) => key,
  }),
}));

const PRESETS = [
  {
    id: 'openai',
    name: 'OpenAI',
    base_url: 'https://api.openai.com/v1',
    api_standard: 'openai',
    default_model: 'gpt-4o',
    requires_key: true,
  },
];

// ⚠️ 内置条目的模型 ＝ neuron's **目录**（与 /v1/models 同一真相源）
// ⇒ ⇒ 横跨**七种能力** ⇒ ⇒ 且含「目录里有、但还没下载」的。
const builtinEntry = {
  id: 'builtin-neuron',
  name: '本地 neuron（内置）',
  base_url: 'http://127.0.0.1:60080/v1',
  api_standard: 'openai',
  enabled: true,
  builtin: true,
  selected_model: 'qwen3-0.6b',
  models: [
    { id: 'qwen3-0.6b', display_name: 'qwen3-0.6b', capability: 'llm', available: true },
    { id: 'whisper-base', display_name: 'whisper-base', capability: 'asr', available: true },
    {
      id: 'not-downloaded-yet',
      display_name: 'not-downloaded-yet',
      capability: 'llm',
      available: false,
    },
  ],
};

const normalEntry = {
  id: 'p1',
  name: 'OpenAI',
  preset_id: 'openai',
  base_url: 'https://api.openai.com/v1',
  api_standard: 'openai',
  enabled: true,
  models: [{ id: 'gpt-4o' }],
};

/** 卡片根节点（从标题往上找带 rounded-lg 的那层）。 */
function cardOf(name: string): HTMLElement {
  const heading = screen.getByRole('heading', { name });
  const card = heading.closest('div.rounded-lg');
  expect(card).not.toBeNull();
  return card as HTMLElement;
}

describe('ProvidersPage built-in provider card', () => {
  beforeEach(() => {
    invokeMock.mockReset();
    invokeMock.mockImplementation((cmd: string) => {
      switch (cmd) {
        case 'provider_presets':
          return Promise.resolve(PRESETS);
        case 'provider_list':
          return Promise.resolve([builtinEntry, normalEntry]);
        default:
          return Promise.resolve([]);
      }
    });
  });

  it('marks the built-in provider with a badge', async () => {
    render(<ProvidersPage />);
    await screen.findByRole('heading', { name: '本地 neuron（内置）' });
    expect(screen.getByText('providers.builtinBadge')).toBeInTheDocument();
  });

  it('offers no edit / delete / toggle on the built-in card', async () => {
    render(<ProvidersPage />);
    await screen.findByRole('heading', { name: '本地 neuron（内置）' });
    const card = cardOf('本地 neuron（内置）');
    expect(within(card).queryByText('common.edit')).toBeNull();
    expect(within(card).queryByText('common.delete')).toBeNull();
    // ⚠️ 只剩一个按钮（「刷新模型」）⇒ ⇒ 启停开关也没有了。
    expect(within(card).getAllByRole('button')).toHaveLength(1);
  });

  // ⚠️⚠️ **统一清单**：内置条目的模型 ＝ neuron's **目录** ⇒ ⇒ 每一条都带
  // ⇒ ⇒ **能力** ⇒ ⇒ 而「还没下载」的**不许选**（选了也跑不起来）。
  it('lists the whole catalog with capabilities and disables what is not downloaded', async () => {
    render(<ProvidersPage />);
    await screen.findByRole('heading', { name: '本地 neuron（内置）' });
    const card = cardOf('本地 neuron（内置）');
    const select = within(card).getByRole('combobox') as HTMLSelectElement;
    const options = Array.from(select.querySelectorAll('option'));
    const labels = options.map((o) => o.textContent);

    expect(labels).toContain('llm · qwen3-0.6b');
    expect(labels).toContain('asr · whisper-base');
    // ⚠️ 没下载的那条**要点出来**（否则用户以为它能跑）。
    expect(
      labels.some((l) => l?.includes('not-downloaded-yet') && l.includes('providers.modelNotDownloaded')),
      true,
    );
    // ⚠️ 没下载的**不许选**。
    const notDownloaded = options.find((o) => o.textContent?.includes('not-downloaded-yet'));
    expect(notDownloaded?.disabled).toBe(true);
    // ⚠️ 已下载的**可以选**（正控：证明上一条不是「全都禁用了」）。
    const downloaded = options.find((o) => o.textContent?.includes('qwen3-0.6b'));
    expect(downloaded?.disabled).toBe(false);
  });

  it('asks the brain to remember the chosen local model', async () => {
    render(<ProvidersPage />);
    await screen.findByRole('heading', { name: '本地 neuron（内置）' });
    const card = cardOf('本地 neuron（内置）');
    const select = within(card).getByRole('combobox') as HTMLSelectElement;

    await userEvent.selectOptions(select, 'whisper-base');

    expect(invokeMock).toHaveBeenCalledWith('provider_select_model', {
      id: 'builtin-neuron',
      modelId: 'whisper-base',
    });
  });

  it('keeps every action on a normal provider card (positive control)', async () => {
    render(<ProvidersPage />);
    await screen.findByRole('heading', { name: 'OpenAI' });
    const card = cardOf('OpenAI');
    expect(within(card).getByText('common.edit')).toBeInTheDocument();
    expect(within(card).getByText('common.delete')).toBeInTheDocument();
    expect(card.querySelector('select')).not.toBeNull();
    // 启停开关 + 刷新 + **导出到外部工具** + 编辑 + 删除。
    // ⚠️ 「导出」是 ae76841（外部工具接线）加进来的 ⇒ ⇒ 这条正对照测试的计数
    //    从 4 变 5 ⇒ ⇒ **数得对，但要说清多出来的是哪一个**（否则下一个人不知道）。
    expect(within(card).getAllByRole('button')).toHaveLength(5);
  });
});
