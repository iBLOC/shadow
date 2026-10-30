import { beforeEach, describe, expect, it, vi } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';

import { safeInvoke } from '../../../../lib/tauriSafe';
import { useIdentityStore } from '../../../../stores/identityStore';
import { IdentityPanel } from '../IdentityPanel';

vi.mock('../../../../lib/tauriSafe', () => ({
  safeInvoke: vi.fn(),
}));

/**
 * 「当前是谁」这一块的行为测试。
 *
 * 钉的是**语义**：
 * - 显示的是端脑报出来的身份（人 / 人格 / 设备）与**有效租户**；
 * - 导出走 **Tauri 命令**（账号密钥不上网络面）；
 * - 导入之后**强制重问端脑** —— 换了人 ⇒ 人格变了 ⇒ 租户也得跟着变；
 * - 导出失败要**说话**，不能静默。
 *
 * ⚠️ i18n 在测试里返回**键本身**（见 `tests/setup.ts` 的 mock）⇒ 断言
 * 用键名，不用文案。
 */
describe('IdentityPanel', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    useIdentityStore.setState({
      principal: 'principal:alice',
      persona: 'persona-ada',
      device: 'device-1',
      identified: true,
      tenantId: 'persona-ada',
      resolved: true,
      error: null,
    });
  });

  it('shows who this device is and which bucket it reads', () => {
    render(<IdentityPanel />);

    expect(screen.getByText('principal:alice')).toBeTruthy();
    expect(screen.getByText('device-1')).toBeTruthy();
    // 人格与租户是**同一个字符串**（端脑报出的人格就是记忆的桶）⇒
    // 它出现两次（一次在「人格」行，一次在「记忆桶」行）。
    expect(screen.getAllByText('persona-ada')).toHaveLength(2);
  });

  it('exports the account through the tauri command, not the http face', async () => {
    vi.mocked(safeInvoke).mockResolvedValue('exported-account-code');

    render(<IdentityPanel />);

    // 导出前**不显示**任何码 —— 它不该出现在还没点之前。
    expect(screen.queryByText('exported-account-code')).toBeNull();

    screen.getByRole('button', { name: /identity\.exportAction/ }).click();

    await waitFor(() => {
      expect(safeInvoke).toHaveBeenCalledWith('identity_export');
    });
    // 点了之后才显示。
    await waitFor(() => {
      expect(screen.getByText('exported-account-code')).toBeTruthy();
    });
  });

  it('says so when the export fails instead of failing silently', async () => {
    vi.mocked(safeInvoke).mockResolvedValue(null);

    render(<IdentityPanel />);

    screen.getByRole('button', { name: /identity\.exportAction/ }).click();

    await waitFor(() => {
      expect(screen.getByText('identity.exportFailed')).toBeTruthy();
    });
  });

  it('re-asks the endbrain after an import, because the persona changed', async () => {
    vi.mocked(safeInvoke).mockResolvedValue({ persona: 'persona-bob' });
    const resolve = vi.fn().mockResolvedValue('persona-bob');
    useIdentityStore.setState({ resolve });

    render(<IdentityPanel />);

    const input = screen.getByPlaceholderText('identity.importPlaceholder');
    // 用原生 setter 写值 —— React 受控输入不认直接赋值。
    const setter = Object.getOwnPropertyDescriptor(
      window.HTMLInputElement.prototype,
      'value',
    )?.set;
    setter?.call(input, 'someone-elses-code');
    input.dispatchEvent(new Event('input', { bubbles: true }));

    await waitFor(() => {
      expect(
        screen.getByRole('button', { name: /identity\.importAction/ }),
      ).not.toBeDisabled();
    });
    screen.getByRole('button', { name: /identity\.importAction/ }).click();

    await waitFor(() => {
      expect(safeInvoke).toHaveBeenCalledWith(
        'identity_import',
        expect.objectContaining({ code: 'someone-elses-code' }),
      );
    });
    // ⚠️ 关键：导入换了人 ⇒ 租户要跟着重算 ⇒ **强制**重问。
    expect(resolve).toHaveBeenCalledWith({ force: true });
  });
});
