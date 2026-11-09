import { beforeEach, describe, expect, it, vi } from 'vitest';

import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { TelencephalonStatusPage } from '../../src/pages/TelencephalonStatusPage';
import { useTelencephalonStore } from '../../src/stores/telencephalonStore';
import { telencephalonClient } from '../../src/lib/telencephalonClient';

// 读门钥匙：测试里不递（门在端脑那边，这里只验 UI 行为）。
vi.mock('../../src/lib/readDoorHeaders', () => ({
  readDoorHeaders: async () => ({}),
}));

const STATUS_BODY = {
  neuron_reachable: true,
  actual_models_count: 1,
  available_models: [{ id: 'm1', available: true }],
  info: null,
  hint: '',
};

/**
 * 端脑地址的**真入口**。
 *
 * ⚠️ 以前 useTelencephalonStore.setBaseUrl 在 src/ 里**零调用方**
 * ⇒ ⇒ 用户配不了端脑地址 ⇒ ⇒ 而界面写着「端脑地址在设置里可改」
 * ⇒ ⇒ **界面在说谎**（失败长得像成功：地址不可配，但一切看起来正常）。
 */
describe('TelencephalonStatusPage —— 端脑地址是真的能改的', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.stubGlobal(
      'fetch',
      vi.fn(async () => ({
        ok: true,
        status: 200,
        json: async () => STATUS_BODY,
      })),
    );
    useTelencephalonStore.setState({
      connection: { baseUrl: 'http://127.0.0.1:60080', apiKey: '' },
    });
    telencephalonClient.setBaseUrl('http://127.0.0.1:60080');
    telencephalonClient.setApiKey('');
  });

  it('渲染出地址输入框，初值＝store 里的地址', async () => {
    render(<TelencephalonStatusPage />);
    const input = (await screen.findByTestId('telencephalon-base-url-input')) as HTMLInputElement;
    expect(input.value).toBe('http://127.0.0.1:60080');
  });

  it('改地址并保存 ⇒ store 与 client **两处同时**更新（尾斜杠被规范化掉）', async () => {
    render(<TelencephalonStatusPage />);
    const input = (await screen.findByTestId('telencephalon-base-url-input')) as HTMLInputElement;

    fireEvent.change(input, { target: { value: 'http://10.0.0.9:7000/' } });
    fireEvent.click(screen.getByTestId('telencephalon-base-url-save'));

    await waitFor(() => {
      expect(useTelencephalonStore.getState().connection.baseUrl).toBe('http://10.0.0.9:7000');
    });
    // ⚠️ **client 也必须同步** —— 否则 store 里是新地址、client 还打老地址
    // ⇒ ⇒ 「一半连上一半连不上」。
    expect(telencephalonClient.getBaseUrl()).toBe('http://10.0.0.9:7000');
    expect(screen.getByTestId('telencephalon-base-url-saved')).toBeInTheDocument();
  });

  it('非法地址 ⇒ 说出原因，且 **store 一个字节都没变**（写不进 ≠ 写进了）', async () => {
    render(<TelencephalonStatusPage />);
    const input = (await screen.findByTestId('telencephalon-base-url-input')) as HTMLInputElement;

    fireEvent.change(input, { target: { value: '我的端脑' } });
    fireEvent.click(screen.getByTestId('telencephalon-base-url-save'));

    await waitFor(() => {
      expect(screen.getByTestId('telencephalon-base-url-error')).toBeInTheDocument();
    });
    expect(screen.getByTestId('telencephalon-base-url-error').textContent).toContain('合法的 URL');
    // ⚠️ **地址没被写进去** —— 不许「看着像保存了」。
    expect(useTelencephalonStore.getState().connection.baseUrl).toBe('http://127.0.0.1:60080');
    expect(telencephalonClient.getBaseUrl()).toBe('http://127.0.0.1:60080');
    // ⚠️ 失败**不许**被说成「已保存」。
    expect(screen.queryByTestId('telencephalon-base-url-saved')).not.toBeInTheDocument();
  });

  it('孪生：合法地址 ⇒ 没有错误条', async () => {
    render(<TelencephalonStatusPage />);
    const input = (await screen.findByTestId('telencephalon-base-url-input')) as HTMLInputElement;

    fireEvent.change(input, { target: { value: 'http://10.0.0.9:7000' } });
    fireEvent.click(screen.getByTestId('telencephalon-base-url-save'));

    await waitFor(() => {
      expect(screen.getByTestId('telencephalon-base-url-saved')).toBeInTheDocument();
    });
    expect(screen.queryByTestId('telencephalon-base-url-error')).not.toBeInTheDocument();
  });

  // ⚠️ **影子锁** —— 端脑开了 shadow.api_key 时读门要它；web 形态没有 Tauri，
  // 拿不到 admin.key ⇒ ⇒ 「没有别的地方能配」⇒ ⇒ 这里就是**唯一**的入口。
  it('渲染出影子锁输入框（默认掩码），初值＝store 里的钥匙', async () => {
    useTelencephalonStore.setState({
      connection: { baseUrl: 'http://127.0.0.1:60080', apiKey: 'sk-existing' },
    });
    render(<TelencephalonStatusPage />);
    const input = (await screen.findByTestId('telencephalon-api-key-input')) as HTMLInputElement;
    expect(input.value).toBe('sk-existing');
    expect(input.type).toBe('password');
  });

  it('配钥匙 ⇒ store 与 client **两处同时**生效（两发同时递出去）', async () => {
    render(<TelencephalonStatusPage />);
    const input = (await screen.findByTestId('telencephalon-api-key-input')) as HTMLInputElement;

    fireEvent.change(input, { target: { value: '  sk-new  ' } });
    fireEvent.click(screen.getByTestId('telencephalon-api-key-save'));

    await waitFor(() => {
      expect(useTelencephalonStore.getState().connection.apiKey).toBe('sk-new');
    });
    // ⚠️ **client 也必须同步** —— 否则 store 里有钥匙、client 递的仍是旧的
    // ⇒ ⇒ 端脑一开门就 401（「配了却还是被挡」＝ 失败长得像成功）。
    expect(telencephalonClient.getApiKey()).toBe('sk-new');
    expect(screen.getByTestId('telencephalon-api-key-saved')).toBeInTheDocument();
  });

  it('撤掉钥匙（存空串）⇒ 两处都清空（端脑没开门时不需要钥匙）', async () => {
    useTelencephalonStore.setState({
      connection: { baseUrl: 'http://127.0.0.1:60080', apiKey: 'sk-old' },
    });
    telencephalonClient.setApiKey('sk-old');
    render(<TelencephalonStatusPage />);
    const input = (await screen.findByTestId('telencephalon-api-key-input')) as HTMLInputElement;

    fireEvent.change(input, { target: { value: '' } });
    fireEvent.click(screen.getByTestId('telencephalon-api-key-save'));

    await waitFor(() => {
      expect(useTelencephalonStore.getState().connection.apiKey).toBe('');
    });
    // ⚠️ client 的语义：**空钥匙 ⇒ undefined**（⇒ 那个头**不递**）
    // ⇒ ⇒ 端脑没开门时，客户端一个多余的 X-Shadow-Key 都不发。
    expect(telencephalonClient.getApiKey()).toBeUndefined();
  });

  it('点「显示」才明文（默认掩码，别把钥匙摆在屏幕上）', async () => {
    useTelencephalonStore.setState({
      connection: { baseUrl: 'http://127.0.0.1:60080', apiKey: 'sk-existing' },
    });
    render(<TelencephalonStatusPage />);
    const input = (await screen.findByTestId('telencephalon-api-key-input')) as HTMLInputElement;
    expect(input.type).toBe('password');

    fireEvent.click(screen.getByTestId('telencephalon-api-key-toggle'));

    await waitFor(() => {
      expect((screen.getByTestId('telencephalon-api-key-input') as HTMLInputElement).type).toBe('text');
    });
  });
});
