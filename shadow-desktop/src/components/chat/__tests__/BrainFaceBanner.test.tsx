// @vitest-environment jsdom
/**
 * 「端脑面没起来」必须**说出来** —— 而且要带真实原因。
 *
 * ⚠️ 这一条是 2026-11-02 那次真事故的形状：桌面端自己的端脑面绑不上
 * 60080（端口被一台独立端脑服务器占着）⇒ ⇒ 前端照常连 60080 ⇒ ⇒ 连上
 * 的是**别人的大脑** ⇒ ⇒ 用户的对话跑进了陌生的大脑 ⇒ ⇒ 界面上只剩
 * 端脑吐的那句「Failed to get models: error sending request for url
 * (http://127.0.0.1:56334/v1/models)」⇒ ⇒ 没人知道桌面端的大脑压根
 * 没上线。
 *
 * ⇒ 所以这里钉住三件事：
 * ① 端脑面起不来 ⇒ **必须出横幅**；
 * ② 横幅里要有**真实原因**（系统错误原文）；
 * ③ 自己的大脑在线 / 还在启动 / 读不到状态 ⇒ **不许出**（否则每次启动
 *    都闪一下红，红到没人看 ⇒ 真出事也没人看）。
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';

const faceState = vi.hoisted(() => ({
  status: null as unknown,
}));

vi.mock('react-i18next', () => ({
  useTranslation: () => ({
    t: (key: string, opts?: Record<string, unknown>) =>
      opts ? `${key}|${String(opts.addr ?? '')}` : key,
  }),
}));

vi.mock('../../../lib/tauriSafe', () => ({
  safeInvoke: async (cmd: string) => {
    if (cmd === 'get_brain_face_status') return faceState.status;
    throw new Error('unexpected command: ' + cmd);
  },
}));

import { BrainFaceBanner } from '../BrainFaceBanner';

beforeEach(() => {
  faceState.status = null;
});

describe('BrainFaceBanner', () => {
  it('① 端脑面被别人占着 ⇒ 必须出横幅', async () => {
    faceState.status = {
      state: 'conflict',
      addr: '127.0.0.1:60080',
      error: 'os error 10048',
      owned: false,
    };
    render(<BrainFaceBanner />);
    await waitFor(() => {
      expect(screen.getByTestId('brain-face-banner')).toBeTruthy();
    });
  });

  it('② 横幅里要有真实原因（不许只说「出错了」）', async () => {
    faceState.status = {
      state: 'conflict',
      addr: '127.0.0.1:60080',
      error: '通常每个套接字地址(协议/网络地址/端口)只允许使用一次。 (os error 10048)',
      owned: false,
    };
    render(<BrainFaceBanner />);
    await waitFor(() => {
      expect(screen.getByTestId('brain-face-error').textContent).toContain('os error 10048');
    });
  });

  it('③ 自己的大脑在线 ⇒ 不许出横幅', async () => {
    faceState.status = {
      state: 'listening',
      addr: '127.0.0.1:60080',
      error: null,
      owned: true,
    };
    render(<BrainFaceBanner />);
    await waitFor(() => {
      expect(screen.queryByTestId('brain-face-banner')).toBeNull();
    });
  });

  it('④ 还在启动 ⇒ 不许出横幅（否则每次启动都闪一下红）', async () => {
    faceState.status = {
      state: 'starting',
      addr: '127.0.0.1:60080',
      error: null,
      owned: false,
    };
    render(<BrainFaceBanner />);
    await waitFor(() => {
      expect(screen.queryByTestId('brain-face-banner')).toBeNull();
    });
  });

  it('⑤ 读不到状态 ⇒ 不许出横幅，也不许炸（web 构建）', async () => {
    faceState.status = null;
    render(<BrainFaceBanner />);
    await waitFor(() => {
      expect(screen.queryByTestId('brain-face-banner')).toBeNull();
    });
  });

  it('⑥ 绑定失败（不是端口被占）也要说 —— 但要说清是哪种', async () => {
    faceState.status = {
      state: 'failed',
      addr: '127.0.0.1:60080',
      error: 'permission denied',
      owned: false,
    };
    render(<BrainFaceBanner />);
    await waitFor(() => {
      const banner = screen.getByTestId('brain-face-banner');
      expect(banner.textContent).toContain('brainFace.failed');
      expect(banner.textContent).toContain('127.0.0.1:60080');
    });
  });
});
