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
    // ⚠️ **返回值形状要与真接口一致**（2026-11-16：`speak` 改回
    // `TtsSpeakResult`）⇒ ⇒ 替身回 `undefined` ⇒ ⇒ 按钮读
    // `result.skippedMuted` 会炸 ⇒ ⇒ 替身必须回真形状。
    speak: vi.fn(async () => ({ spoke: true, skippedMuted: false })),
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

  it('设备静音 ⇒ speak 回 skippedMuted ⇒ 界面**看得见**「已跳过」', async () => {
    (ttsService.speak as ReturnType<typeof vi.fn>).mockResolvedValue({
      spoke: false,
      skippedMuted: true,
    });

    render(<MessageSpeakButton text="任何文本" />);
    fireEvent.click(screen.getByTestId('message-speak'));

    await waitFor(() => {
      expect(screen.getByTestId('message-speak-skipped')).toBeInTheDocument();
    });
    // 文案走 i18n 键（测试里 `t` 直接回键名）。
    expect(screen.getByTestId('message-speak-skipped').textContent).toBe(
      'conversation.speakSkippedMuted',
    );
  });

  it('被跳过了 ⇒ 旁边出现「仍要朗读」开关 ⇒ 点它 ⇒ **强制出声**（force）', async () => {
    (ttsService.speak as ReturnType<typeof vi.fn>).mockResolvedValue({
      spoke: false,
      skippedMuted: true,
    });

    render(<MessageSpeakButton text="任何文本" />);
    fireEvent.click(screen.getByTestId('message-speak'));

    await waitFor(() => {
      expect(screen.getByTestId('message-speak-anyway')).toBeInTheDocument();
    });

    // ⚠️ **前置换掉**：第二次调用要走「强制」那条路 ⇒ ⇒ 替身得回真出声
    // ⇒ ⇒ 否则还是回 skippedMuted ⇒ ⇒ 提示不会消失（看着像没点动）。
    (ttsService.speak as ReturnType<typeof vi.fn>).mockResolvedValue({
      spoke: true,
      skippedMuted: false,
    });
    fireEvent.click(screen.getByTestId('message-speak-anyway'));

    await waitFor(() => {
      expect(ttsService.speak).toHaveBeenCalledTimes(2);
    });
    // ⚠️ **force 必须逐字带上** ⇒ ⇒ 否则「仍要朗读」还是会被静音判定拦下
    // ⇒ ⇒ 按钮看着能点、实际还是没声（失败长得像成功）。
    expect(ttsService.speak).toHaveBeenLastCalledWith('任何文本', {
      lang: 'zh-CN',
      force: true,
    });
    // 强制出声成功了 ⇒ ⇒ 那句提示不许一直挂着。
    await waitFor(() => {
      expect(screen.queryByTestId('message-speak-skipped')).toBeNull();
    });
  });

  it('没静音 ⇒ 不出现跳过提示（不许一直挂着一句）', async () => {
    // ⚠️ **前置写死** —— `clearAllMocks` 只清调用记录、**不清实现**
    // ⇒ ⇒ 上一条用例的「静音」实现会漏过来 ⇒ ⇒ 这一条必须自己摆好。
    (ttsService.speak as ReturnType<typeof vi.fn>).mockResolvedValue({
      spoke: true,
      skippedMuted: false,
    });

    render(<MessageSpeakButton text="任何文本" />);
    fireEvent.click(screen.getByTestId('message-speak'));

    await waitFor(() => {
      expect(ttsService.speak).toHaveBeenCalledTimes(1);
    });
    expect(screen.queryByTestId('message-speak-skipped')).toBeNull();
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
