import { describe, it, expect, vi, afterEach } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryStorageCard } from '../MemoryStorageCard';
import { telencephalonClient } from '../../../lib/telencephalonClient';
import type { ConfigEntry } from '../../../lib/telencephalonClient';

// **重启应用**在 jsdom 里没有 Tauri ⇒ mock 掉（断言「done 之后真的叫了它」）。
const restartAppMock = vi.fn();
vi.mock('../../../lib/appRestart', () => ({
  restartApp: () => restartAppMock(),
}));

// ⚠️ stub 还原纪律（与仓库其它 vitest 同一条）：不还原会泄漏给同 worker
// 的后续文件 ⇒ 失败长得像成功。
afterEach(() => {
  vi.restoreAllMocks();
});

// ⚠️ 全局 setup 把 `react-i18next` 的 `t` 做成**键透传** ⇒ 断言里用的是键名。

function entry(key: string, value: unknown, secret = false): ConfigEntry {
  return { key, value, secret };
}

function mockSection(entries: ConfigEntry[], appliesWhen = 'restart') {
  return vi
    .spyOn(telencephalonClient.neuron, 'configSection')
    .mockResolvedValue({ section: 'hippocampus', entries, applies_when: appliesWhen });
}

describe('MemoryStorageCard（记忆存储）', () => {
  it('读不到控制面（503）⇒ 说「读不到」，并区分出「不是没配过」', async () => {
    vi.spyOn(telencephalonClient.neuron, 'configSection').mockRejectedValue(
      new Error('telencephalon 503: {"error":{"code":5030,"message":"config centre unavailable"}}'),
    );

    render(<MemoryStorageCard />);

    expect(
      await screen.findByText('settings.memoryStorage.unreadableTitle'),
    ).toBeInTheDocument();
    // ⚠️ 这一格是全部意义：503 不许画成「未配置」。
    expect(screen.queryByText('settings.memoryStorage.notConfigured')).toBeNull();
    // 原因串要带上（用户/支持据此区分「没配」与「控制面没连上」）。
    expect(screen.getByTestId('memory-storage-unreadable-reason')).toHaveTextContent(/503/);
  });

  it('已配置 s3：位置回填、后端选中 s3、秘密显示掩码', async () => {
    mockSection([
      entry('storage_uri', 's3://bucket/prefix'),
      entry('storage_endpoint', 'http://127.0.0.1:9000'),
      entry('storage_region', 'us-east-1'),
      entry('storage_access_key', '***', true),
      entry('storage_secret_key', '***', true),
    ]);

    render(<MemoryStorageCard />);

    expect(await screen.findByTestId('memory-storage-card')).toBeInTheDocument();
    expect(screen.getByTestId('memory-storage-location')).toHaveValue('s3://bucket/prefix');
    expect(screen.getByTestId('memory-storage-endpoint')).toHaveValue('http://127.0.0.1:9000');
    expect(screen.getByTestId('memory-storage-access-key')).toHaveValue('***');
    expect(screen.getByText('settings.memoryStorage.configured')).toBeInTheDocument();
  });

  it('OSS 缺 endpoint ⇒ 就地报错，且**不写任何东西**', async () => {
    mockSection([entry('storage_uri', 'oss://bucket/prefix')]);
    const put = vi
      .spyOn(telencephalonClient.neuron, 'putConfig')
      .mockResolvedValue({ ...entry('x', 'y'), applies_when: 'restart' });

    render(<MemoryStorageCard />);
    await screen.findByTestId('memory-storage-card');

    // 已经把 endpoint 清空、位置是 oss:// ⇒ 保存应被前端拦住。
    await userEvent.click(screen.getByText('settings.memoryStorage.save'));

    expect(
      await screen.findByTestId('memory-storage-error'),
    ).toHaveTextContent('settings.memoryStorage.invalidOssEndpoint');
    expect(put).not.toHaveBeenCalled();
  });

  it('保存成功 ⇒ 调 putConfig 写 storage_uri，并按 applies_when 说「重启后生效」', async () => {
    mockSection([]);
    const put = vi
      .spyOn(telencephalonClient.neuron, 'putConfig')
      .mockResolvedValue({ ...entry('storage_uri', 's3://bucket'), applies_when: 'restart' });
    vi.spyOn(telencephalonClient.neuron, 'deleteConfig').mockResolvedValue({ removed: true });

    render(<MemoryStorageCard />);
    await screen.findByTestId('memory-storage-card');

    await userEvent.click(screen.getByTestId('memory-storage-backend-s3'));
    await userEvent.clear(screen.getByTestId('memory-storage-location'));
    await userEvent.type(screen.getByTestId('memory-storage-location'), 's3://bucket/prefix');
    await userEvent.type(screen.getByTestId('memory-storage-endpoint'), 'http://127.0.0.1:9000');
    await userEvent.click(screen.getByText('settings.memoryStorage.save'));

    await waitFor(() => expect(put).toHaveBeenCalled());
    expect(put.mock.calls.some((c) => c[0] === 'hippocampus' && c[1] === 'storage_uri')).toBe(true);
    expect(
      await screen.findByTestId('memory-storage-saved'),
    ).toHaveTextContent('settings.memoryStorage.savedPendingRestart');
  });

  it('秘密是掩码时**不回写**（避免把 *** 当成新密钥写进去）', async () => {
    mockSection([
      entry('storage_uri', 's3://bucket/prefix'),
      entry('storage_access_key', '***', true),
      entry('storage_secret_key', '***', true),
    ]);
    const put = vi
      .spyOn(telencephalonClient.neuron, 'putConfig')
      .mockResolvedValue({ ...entry('storage_uri', 's3://bucket/prefix'), applies_when: 'restart' });
    vi.spyOn(telencephalonClient.neuron, 'deleteConfig').mockResolvedValue({ removed: true });

    render(<MemoryStorageCard />);
    await screen.findByTestId('memory-storage-card');
    await userEvent.click(screen.getByText('settings.memoryStorage.save'));

    await waitFor(() => expect(put).toHaveBeenCalled());
    const wroteSecrets = put.mock.calls.some(
      (c) => c[1] === 'storage_access_key' || c[1] === 'storage_secret_key',
    );
    expect(wroteSecrets).toBe(false);
  });

  // ⚠️ 真机 2026-11-13 红 toast 那一格的回归测试：切本地后端时，卡片会顺手
  // 清 storage_endpoint/storage_region。若这两键**本来就不存在**（从没配过
  // 远端），发 DELETE 会拿 404 ⇒ 全局拦截器弹红 ⇒ 「保存成功」与红报错同屏
  // （成功长得像失败）。修法＝entries 里没有的键**根本不发 DELETE**。
  it('本地后端保存：endpoint/region 键不存在 ⇒ 不发 DELETE（红 toast 那一格）', async () => {
    // entries 只有 storage_uri（用户从没配过远端）。
    // ⚠️ 根与下面要输入的是**同一个** —— 换根现在会走迁移（另有判据），
    // 这一条测的是「切后端时清远端键不发 DELETE ⇒ 不弹红 toast」。
    mockSection([entry('storage_uri', '/tmp/mem')]);
    vi
      .spyOn(telencephalonClient.neuron, 'putConfig')
      .mockResolvedValue({ ...entry('storage_uri', '/tmp/mem'), applies_when: 'restart' });
    const del = vi
      .spyOn(telencephalonClient.neuron, 'deleteConfig')
      .mockResolvedValue({ removed: true });

    render(<MemoryStorageCard />);
    await screen.findByTestId('memory-storage-card');
    await userEvent.click(screen.getByTestId('memory-storage-backend-local'));
    await userEvent.clear(screen.getByTestId('memory-storage-location'));
    await userEvent.type(screen.getByTestId('memory-storage-location'), '/tmp/mem');
    await userEvent.click(screen.getByText('settings.memoryStorage.save'));

    // ⚠️ 全量并行跑时默认 1s 的 waitFor 会抖（本文件在 60s+ 的重负载下
    // 首跑红过一次）⇒ 显式放宽，别留偶发红。
    await waitFor(
      () => expect(screen.getByTestId('memory-storage-saved')).toBeInTheDocument(),
      { timeout: 5000 },
    );
    // 关键断言：endpoint/region 不存在 ⇒ 一次 DELETE 都不发。
    expect(
      del.mock.calls.filter((c) => c[1] === 'storage_endpoint' || c[1] === 'storage_region'),
    ).toHaveLength(0);
  });

  it('本地后端保存：endpoint 键存在 ⇒ 才发 DELETE 清掉它', async () => {
    mockSection([
      entry('storage_uri', '/tmp/mem'),
      entry('storage_endpoint', 'http://127.0.0.1:9000'),
    ]);
    vi
      .spyOn(telencephalonClient.neuron, 'putConfig')
      .mockResolvedValue({ ...entry('storage_uri', '/tmp/mem'), applies_when: 'restart' });
    const del = vi
      .spyOn(telencephalonClient.neuron, 'deleteConfig')
      .mockResolvedValue({ removed: true });

    render(<MemoryStorageCard />);
    await screen.findByTestId('memory-storage-card');
    await userEvent.click(screen.getByTestId('memory-storage-backend-local'));
    await userEvent.clear(screen.getByTestId('memory-storage-location'));
    await userEvent.type(screen.getByTestId('memory-storage-location'), '/tmp/mem');
    await userEvent.click(screen.getByText('settings.memoryStorage.save'));

    await waitFor(() => expect(del).toHaveBeenCalled(), { timeout: 5000 });
    expect(del.mock.calls.some((c) => c[1] === 'storage_endpoint')).toBe(true);
  });
});

// ─────────────────────────────────────────────────────────────────────
// **换存储 = 迁移**（2026-11-13）
// ─────────────────────────────────────────────────────────────────────

const LOCAL_URI = 'file:///data/lance';
const NEW_URI = 'file:///mnt/new-lance';

describe('MemoryStorageCard（换存储 ⇒ 自动迁移）', () => {
  it('目标与当前不同 ⇒ 调迁移面，且**不再**直接写 storage_uri', async () => {
    restartAppMock.mockReset();
    mockSection([entry('storage_uri', LOCAL_URI)]);
    const put = vi.spyOn(telencephalonClient.neuron, 'putConfig');
    const start = vi
      .spyOn(telencephalonClient.neuron, 'startStorageMigration')
      .mockResolvedValue({ needs_migration: true, state: 'copying' });

    render(<MemoryStorageCard />);
    const input = await screen.findByTestId('memory-storage-location');
    await userEvent.clear(input);
    await userEvent.type(input, NEW_URI);
    await userEvent.click(screen.getByRole('button', { name: /settings\.memoryStorage\.save/ }));

    await waitFor(() => expect(start).toHaveBeenCalledTimes(1));
    expect(start.mock.calls[0][0].uri).toBe(NEW_URI);
    // ⚠️ 这一格是全部意义：换根**不能**只写一行 URI（那样新根是空库）。
    expect(put).not.toHaveBeenCalledWith(
      'hippocampus',
      'storage_uri',
      expect.anything(),
      expect.anything(),
    );
  });

  it('同一个根 ⇒ 走老路径（直接写配置，不启动迁移）', async () => {
    restartAppMock.mockReset();
    mockSection([entry('storage_uri', LOCAL_URI)]);
    const put = vi.spyOn(telencephalonClient.neuron, 'putConfig').mockResolvedValue({
      key: 'storage_uri',
      value: LOCAL_URI,
      section: 'hippocampus',
      applies_when: 'restart',
    } as never);
    const start = vi.spyOn(telencephalonClient.neuron, 'startStorageMigration');

    render(<MemoryStorageCard />);
    await screen.findByTestId('memory-storage-location');
    await userEvent.click(screen.getByRole('button', { name: /settings\.memoryStorage\.save/ }));

    await waitFor(() => expect(put).toHaveBeenCalled());
    expect(start).not.toHaveBeenCalled();
  });

  it('迁移中 ⇒ 阻塞弹窗带数据集进度；done ⇒ 触发重启应用', async () => {
    restartAppMock.mockReset();
    mockSection([entry('storage_uri', LOCAL_URI)]);
    vi.spyOn(telencephalonClient.neuron, 'startStorageMigration').mockResolvedValue({
      needs_migration: true,
      state: 'copying',
    });
    // 第一次轮询：还在搬；第二次：完成。
    const status = vi
      .spyOn(telencephalonClient.neuron, 'storageMigration')
      .mockResolvedValueOnce({
        state: 'copying',
        datasets_done: 3,
        datasets_total: 10,
        bytes_total: 100,
        bytes_done: 40,
        current: 'messages',
      })
      .mockResolvedValue({
        state: 'done',
        restart_required: true,
        datasets_done: 10,
        datasets_total: 10,
      });

    render(<MemoryStorageCard />);
    const input = await screen.findByTestId('memory-storage-location');
    await userEvent.clear(input);
    await userEvent.type(input, NEW_URI);
    await userEvent.click(screen.getByRole('button', { name: /settings\.memoryStorage\.save/ }));

    // 弹窗（不可关的阻塞层）
    const dialog = await screen.findByRole('dialog');
    expect(dialog).toBeTruthy();
    // 完 ⇒ 重启应用被叫（不靠用户再点一下）
    await waitFor(() => expect(restartAppMock).toHaveBeenCalled(), { timeout: 5000 });
    expect(status).toHaveBeenCalled();
  });

  it('失败 ⇒ 弹窗显示后端原话，且 [重试] 在', async () => {
    restartAppMock.mockReset();
    mockSection([entry('storage_uri', LOCAL_URI)]);
    vi.spyOn(telencephalonClient.neuron, 'startStorageMigration').mockResolvedValue({
      needs_migration: true,
      state: 'copying',
    });
    vi.spyOn(telencephalonClient.neuron, 'storageMigration').mockResolvedValue({
      state: 'failed',
      error: 'copy dataset memory: disk full',
      datasets_done: 2,
      datasets_total: 10,
    });

    render(<MemoryStorageCard />);
    const input = await screen.findByTestId('memory-storage-location');
    await userEvent.clear(input);
    await userEvent.type(input, NEW_URI);
    await userEvent.click(screen.getByRole('button', { name: /settings\.memoryStorage\.save/ }));

    await screen.findByRole('dialog');
    expect(await screen.findByText(/disk full/)).toBeTruthy();
    expect(
      screen.getByRole('button', { name: /settings\.memoryStorage\.migration\.retry/ }),
    ).toBeTruthy();
  });
});
