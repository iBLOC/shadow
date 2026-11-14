import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { FlowsPage } from '../FlowsPage';

// ⚠️ store 用 vi.hoisted 携带（vi.mock 工厂被提升，引用不到普通顶层变量）。
const store = vi.hoisted(() => ({
  flows: [] as Array<{ id: string; name: string; version: string; is_draft: boolean; tags: string[] }>,
  refreshFlows: vi.fn(),
}));

vi.mock('../../stores/telencephalonStore', () => ({
  useTelencephalonStore: (sel: (s: unknown) => unknown) => sel(store),
}));

const runFlow = vi.hoisted(() => vi.fn());

vi.mock('../../lib/telencephalonClient', () => ({
  telencephalonClient: { runFlow },
}));

function flow(overrides: Partial<{ id: string; name: string; version: string; tags: string[] }> = {}) {
  return {
    id: overrides.id ?? 'flow-1',
    name: overrides.name ?? 'daily-brief',
    version: overrides.version ?? '3',
    is_draft: false,
    tags: overrides.tags ?? ['morning'],
  };
}

// ⚠️ 全局 setup 的 t 是键透传 ⇒ 断言里用键名（与仓库测试同一约定）。
beforeEach(() => {
  store.flows = [];
  store.refreshFlows.mockReset();
  runFlow.mockReset();
});

afterEach(() => {
  vi.restoreAllMocks();
});

describe('FlowsPage（思维定式）', () => {
  it('空态：无流程时显示空态（标题＋提示），且挂载即拉取一次刷新', () => {
    render(<FlowsPage />);
    expect(screen.getByText('flows.emptyTitle')).toBeInTheDocument();
    expect(screen.getByText('flows.emptyHint')).toBeInTheDocument();
    expect(screen.queryByRole('table')).not.toBeInTheDocument();
    expect(store.refreshFlows).toHaveBeenCalledTimes(1);
  });

  it('有流程：表格渲染名称/版本/标签，刷新按钮再拉一次', async () => {
    store.flows = [flow()];
    render(<FlowsPage />);

    expect(screen.getByRole('table')).toBeInTheDocument();
    expect(screen.getByText('daily-brief')).toBeInTheDocument();
    expect(screen.getByText('3')).toBeInTheDocument();
    expect(screen.getByText('morning')).toBeInTheDocument();

    await userEvent.click(screen.getByRole('button', { name: 'flows.refresh' }));
    expect(store.refreshFlows).toHaveBeenCalledTimes(2); // 挂载 1 ＋ 手动 1
  });

  it('点运行 ⇒ runFlow 按名字调用并把 outputs 回显出来', async () => {
    store.flows = [flow()];
    runFlow.mockResolvedValue({ outputs: { summary: 'ok-morning' } });
    render(<FlowsPage />);

    await userEvent.click(screen.getByRole('button', { name: 'flows.run' }));

    await waitFor(() => expect(runFlow).toHaveBeenCalledTimes(1));
    expect(runFlow).toHaveBeenCalledWith('daily-brief', { example: 'input' });
    await waitFor(() =>
      expect(screen.getByText(/summary/)).toBeInTheDocument(),
    );
    await waitFor(() =>
      expect(screen.getByText(/ok-morning/)).toBeInTheDocument(),
    );
  });

  it('运行失败 ⇒ 错误原话回显（不静默）', async () => {
    store.flows = [flow()];
    runFlow.mockRejectedValue(new Error('brain offline'));
    render(<FlowsPage />);

    await userEvent.click(screen.getByRole('button', { name: 'flows.run' }));

    await waitFor(() => expect(screen.getByText(/brain offline/)).toBeInTheDocument());
  });
});
