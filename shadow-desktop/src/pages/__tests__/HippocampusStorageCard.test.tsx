// @vitest-environment jsdom
/**
 * 设置页的「海马体存储位置」—— 显示的必须是**真路径**，不是那句假地址。
 *
 * ⚠️ 为什么要**渲染**这一块才测得到：这一页以前写死 `~/.hippocampus`
 * —— 一个任何机器上都不存在的地址 ⇒ ⇒ 单测一个纯函数钉不住它 ⇒ 必须有
 * 一双眼睛看**真实渲染结果**。
 *
 * ⚠️ 「读不到」不许长得像「没有」：后端读失败时，页面必须**说真话**，
 * 而不是画出一个空路径或一句「暂无」。
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, waitFor, fireEvent } from '@testing-library/react';

const REAL_PATH = 'C:\\Users\\tester\\AppData\\Roaming\\shadow\\lance';
const FAKE_PATH = '~/.hippocampus';

const storageState = vi.hoisted(() => ({
  getShouldFail: false,
  setShouldFail: false,
  configured: null as string | null,
  saved: [] as (string | null)[],
  degraded: false,
  degradedReason: null as string | null,
  /** The root this launch actually uses (overrides the configured one). */
  effectiveOverride: null as string | null,
}));

vi.mock('react-i18next', () => ({
  useTranslation: () => ({ t: (k: string) => k }),
}));

vi.mock('../../lib/tauriSafe', () => ({
  safeInvoke: async () => null,
  safeInvokeOrThrow: async (cmd: string, args?: Record<string, unknown>) => {
    if (cmd === 'get_hippocampus_storage') {
      if (storageState.getShouldFail) throw new Error('read failed');
      const effective =
        storageState.effectiveOverride ?? storageState.configured ?? REAL_PATH;
      return {
        configured: storageState.configured,
        effective,
        defaultRoot: REAL_PATH,
        exists: true,
        remote: false,
        degraded: storageState.degraded,
        degradedReason: storageState.degradedReason,
        pendingRestart:
          storageState.configured !== null &&
          storageState.configured !== effective,
      };
    }
    if (cmd === 'set_hippocampus_storage') {
      if (storageState.setShouldFail) throw new Error('write failed');
      const dir = (args?.dir ?? null) as string | null;
      storageState.saved.push(dir);
      storageState.configured = dir;
      return {
        configured: dir,
        effective: dir ?? REAL_PATH,
        defaultRoot: REAL_PATH,
        exists: true,
        remote: false,
      };
    }
    throw new Error('unexpected command: ' + cmd);
  },
}));

import { HippocampusStorageCard } from '../SettingsPage';

beforeEach(() => {
  storageState.getShouldFail = false;
  storageState.setShouldFail = false;
  storageState.configured = null;
  storageState.saved = [];
  storageState.degraded = false;
  storageState.degradedReason = null;
  storageState.effectiveOverride = null;
});

describe('设置页：海马体存储位置', () => {
  it('显示后端给的**真路径**，而不是那句假地址', async () => {
    render(<HippocampusStorageCard />);
    expect(await screen.findByText(REAL_PATH)).toBeTruthy();
    // ⚠️ 这句就是旧的谎：任何机器上都不存在的地址。
    expect(screen.queryByText(FAKE_PATH)).toBeNull();
  });

  it('读不到时说真话，而不是画出一个路径', async () => {
    storageState.getShouldFail = true;
    render(<HippocampusStorageCard />);
    expect(
      await screen.findByText('settings.hippocampusStorageUnreadable'),
    ).toBeTruthy();
    expect(screen.queryByText(REAL_PATH)).toBeNull();
  });

  it('改路径后保存，递给后端的是**新**路径', async () => {
    storageState.configured = 'C:\\old';
    render(<HippocampusStorageCard />);
    const input = (await screen.findByTestId(
      'hippocampus-storage-path',
    )) as HTMLInputElement;
    await waitFor(() => expect(input.value).toBe('C:\\old'));
    fireEvent.change(input, { target: { value: 'D:\\memory' } });
    fireEvent.click(screen.getByText('common.save'));
    await waitFor(() => expect(storageState.saved).toEqual(['D:\\memory']));
  });

  it('存储位置不可用时说出**真实原因**，不是装作没事', async () => {
    storageState.configured = 'D:\\gone';
    storageState.effectiveOverride = REAL_PATH;
    storageState.degraded = true;
    storageState.degradedReason = 'could not create D:\\gone: not found';
    render(<HippocampusStorageCard />);
    const banner = await screen.findByTestId('hippocampus-storage-degraded');
    expect(banner.textContent).toContain('could not create D:\\gone');
    // ⚠️ 降级时显示的是**真正在用的那个**（默认位置），
    // 而不是那个已经坏掉的路径。
    expect(await screen.findByText(REAL_PATH)).toBeTruthy();
  });

  it('改了设置但还没重启 ⇒ 提示重启后生效', async () => {
    storageState.configured = 'D:\\memory';
    storageState.effectiveOverride = REAL_PATH;
    render(<HippocampusStorageCard />);
    expect(
      await screen.findByTestId('hippocampus-storage-pending'),
    ).toBeTruthy();
  });

  it('没改过设置 ⇒ 不显示「重启后生效」', async () => {
    render(<HippocampusStorageCard />);
    await screen.findByText(REAL_PATH);
    expect(screen.queryByTestId('hippocampus-storage-pending')).toBeNull();
  });

  it('保存失败要把错误**说出来**，不是静默', async () => {
    storageState.configured = 'C:\\old';
    storageState.setShouldFail = true;
    render(<HippocampusStorageCard />);
    const input = (await screen.findByTestId(
      'hippocampus-storage-path',
    )) as HTMLInputElement;
    await waitFor(() => expect(input.value).toBe('C:\\old'));
    fireEvent.change(input, { target: { value: 'D:\\memory' } });
    fireEvent.click(screen.getByText('common.save'));
    expect(await screen.findByTestId('hippocampus-storage-error')).toBeTruthy();
  });
});
