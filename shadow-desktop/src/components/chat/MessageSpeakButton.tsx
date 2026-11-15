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
 */
export function MessageSpeakButton({ text }: { text: string }) {
  const { t, i18n } = useTranslation();
  const [speaking, setSpeaking] = useState(false);
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
    try {
      // lang 只影响 Web Speech 兜底腿的音色选择：zh* → zh-CN，其余 en-US。
      const lang = (i18n.language ?? 'zh-CN').toLowerCase().startsWith('zh')
        ? 'zh-CN'
        : 'en-US';
      await ttsService.speak(text, { lang });
    } catch (e) {
      console.warn('[tts] read aloud failed:', e);
    } finally {
      if (mounted.current) setSpeaking(false);
    }
  };

  const label = t(speaking ? 'conversation.stopSpeaking' : 'conversation.speak');

  return (
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
  );
}
