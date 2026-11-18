import { useEffect, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Volume2, VolumeX } from 'lucide-react';

import { ttsService } from '../../lib/tts';

/**
 * 助手消息的「朗读」按钮 —— TTS 兜底策略在**最前端 UI** 的落点。
 *
 * ⚠️ 产品裁定（2026-11-13）：**TTS 模型没设置 ⇒ 系统默认 TTS 兜底**，
 * 移动端与桌面端同一策略。这里只负责按下并调 `ttsService.speak`：
 * - 大脑 neuron 注册了 TTS 引擎 ⇒ 走 `/v1/audio/speech` 真音频；
 * - 没配置（`NoRegisteredModel` / 404 / STRUCT_ERROR|5030）⇒ tts.ts
 *   自动降级到 **Web Speech API（系统原生语音）**；
 * - 网络 / 门禁类错误**不降级**（`tts.ts` 设计上向上抛）—— 这里
 *   `console.warn` 出真因：朗读是对话的附属，既不许静默吞失败，
 *   也不该弹红条打断阅读。
 *
 * ⚠️ **设备静音 ⇒ 跳过**（2026-11-16）：设备静音时合成出来的音频**没人
 * 听得见** ⇒ ⇒ 那一发纯属浪费 ⇒ ⇒ `tts.ts` **一次请求都不发** ⇒ ⇒
 * 这里收到 `skippedMuted` ⇒ ⇒ **必须让用户看见**：点了朗读却毫无动静
 * ⇒ ⇒ 不说一声 ⇒ ⇒ 就是「失败长得像成功」。
 */
export function MessageSpeakButton({ text }: { text: string }) {
  const { t, i18n } = useTranslation();
  const [speaking, setSpeaking] = useState(false);
  const [skippedMuted, setSkippedMuted] = useState(false);
  const mounted = useRef(true);

  useEffect(() => {
    return () => {
      mounted.current = false;
    };
  }, []);

  const onClick = async () => {
    if (speaking) {
      ttsService.stop();
      setSpeaking(false);
      return;
    }
    setSpeaking(true);
    setSkippedMuted(false);
    try {
      // lang 只影响 Web Speech 兜底腿的音色选择：zh* → zh-CN，其余 en-US。
      const lang = (i18n.language ?? 'zh-CN').toLowerCase().startsWith('zh')
        ? 'zh-CN'
        : 'en-US';
      const result = await ttsService.speak(text, { lang });
      // ⚠️ **静音跳过要看得见**（见文件头注释）—— 跳过不是失败，但也
      // 不许静默。
      if (result?.skippedMuted && mounted.current) {
        setSkippedMuted(true);
      }
    } catch (e) {
      console.warn('[tts] read aloud failed:', e);
    } finally {
      if (mounted.current) setSpeaking(false);
    }
  };

  /**
   * **「仍要朗读」** —— 用户点了那个开关 ⇒ ⇒ 绕过静音判定，强制出声。
   *
   * ⚠️ **为什么要有这一格**：跳过**不是失败** ⇒ ⇒ 文字还在屏上 ⇒ ⇒ 用户
   * 可能真的想听这一条 ⇒ ⇒ 得给他一条**能出声的路**（否则「跳过」就变成
   * 「吞掉了」）。
   */
  const speakAnyway = async () => {
    setSpeaking(true);
    try {
      const lang = (i18n.language ?? 'zh-CN').toLowerCase().startsWith('zh')
        ? 'zh-CN'
        : 'en-US';
      // ⚠️ **force** ⇒ ⇒ 用户既然点了，就别替他省这一次算力。
      await ttsService.speak(text, { lang, force: true });
      if (mounted.current) setSkippedMuted(false);
    } catch (e) {
      console.warn('[tts] forced read aloud failed:', e);
    } finally {
      if (mounted.current) setSpeaking(false);
    }
  };

  const label = t(speaking ? 'conversation.stopSpeaking' : 'conversation.speak');

  return (
    <span className="inline-flex items-center gap-1">
      <button
        type="button"
        onClick={() => {
          void onClick();
        }}
        title={label}
        aria-label={label}
        data-testid="message-speak"
        className="rounded p-0.5 text-muted-foreground hover:text-foreground"
      >
        {speaking ? <VolumeX size={12} /> : <Volume2 size={12} />}
      </button>
      {skippedMuted && (
        <span className="inline-flex items-center gap-1">
          <span
            role="status"
            data-testid="message-speak-skipped"
            className="text-[10px] text-muted-foreground"
          >
            {t('conversation.speakSkippedMuted')}
          </span>
          {/* ⚠️ **开关** —— 用户 2026-11-16 原话：「回复的时候给个开关提示
              如果用户执意要打开也可以打开」⇒ ⇒ 点它 ⇒ ⇒ 强制出声。 */}
          <button
            type="button"
            data-testid="message-speak-anyway"
            onClick={() => {
              void speakAnyway();
            }}
            className="rounded px-1 text-[10px] text-foreground underline"
          >
            {t('conversation.speakAnyway')}
          </button>
        </span>
      )}
    </span>
  );
}
