// @vitest-environment jsdom
/**
 * 「后台常驻」卡片 —— 四条钉死：
 *
 * ① 读到的状态回填出来（开 ⇒ 勾上 ＋ 出「已开启」徽章；关 ⇒ 未勾）；
 * ② web 构建（能力不可用）⇒ 状态是 **null** —— 开关**禁用**、出「仅桌面
 *    可用」提示、**不出**徽章（「判不了」不许显示成「未开启」）；
 * ③ 开启失败 ⇒ 错误说出来 ＋ 开关**回弹**到真实状态（不许留在
 *    「看起来成了」的位置）；
 * ④ 开关动作真的落到 setAutostartEnabled（先开再关，两次都到）。
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';

const autostartState = vi.hoisted(() => ({
  stored: false as boolean,
  // true = 模拟 web 构建（isAutostartEnabled 回 null / set 抛错）。
  web: false,
  failNextSetWith: null as string | null,
  calls: [] as boolean[],
}));

vi.mock('react-i18next', () => ({
  useTranslation: () => ({
    t: (key: string) => key,
  }),
}));

// ⚠️ mock 的是 **lib 层**（卡片对插件 npm 面的唯一出口）——
// `@tauri-apps/plugin-autostart` 在 jsdom 里没有 Tauri 内核，真调必炸；
// 语义（web ⇒ null / 失败 ⇒ 抛）由 lib 自己保证，mock 照抄那份契约。
vi.mock('../../../lib/backgroundRun', () => ({
  isAutostartEnabled: async (): Promise<boolean | null> => {
    if (autostartState.web) return null;
    return autostartState.stored;
  },
  setAutostartEnabled: async (value: boolean): Promise<void> => {
    if (autostartState.web) {
      throw new Error('autostart is not available in the web build');
    }
    autostartState.calls.push(value);
    if (autostartState.failNextSetWith) {
      const msg = autostartState.failNextSetWith;
      autostartState.failNextSetWith = null;
      throw new Error(msg);
    }
    autostartState.stored = value;
  },
}));

import { BackgroundRunCard } from '../BackgroundRunCard';

beforeEach(() => {
  autostartState.stored = false;
  autostartState.web = false;
  autostartState.calls = [];
  autostartState.failNextSetWith = null;
});

describe('BackgroundRunCard —— 后台常驻（自启动）', () => {
  it('① 读到的状态回填：开 ⇒ 勾上 ＋ 出「已开启」徽章；关 ⇒ 未勾 ＋「未开启」徽章', async () => {
    const first = render(<BackgroundRunCard />);
    await waitFor(() =>
      expect(screen.getByTestId('background-run-enabled')).not.toBeChecked(),
    );
    expect(screen.getByTestId('background-run-badge').textContent).toBe(
      'settings.backgroundRun.badgeOff',
    );
    first.unmount();

    autostartState.stored = true;
    render(<BackgroundRunCard />);
    await waitFor(() =>
      expect(screen.getByTestId('background-run-enabled')).toBeChecked(),
    );
    expect(screen.getByTestId('background-run-badge').textContent).toBe(
      'settings.backgroundRun.badgeOn',
    );
  });

  it('② web 构建 ⇒ null：开关禁用、出「仅桌面可用」提示、不出徽章', async () => {
    autostartState.web = true;
    render(<BackgroundRunCard />);
    await waitFor(() => screen.getByTestId('background-run-web-hint'));
    const box = screen.getByTestId('background-run-enabled') as HTMLInputElement;
    expect(box.disabled).toBe(true);
    expect(box.checked).toBe(false);
    // 「判不了」不许长出「未开启」徽章 —— 那是在替平台撒谎。
    expect(screen.queryByTestId('background-run-badge')).toBeNull();
  });

  it('③ 开启失败 ⇒ 错误说出来 ＋ 开关回弹到真实状态', async () => {
    const user = userEvent.setup();
    render(<BackgroundRunCard />);
    await waitFor(() => screen.getByTestId('background-run-enabled'));

    autostartState.failNextSetWith = 'platform refused to enable autostart';
    await user.click(screen.getByTestId('background-run-enabled'));

    await waitFor(() =>
      expect(screen.getByTestId('background-run-error').textContent).toContain(
        'refused to enable autostart',
      ),
    );
    // 回弹：底层还是 false ⇒ 勾选框不许停在勾上的位置。
    expect(screen.getByTestId('background-run-enabled')).not.toBeChecked();
    // 失败了 ⇒ 不出「已开启」徽章。
    expect(screen.getByTestId('background-run-badge').textContent).toBe(
      'settings.backgroundRun.badgeOff',
    );
  });

  it('④ 开关动作真的落到 setAutostartEnabled（先开再关，两次都到）', async () => {
    const user = userEvent.setup();
    render(<BackgroundRunCard />);
    await waitFor(() => screen.getByTestId('background-run-enabled'));

    await user.click(screen.getByTestId('background-run-enabled'));
    await waitFor(() =>
      expect(screen.getByTestId('background-run-enabled')).toBeChecked(),
    );

    await user.click(screen.getByTestId('background-run-enabled'));
    await waitFor(() =>
      expect(screen.getByTestId('background-run-enabled')).not.toBeChecked(),
    );

    expect(autostartState.calls).toEqual([true, false]);
  });
});
