import { afterEach, describe, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';

import { ttsService } from '../../../lib/tts';
import { MessageSpeakButton } from '../MessageSpeakButton';

// tts.ts 内部策略（大脑腿 → Web Speech 兜底、哪些错误不降级）由
// src/lib/__tests__/tts.test.ts 钉死；**这一层只钉按钮与服务的接缝**：
// 按下确实调了 speak、参数逐字、再按一次确实 stop、失败确实出声。
const i18nState = vi.hoisted(() => ({ language: 'zh-CN' }));

vi.mock('react-i18next', () => ({
  useTranslation: () => ({
    t: (key: string) => key,
    i18n: i18nState,
  }),
}));

vi.mock('../../../lib/tts', () => ({
  ttsService: {
    speak: vi.fn(async () => undefined),
    stop: vi.fn(),
  },
}));

afterEach(() => {
  cleanup();
  vi.clearAllMocks();
  i18nState.language = 'zh-CN';
});

describe('MessageSpeakButton — 朗读按钮与服务接缝', () => {
  it('按下 ⇒ ttsService.speak 恰好一次，文本逐字、lang=zh-CN', async () => {
    render(<MessageSpeakButton text="回复一个字：好" />);

    fireEvent.click(screen.getByTestId('message-speak'));

    await waitFor(() => {
      expect(ttsService.speak).toHaveBeenCalledTimes(1);
    });
    expect(ttsService.speak).toHaveBeenCalledWith('回复一个字：好', {
      lang: 'zh-CN',
    });
  });

  it('en 界面 ⇒ 兜底腿按 en-US 选音色（zh 前缀规则的另一侧分支）', async () => {
    i18nState.language = 'en-US';
    render(<MessageSpeakButton text="hello" />);

    fireEvent.click(screen.getByTestId('message-speak'));

    await waitFor(() => {
      expect(ttsService.speak).toHaveBeenCalledTimes(1);
    });
    expect(ttsService.speak).toHaveBeenCalledWith('hello', { lang: 'en-US' });
  });

  it('朗读中再按 ⇒ stop 恰好一次，结束后按钮复位', async () => {
    let release: () => void = () => {};
    (ttsService.speak as ReturnType<typeof vi.fn>).mockImplementation(
      () =>
        new Promise<void>((resolve) => {
          release = resolve;
        }),
    );

    render(<MessageSpeakButton text="长文本" />);
    const btn = screen.getByTestId('message-speak');

    fireEvent.click(btn);
    await waitFor(() => {
      expect(ttsService.speak).toHaveBeenCalledTimes(1);
    });
    // 第二次按 = 停止（title 已切成 stopSpeaking ⇒ 图标态真的翻过去）。
    await waitFor(() => {
      expect(btn.getAttribute('title')).toBe('conversation.stopSpeaking');
    });
    fireEvent.click(btn);
    expect(ttsService.stop).toHaveBeenCalledTimes(1);

    release();
    await waitFor(() => {
      expect(btn.getAttribute('title')).toBe('conversation.speak');
    });
  });

  it('speak 抛（网络/门禁类不降级的错误）⇒ console.warn 出真因', async () => {
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => undefined);
    (ttsService.speak as ReturnType<typeof vi.fn>).mockRejectedValue(
      new Error('HTTP 500: boom'),
    );

    render(<MessageSpeakButton text="任何文本" />);
    fireEvent.click(screen.getByTestId('message-speak'));

    await waitFor(() => {
      expect(warn).toHaveBeenCalled();
    });
    expect(String(warn.mock.calls[0][1])).toContain('HTTP 500');
    warn.mockRestore();
  });
});
