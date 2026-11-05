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
  // ⚠️ **producer（Rust/serde）回的就是 snake_case** ⇒ ⇒ 夹具照抄真实形状
  // ⇒ ⇒ 拿 camelCase 当夹具 = 测「夹具自己」，不是测「真链路」
  // ⇒ ⇒ （真链路：Rust 的 identity_path → serde 默认字段名 → JSON 就是 snake_case）
  stored: { enabled: false, identity_path: '', service: '' } as Record<string, unknown>,
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
      // ⚠️ 保存的**回包**也是 producer 的形状（snake_case）⇒ ⇒ 归一不归一差在这儿
      invokeState.stored = {
        enabled: Boolean(args?.enabled),
        identity_path: String(args?.identityPath ?? ''),
        service: String(args?.service ?? ''),
      };
      return invokeState.stored;
    }
    throw new Error('unexpected command: ' + cmd);
  },
}));

import { ZitiClientCard } from '../ZitiClientCard';
import {
  DEFAULT_ZITI_CLIENT_CONFIG,
  getZitiClientConfig,
  setZitiClientConfig,
} from '../../../lib/zitiClientConfig';

beforeEach(() => {
  invokeState.stored = { enabled: false, identity_path: '', service: '' };
  invokeState.invokeCalls = [];
  invokeState.failNextSaveWith = null;
});

describe('ZitiClientCard —— 「切到远端大脑」的开关', () => {
  it('① 读到的配置渲染出来（关 ⇒ badgeOff；开 ⇒ badgeOn ＋ 回填）', async () => {
    const { unmount } = render(<ZitiClientCard />);
    await waitFor(() =>
      expect(screen.getByTestId('ziti-client-enabled')).not.toBeChecked(),
    );
    expect(screen.getByText('settings.zitiClient.badgeOff')).toBeTruthy();

    invokeState.stored = {
      enabled: true,
      identity_path: '/home/u/id.json',
      service: 'shadow-brain',
    };
    // ⚠️ **重新挂载**（不是 rerender）—— 组件是「挂载时读一次配置」
    // ⇒ ⇒ rerender 不会重跑那个 effect ⇒ ⇒ 用 rerender 等「回填」根本等不到
    // ⇒ ⇒ ⇒ 这条测试曾经一直红，而它要钉的行为是对的 ⇒ ⇒ 夹具的姿势也得对。
    unmount();
    render(<ZitiClientCard />);
    await waitFor(() => {
      expect(screen.getByTestId('ziti-identity-path')).toHaveProperty(
        'value',
        '/home/u/id.json',
      );
    });
    expect(screen.getByTestId('ziti-service')).toHaveProperty('value', 'shadow-brain');
    expect(screen.getByText('settings.zitiClient.badgeOn')).toBeTruthy();
  });

  // ⚠️⚠️ **库层**那两条才是真链路的形状：producer（Rust/serde）回的是 **snake_case**
  // ⇒ ⇒ 读与写**两条路**都要归一 ⇒ ⇒ 不然「读到的配置回填不出来」「存完被清空」。
  it('①b 库层：producer 回 snake_case ⇒ ⇒ 读回来是 camelCase（而且有值）', async () => {
    invokeState.stored = {
      enabled: true,
      identity_path: '/home/u/id.json',
      service: 'shadow-brain',
    };
    const read = await getZitiClientConfig();
    expect(read.enabled).toBe(true);
    expect(read.identityPath).toBe('/home/u/id.json');
    expect(read.service).toBe('shadow-brain');
  });

  it('①c 库层：保存的回包也是 snake_case ⇒ ⇒ 归一后仍带值（不然存完输入框被清空）', async () => {
    const written = await setZitiClientConfig({
      enabled: true,
      identityPath: '/home/u/id.json',
      service: 'shadow-brain',
    });
    expect(written.identityPath).toBe('/home/u/id.json');
    expect(written.service).toBe('shadow-brain');
    expect(written.enabled).toBe(true);
  });

  it('①d 库层：producer 回 camelCase（界面自己的形状）⇒ ⇒ 也认（两种拼写都收）', async () => {
    invokeState.stored = {
      ...DEFAULT_ZITI_CLIENT_CONFIG,
      enabled: true,
      identityPath: '/home/u/camel.json',
    };
    const read = await getZitiClientConfig();
    expect(read.identityPath).toBe('/home/u/camel.json');
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
