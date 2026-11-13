// @vitest-environment jsdom
/**
 * 「添加 ha-mcp」这一刀的两格牙：
 * ❶ 模板**真的预填**（transport 翻到 http、名称落 'ha-mcp'、提示出现），
 *    且 URL 空时**不许盲发**（提交钮 disabled）；
 * ❷ 提交的载荷**逐字**是 http transport 形状（不是 stdio 兜底）；
 * ❸ 成功之后表单复位到 emptyForm() —— 钉住那个旧 EMPTY_FORM 缺
 *    `transport` 键、导致第二次添加发不出 transport 的形状。
 *
 * ⚠️ 替身不是摆设（R5）：createMcpServer 的记录数组被逐条读回断言，
 * 「替身生不生效」直接决定判据红绿。
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, waitFor, fireEvent } from '@testing-library/react';

vi.mock('react-i18next', () => ({
  useTranslation: () => ({ t: (k: string) => k }),
}));

vi.mock('../../stores/telencephalonStore', () => ({
  useTelencephalonStore: (sel: (s: { status: string }) => unknown) =>
    sel({ status: 'running' }),
}));

const calls = vi.hoisted(() => ({ create: [] as Record<string, unknown>[] }));

vi.mock('../../lib/telencephalonClient', () => ({
  telencephalonClient: {
    listMcpServers: vi.fn(async () => ({
      servers: [{
        id: 'srv-1',
        name: 'ha-mcp',
        description: null,
        wasm: { name: 'unused', version: '0', sha256: 'unused' },
        quota: {},
        transport: { kind: 'http', url: 'http://127.0.0.1:9584/private_x' },
        state: 'running',
        last_error: null,
        tools: [],
        registered_at: '2026-11-13T00:00:00Z',
        last_started_at: null,
      }],
    })),
    getMcpServerTools: vi.fn(async () => []),
    createMcpServer: vi.fn(async (req: Record<string, unknown>) => {
      calls.create.push(req);
      return { id: 'srv-new' };
    }),
    deleteMcpServer: vi.fn(async () => undefined),
    startMcpServer: vi.fn(async () => undefined),
    stopMcpServer: vi.fn(async () => undefined),
  },
}));

import { MCPPage } from '../MCPPage';

/** 页头那个「添加服务器」钮（Modal 打开后同名钮在 portal 里，取最后一个才是提交钮）。 */
function openAddModal() {
  const header = screen.getAllByRole('button', { name: 'mcp.addServer' })[0];
  fireEvent.click(header);
}
function submitButton(): HTMLElement {
  const all = screen.getAllByRole('button', { name: 'mcp.addServer' });
  return all[all.length - 1];
}

beforeEach(() => {
  calls.create.length = 0;
});

describe('MCPPage：ha-mcp 模板', () => {
  it('选模板 ⇒ transport 翻 http、名称预填 ha-mcp、提示出现；URL 空 ⇒ 提交钮禁用（不盲发）', () => {
    render(<MCPPage />);
    openAddModal();
    fireEvent.click(screen.getByRole('button', { name: 'Home Assistant · ha-mcp' }));
    expect(screen.getByLabelText('mcp.fieldName')).toHaveValue('ha-mcp');
    // http 面板（URL 输入）真的在 —— transport 没留在 stdio
    expect(screen.getByLabelText('URL')).toBeInTheDocument();
    expect(screen.getByText('mcp.haMcpUrlHint')).toBeInTheDocument();
    // 不盲发：URL 空时提交钮禁用
    expect(submitButton()).toBeDisabled();
  });

  it('填 URL 后提交 ⇒ createMcpServer 恰好一发，载荷逐字是 http transport 形状', async () => {
    render(<MCPPage />);
    openAddModal();
    fireEvent.click(screen.getByRole('button', { name: 'Home Assistant · ha-mcp' }));
    fireEvent.change(screen.getByLabelText('URL'), {
      target: { value: 'http://192.168.31.50:9584/private_abc' },
    });
    expect(submitButton()).toBeEnabled();
    fireEvent.click(submitButton());
    await waitFor(() => expect(calls.create.length).toBe(1));
    expect(calls.create[0]).toEqual({
      name: 'ha-mcp',
      description: 'mcp.templateHaMcpDescription',
      // placeholder for brains without the serde-default fix
      wasm: { name: '', version: '', sha256: '' },
      transport: { kind: 'http', url: 'http://192.168.31.50:9584/private_abc' },
    });
  });

  it('成功复位：再开表单回到 emptyForm（transport=stdio、名称空、模板提示没了）', async () => {
    render(<MCPPage />);
    openAddModal();
    fireEvent.click(screen.getByRole('button', { name: 'Home Assistant · ha-mcp' }));
    fireEvent.change(screen.getByLabelText('URL'), { target: { value: 'http://h:1/mcp' } });
    fireEvent.click(submitButton());
    await waitFor(() => expect(calls.create.length).toBe(1));
    // 重开 ⇒ 旧 EMPTY_FORM 复位 bug 的回归钉：transport 键必须在，
    // stdio 面板（Command 输入）必须回来，模板钮必须回到未选中态
    openAddModal();
    expect(screen.getByLabelText('mcp.fieldName')).toHaveValue('');
    expect(screen.getByLabelText('Command')).toBeInTheDocument();
    expect(screen.queryByText('mcp.haMcpUrlHint')).not.toBeInTheDocument();
    // 且自定义形状提交仍带 transport（不再发「没有 transport 的载荷」）
    fireEvent.change(screen.getByLabelText('mcp.fieldName'), { target: { value: 'fs' } });
    fireEvent.change(screen.getByLabelText('Command'), { target: { value: 'npx' } });
    fireEvent.click(submitButton());
    await waitFor(() => expect(calls.create.length).toBe(2));
    expect(calls.create[1]).toMatchObject({
      name: 'fs',
      transport: { kind: 'stdio', command: 'npx', args: [] },
    });
  });

  it('自定义模板只填名称 ⇒ 不盲发；stdio 必填 Command', () => {
    render(<MCPPage />);
    openAddModal();
    fireEvent.change(screen.getByLabelText('mcp.fieldName'), { target: { value: 'solo' } });
    expect(submitButton()).toBeDisabled();
    fireEvent.change(screen.getByLabelText('Command'), { target: { value: 'npx -y @mcp/foo' } });
    expect(submitButton()).toBeEnabled();
  });
});
