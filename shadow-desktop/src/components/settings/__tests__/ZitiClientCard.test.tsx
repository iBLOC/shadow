// @vitest-environment jsdom
/**
 * 「切到远端大脑」卡片 —— 四条钉死：
 *
 * ① 读到的配置渲染出来（badge 状态 / 输入框回填）；
 * ② 保存 ⇒ 命令带着 **camelCase** 实参发出去（`identityPath`，
 *    不是 Rust 的 `identity_path` —— 命名漂了 Tauri 会按默认值收）；
 * ③ Rust 侧**明确拒绝**（开着但字段不全）⇒ 错误要**说出来**，
 *    不是静悄悄吞掉（吞了就是「点了保存没反应」）；
 * ④ web 构建（命令不可用）⇒ 表照常渲染、保存**明确报**不可用。
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';

const invokeState = vi.hoisted(() => ({
  stored: { enabled: false, identityPath: '', service: '' },
  invokeCalls: [] as Array<{ cmd: string; args?: Record<string, unknown> }>,
  failNextSaveWith: null as string | null,
}));

vi.mock('react-i18next', () => ({
  useTranslation: () => ({
    t: (key: string) => key,
  }),
}));

vi.mock('../../../lib/tauriSafe', () => ({
  safeInvoke: async (cmd: string) => {
    if (cmd === 'ziti_client_get_config') return invokeState.stored;
    throw new Error('unexpected command: ' + cmd);
  },
  safeInvokeOrThrow: async (cmd: string, args?: Record<string, unknown>) => {
    invokeState.invokeCalls.push({ cmd, args });
    if (cmd === 'ziti_client_set_config') {
      if (invokeState.failNextSaveWith) {
        const msg = invokeState.failNextSaveWith;
        invokeState.failNextSaveWith = null;
        throw new Error(msg);
      }
      invokeState.stored = {
        enabled: Boolean(args?.enabled),
        identityPath: String(args?.identityPath ?? ''),
        service: String(args?.service ?? ''),
      };
      return invokeState.stored;
    }
    throw new Error('unexpected command: ' + cmd);
  },
}));

import { ZitiClientCard } from '../ZitiClientCard';
import { DEFAULT_ZITI_CLIENT_CONFIG } from '../../../lib/zitiClientConfig';

beforeEach(() => {
  invokeState.stored = { ...DEFAULT_ZITI_CLIENT_CONFIG };
  invokeState.invokeCalls = [];
  invokeState.failNextSaveWith = null;
});

describe('ZitiClientCard —— 「切到远端大脑」的开关', () => {
  it('① 读到的配置渲染出来（关 ⇒ badgeOff；开 ⇒ badgeOn ＋ 回填）', async () => {
    const { rerender } = render(<ZitiClientCard />);
    await waitFor(() =>
      expect(screen.getByTestId('ziti-client-enabled')).not.toBeChecked(),
    );
    expect(screen.getByText('settings.zitiClient.badgeOff')).toBeTruthy();

    invokeState.stored = {
      enabled: true,
      identityPath: '/home/u/id.json',
      service: 'shadow-brain',
    };
    rerender(<ZitiClientCard />);
    await waitFor(() => {
      expect(screen.getByTestId('ziti-identity-path')).toHaveProperty(
        'value',
        '/home/u/id.json',
      );
    });
    expect(screen.getByTestId('ziti-service')).toHaveProperty('value', 'shadow-brain');
    expect(screen.getByText('settings.zitiClient.badgeOn')).toBeTruthy();
  });

  it('② 保存 ⇒ 命令带 camelCase 实参发出去 ＋ 「重启后生效」说出来', async () => {
    const user = userEvent.setup();
    render(<ZitiClientCard />);
    await waitFor(() => screen.getByTestId('ziti-client-enabled'));

    await user.click(screen.getByTestId('ziti-client-enabled'));
    await user.type(screen.getByTestId('ziti-identity-path'), '/home/u/id.json');
    await user.type(screen.getByTestId('ziti-service'), 'shadow-brain');
    await user.click(screen.getByTestId('ziti-client-save'));

    await waitFor(() => expect(screen.getByTestId('ziti-client-saved')).toBeTruthy());
    const save = invokeState.invokeCalls.find((c) => c.cmd === 'ziti_client_set_config');
    expect(save).toBeTruthy();
    // ⚠️ camelCase（`identityPath`）—— Tauri 按 JS 键名对实参；
    // 漂成 snake_case ⇒ Rust 按默认值收 ⇒ 静悄悄存了一半。
    expect(save?.args).toEqual({
      enabled: true,
      identityPath: '/home/u/id.json',
      service: 'shadow-brain',
    });
  });

  it('③ Rust 明确拒绝 ⇒ 错误说出来（不是吞掉）', async () => {
    const user = userEvent.setup();
    render(<ZitiClientCard />);
    await waitFor(() => screen.getByTestId('ziti-client-enabled'));

    invokeState.failNextSaveWith = '启用零信任客户端需要同时填写身份文件路径与服务名';
    await user.click(screen.getByTestId('ziti-client-enabled'));
    await user.click(screen.getByTestId('ziti-client-save'));

    await waitFor(() =>
      expect(screen.getByTestId('ziti-client-error').textContent).toContain(
        '身份文件路径',
      ),
    );
    // 没存上 ⇒ 不出「已保存」。
    expect(screen.queryByTestId('ziti-client-saved')).toBeNull();
  });

  it('④ web 构建（get 拿到 fallback 默认值）⇒ 表照常渲染；save 失败 ⇒ 明确报', async () => {
    // get 的 fallback 行为在 tauriSafe mock 里体现为 stored=默认值。
    const user = userEvent.setup();
    render(<ZitiClientCard />);
    await waitFor(() => screen.getByTestId('ziti-client-enabled'));
    expect(screen.getByTestId('ziti-identity-path')).toHaveProperty('value', '');

    invokeState.failNextSaveWith =
      'Tauri command "ziti_client_set_config" is not available in the web build';
    await user.click(screen.getByTestId('ziti-client-enabled'));
    await user.click(screen.getByTestId('ziti-client-save'));
    await waitFor(() =>
      expect(screen.getByTestId('ziti-client-error').textContent).toContain(
        'not available in the web build',
      ),
    );
  });
});
