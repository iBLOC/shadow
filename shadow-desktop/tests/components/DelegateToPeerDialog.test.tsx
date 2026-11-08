import { beforeEach, describe, expect, it, vi } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import { DelegateToPeerDialog } from '../../src/components/DelegateToPeerDialog';
import * as prefrontalClient from '../../src/lib/prefrontalClient';

vi.mock('../../src/lib/prefrontalClient', () => ({
  prefrontalClient: {
    listA2APeers: vi.fn(),
    registerA2APeer: vi.fn(),
    delegateToPeer: vi.fn(),
  },
}));

const mockPeers = [
  {
    id: 'peer-1',
    url: 'http://192.168.1.100:8082',
    name: 'Home Server',
    reachable: true,
    last_seen_ms: Date.now(),
    capabilities: ['llm', 'tts'],
  },
];

describe('DelegateToPeerDialog', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('renders nothing when open is false', () => {
    render(<DelegateToPeerDialog open={false} onClose={() => {}} />);
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
  });

  it('renders dialog when open is true', async () => {
    vi.mocked(prefrontalClient.prefrontalClient.listA2APeers).mockResolvedValue({
      data: mockPeers,
    } as any);

    render(<DelegateToPeerDialog open={true} onClose={() => {}} />);

    await waitFor(() => {
      expect(screen.getByRole('dialog')).toBeInTheDocument();
    });
  });

  it('displays peer cards when peers with llm are available', async () => {
    vi.mocked(prefrontalClient.prefrontalClient.listA2APeers).mockResolvedValue({
      data: mockPeers,
    } as any);

    render(<DelegateToPeerDialog open={true} onClose={() => {}} />);

    await waitFor(() => {
      expect(screen.getByText(/home server/i)).toBeInTheDocument();
    });
  });

  it('filters to only peers with llm capability', async () => {
    vi.mocked(prefrontalClient.prefrontalClient.listA2APeers).mockResolvedValue({
      data: [
        ...mockPeers,
        { id: 'no-llm', url: 'http://192.168.1.102:8082', name: 'No LLM', reachable: true, last_seen_ms: Date.now(), capabilities: ['tts'] },
      ],
    } as any);

    render(<DelegateToPeerDialog open={true} onClose={() => {}} />);

    await waitFor(() => {
      expect(screen.queryByText(/no llm/i)).not.toBeInTheDocument();
    });
  });

  it('calls onClose when cancel button is clicked', async () => {
    vi.mocked(prefrontalClient.prefrontalClient.listA2APeers).mockResolvedValue({
      data: mockPeers,
    } as any);

    const handleClose = vi.fn();

    render(<DelegateToPeerDialog open={true} onClose={handleClose} />);

    await waitFor(() => {
      const cancelBtn = screen.getByRole('button', { name: /cancel/i });
      cancelBtn.click();
    });

    expect(handleClose).toHaveBeenCalled();
  });

  it('uses prefillUrl to auto-show add peer form', async () => {
    vi.mocked(prefrontalClient.prefrontalClient.listA2APeers).mockResolvedValue({
      data: [],
    } as any);

    render(
      <DelegateToPeerDialog
        open={true}
        onClose={() => {}}
        prefillUrl="http://192.168.1.100:8082"
      />
    );

    await waitFor(() => {
      expect(screen.getByDisplayValue(/192\.168\.1\.100:8082/i)).toBeInTheDocument();
    });
  });

  /**
   * ⚠️ **失败不能长得像成功** —— 这是这一族里最坏的一种。
   *
   * 以前注册 peer 失败（端脑没有这一面 ⇒ 404）时，代码把异常**吞掉**
   * （`.catch(() => {})`），然后**编造**一个 `reachable: true` 的 peer
   * 加进列表 ⇒ ⇒ 界面说「已添加、可发送」，而服务端**根本没有**这个 peer。
   *
   * ⇒ 判据：❶ 失败**必须被说出来**；❷ **不许**出现那个被编造的 peer 卡片。
   */
  it('注册 peer 失败 ⇒ 说出失败，且**不许**把 peer 编造进列表', async () => {
    vi.mocked(prefrontalClient.prefrontalClient.listA2APeers).mockResolvedValue({
      data: [],
    } as any);
    vi.mocked(prefrontalClient.prefrontalClient.registerA2APeer).mockRejectedValue(
      new Error('HTTP 404: Not Found'),
    );

    render(
      <DelegateToPeerDialog
        open={true}
        onClose={() => {}}
        prefillUrl="http://192.168.1.100:8082"
      />
    );

    // 表单自动弹出（prefillUrl）⇒ 填好的就是那个 peer 的地址
    await waitFor(() => {
      expect(screen.getByDisplayValue(/192\.168\.1\.100:8082/i)).toBeInTheDocument();
    });

    screen.getByRole('button', { name: 'common.add' }).click();

    await waitFor(() => {
      expect(prefrontalClient.prefrontalClient.registerA2APeer).toHaveBeenCalled();
    });

    // ❶ 失败必须被说出来（错误条出现）——**上下文（译文）＋ 原因（原文）两者都在**
    await waitFor(() => {
      expect(screen.getByText(/common\.delegate\.peerAddFailed/)).toBeInTheDocument();
    });
    const errEl = screen.getByText(/common\.delegate\.peerAddFailed/);
    expect(errEl.textContent).toContain('HTTP 404: Not Found');

    // ❷ **不许**编造：peer 卡片会把它的 url 显示成文本 ⇒ 没有它就说明没进列表
    expect(screen.queryByText('http://192.168.1.100:8082')).not.toBeInTheDocument();
  });

  /**
   * 「读不到」≠「没有」 —— 列表读失败时不能说成「一个 peer 都没有」。
   */
  it('peer 列表读不到 ⇒ 说出失败，而不是装作「没有 peer」', async () => {
    vi.mocked(prefrontalClient.prefrontalClient.listA2APeers).mockRejectedValue(
      new Error('HTTP 404: Not Found'),
    );

    render(<DelegateToPeerDialog open={true} onClose={() => {}} />);

    await waitFor(() => {
      expect(screen.getByText(/common\.delegate\.peerListFailed/)).toBeInTheDocument();
    });
    // 上下文（译文）＋ 原因（原文）**两者都在** ⇒ ⇒ 不是把裸的 "HTTP 404" 甩给用户
    const errEl = screen.getByText(/common\.delegate\.peerListFailed/);
    expect(errEl.textContent).toContain('HTTP 404: Not Found');

    // ⚠️ **「读不到」≠「没有」** ⇒ ⇒ **不许**显示「一个 peer 都没有」的空态
    expect(screen.queryByText(/common\.delegate\.emptyPeers/)).not.toBeInTheDocument();
  });

  /**
   * 孪生用例：列表**真的读到空** ⇒ ⇒ 空态**该出现**。
   *
   * 上一条钉的是「读不到 ⇒ 不许装作没有」；这一条钉的是
   * 「真的没有 ⇒ 仍然要老实说没有」⇒ ⇒ 两件事**必须分得开**。
   */
  it('列表**真的读到空** ⇒ 空态出现（孪生：把「读不到」与「没有」分开）', async () => {
    vi.mocked(prefrontalClient.prefrontalClient.listA2APeers).mockResolvedValue({
      data: [],
    } as any);

    render(<DelegateToPeerDialog open={true} onClose={() => {}} />);

    await waitFor(() => {
      expect(screen.getByText(/common\.delegate\.emptyPeers/)).toBeInTheDocument();
    });
    // 读到了空列表 ⇒ ⇒ **没有**错误条
    expect(screen.queryByText(/common\.delegate\.peerListFailed/)).not.toBeInTheDocument();
  });
});
