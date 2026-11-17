import { describe, it, expect, vi, afterEach, beforeEach } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';

/**
 * 资源管理页 —— 行为判据。
 *
 * ⚠️ 两条纪律在这里落地：
 *
 * 1. **读不到 ≠ 没有** —— 列表读失败时**只画错误**，不许同时画空态
 *    （同屏 ⇒ ⇒ 用户分不清「这台大脑没挂」与「这里确实空空的」）。
 * 2. **删除的回包有三件事实** —— 「索引删了、字节还在」**不是成功**
 *    ⇒ ⇒ 那一条必须走错误通道，不许混进「已删除」那一句里。
 *
 * ⚠️ i18n 的 `t` 在 vitest 全局 setup 里是**键透传** ⇒ ⇒ 断言用键名。
 */

// ⚠️ vi.mock 会被**提升**到 import 之前 ⇒ ⇒ 共享的可变状态必须用
//    vi.hoisted 造出来，否则会撞「Cannot access before initialization」。
const { client } = vi.hoisted(() => ({
  client: {
    list: vi.fn(),
    search: vi.fn(),
    upload: vi.fn(),
    download: vi.fn(),
    update: vi.fn(),
    remove: vi.fn(),
  },
}));

vi.mock('../../lib/documentsClient', () => ({
  documentsClient: client,
}));

vi.mock('../../stores/identityStore', () => {
  const state = {
    tenantId: 'persona-test',
    resolve: vi.fn().mockResolvedValue('persona-test'),
  };
  const useIdentityStore = () => state.tenantId;
  return {
    useIdentityStore: Object.assign(useIdentityStore, {
      getState: () => state,
    }),
  };
});

import { ResourcesPage } from '../ResourcesPage';

/** 一条资源（界面形状）。 */
const doc = {
  id: 'd1',
  tenantId: 'persona-test',
  name: 'notes.md',
  mime: 'text/markdown',
  size: 12,
  blobKey: 'persona-test/d1/notes.md',
  text: 'hello',
  tags: [],
  source: 'desktop',
  createdAt: new Date('2026-11-17T01:02:03Z'),
  updatedAt: new Date('2026-11-17T01:02:04Z'),
  kind: 'file',
  extracted: true,
  truncated: false,
};

beforeEach(() => {
  client.list.mockReset().mockResolvedValue([]);
  client.search.mockReset().mockResolvedValue({ keyword: [], vector: [] });
  client.upload.mockReset().mockResolvedValue(doc);
  client.download.mockReset().mockResolvedValue({
    name: 'notes.md',
    mime: 'text/markdown',
    bytes: new Uint8Array([1, 2, 3]),
  });
  client.update.mockReset().mockResolvedValue({ ...doc, name: 'renamed.md' });
  client.remove.mockReset().mockResolvedValue({
    deleted: true,
    bytesDeleted: true,
    bytesError: null,
  });
});

afterEach(() => {
  vi.clearAllMocks();
});

describe('ResourcesPage —— 读不到与没有必须分开', () => {
  it('⚠️ 列表读失败 ⇒ 只画错误，**不画**空态', async () => {
    client.list.mockRejectedValue(
      new Error('HTTP 404: /hippocampus/api/documents'),
    );
    render(<ResourcesPage />);

    await screen.findByTestId('resource-load-error');
    // ⚠️ 断言落在**原始原因**上 —— 翻译只是前缀，真话必须原样显示。
    const detail = await screen.findByTestId('resource-load-error-detail');
    expect(detail).toHaveTextContent('HTTP 404');
    expect(
      screen.queryByText('resources.empty'),
      '读不到 ≠ 没有 —— 空态不许和错误同屏',
    ).toBeNull();
  });

  it('正控：读得到、列表为空 ⇒ 才画空态（证明上一条不是把空态删掉了）', async () => {
    render(<ResourcesPage />);

    await waitFor(() =>
      expect(screen.getByText('resources.empty')).toBeInTheDocument(),
    );
    expect(screen.queryByTestId('resource-load-error')).toBeNull();
  });
});

describe('ResourcesPage —— 上传', () => {
  it('选文件 ⇒ 传的是**裸字节**（名字/类型都对），传完刷新列表', async () => {
    client.list.mockResolvedValue([doc]);
    render(<ResourcesPage />);
    await screen.findByTestId('resource-row-d1');

    const file = new File(['hello'], 'hello.txt', { type: 'text/plain' });
    Object.defineProperty(file, 'arrayBuffer', {
      value: async () => new TextEncoder().encode('hello').buffer,
    });

    fireEvent.change(screen.getByTestId('resource-file-input'), {
      target: { files: [file] },
    });

    await waitFor(() => expect(client.upload).toHaveBeenCalledTimes(1));
    const payload = client.upload.mock.calls[0][0];
    expect(payload.name).toBe('hello.txt');
    expect(payload.mime).toBe('text/plain');
    expect(payload.kind).toBe('file');
    expect(payload.source).toBe('desktop');
    expect(payload.bytes).toBeInstanceOf(Uint8Array);
    expect(Array.from(payload.bytes as Uint8Array)).toEqual([
      104, 101, 108, 108, 111,
    ]);
    // 传完要刷新列表
    await waitFor(() => expect(client.list).toHaveBeenCalledTimes(2));
  });

  it('上传失败 ⇒ 走错误通道，不许静悄悄', async () => {
    client.upload.mockRejectedValue(new Error('blob put: disk full'));
    render(<ResourcesPage />);
    await waitFor(() => expect(client.list).toHaveBeenCalled());

    const file = new File(['x'], 'x.txt', { type: 'text/plain' });
    Object.defineProperty(file, 'arrayBuffer', {
      value: async () => new TextEncoder().encode('x').buffer,
    });
    fireEvent.change(screen.getByTestId('resource-file-input'), {
      target: { files: [file] },
    });

    await screen.findByTestId('resource-action-error');
    const detail = await screen.findByTestId('resource-action-error-detail');
    expect(detail).toHaveTextContent('disk full');
  });
});

describe('ResourcesPage —— 删除的三件事实', () => {
  it('⚠️ 索引删了但字节还在 ⇒ 走**错误**通道，不许说成「已删除」', async () => {
    client.list.mockResolvedValue([doc]);
    client.remove.mockResolvedValue({
      deleted: true,
      bytesDeleted: false,
      bytesError: 'blob delete k: boom',
    });
    render(<ResourcesPage />);
    await screen.findByTestId('resource-row-d1');

    fireEvent.click(screen.getByTestId('resource-delete-d1'));

    await screen.findByTestId('resource-action-error');
    // ⚠️ 「字节还在」的**原因**必须原样显示（它是用户唯一的线索）。
    const detail = await screen.findByTestId('resource-action-error-detail');
    expect(detail).toHaveTextContent('boom');
    expect(
      screen.queryByTestId('resource-notice'),
      '字节还在 ⇒ 那不是成功 ⇒ 不许说成「已删除」',
    ).toBeNull();
  });

  it('正控：索引与字节都删了 ⇒ 才走中性通知', async () => {
    client.list.mockResolvedValue([doc]);
    render(<ResourcesPage />);
    await screen.findByTestId('resource-row-d1');

    fireEvent.click(screen.getByTestId('resource-delete-d1'));

    await screen.findByTestId('resource-notice');
    expect(screen.queryByTestId('resource-action-error')).toBeNull();
  });

  it('压根没有那一行 ⇒ 中性通知（不是错误）', async () => {
    client.list.mockResolvedValue([doc]);
    client.remove.mockResolvedValue({
      deleted: false,
      bytesDeleted: false,
      bytesError: null,
    });
    render(<ResourcesPage />);
    await screen.findByTestId('resource-row-d1');

    fireEvent.click(screen.getByTestId('resource-delete-d1'));

    await screen.findByTestId('resource-notice');
    expect(screen.queryByTestId('resource-action-error')).toBeNull();
  });
});

describe('ResourcesPage —— 搜索', () => {
  it('⚠️ 两个通道**分开**画（BM25 与余弦相似度不可比）', async () => {
    client.search.mockResolvedValue({
      keyword: [{ document: doc, score: 3.2, channel: 'keyword' }],
      vector: [
        {
          document: { ...doc, id: 'd2', name: 'other.md' },
          score: 0.8,
          channel: 'vector',
        },
      ],
    });
    render(<ResourcesPage />);
    await waitFor(() => expect(client.list).toHaveBeenCalled());

    fireEvent.change(screen.getByTestId('resource-search-input'), {
      target: { value: 'hello' },
    });
    fireEvent.click(screen.getByText('resources.search'));

    await screen.findByTestId('resource-keyword-section');
    const keyword = screen.getByTestId('resource-keyword-section');
    const vector = screen.getByTestId('resource-vector-section');
    expect(keyword).toHaveTextContent('notes.md');
    expect(keyword).not.toHaveTextContent('other.md');
    expect(vector).toHaveTextContent('other.md');
    expect(vector).not.toHaveTextContent('notes.md');
  });

  it('搜索请求把词送出去（POST 那一路由客户端判据钉住）', async () => {
    render(<ResourcesPage />);
    await waitFor(() => expect(client.list).toHaveBeenCalled());

    fireEvent.change(screen.getByTestId('resource-search-input'), {
      target: { value: 'hello' },
    });
    fireEvent.click(screen.getByText('resources.search'));

    await waitFor(() => expect(client.search).toHaveBeenCalledWith('hello', 20));
  });
});

describe('ResourcesPage —— 改名', () => {
  it('改名走 update 并刷新列表', async () => {
    client.list.mockResolvedValue([doc]);
    render(<ResourcesPage />);
    await screen.findByTestId('resource-row-d1');

    fireEvent.click(screen.getByTestId('resource-rename-d1'));
    fireEvent.change(screen.getByTestId('resource-rename-input-d1'), {
      target: { value: 'renamed.md' },
    });
    fireEvent.click(screen.getByTestId('resource-rename-confirm-d1'));

    await waitFor(() =>
      expect(client.update).toHaveBeenCalledWith('d1', { name: 'renamed.md' }),
    );
  });

  it('空名字不许提交（否则服务端会收一个空文件名）', async () => {
    client.list.mockResolvedValue([doc]);
    render(<ResourcesPage />);
    await screen.findByTestId('resource-row-d1');

    fireEvent.click(screen.getByTestId('resource-rename-d1'));
    fireEvent.change(screen.getByTestId('resource-rename-input-d1'), {
      target: { value: '   ' },
    });
    fireEvent.click(screen.getByTestId('resource-rename-confirm-d1'));

    await screen.findByTestId('resource-action-error');
    expect(client.update).not.toHaveBeenCalled();
  });
});
