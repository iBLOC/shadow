import { openaiClient } from './openaiClient';
import { probeDeviceAudio } from './deviceAudio';

/**
 * TTS (Text-to-Speech) service for desktop.
 *
 * 架构 (synapse-first + multi-engine fallback):
 *
 * 1. **主路径** — OpenAI 兼容 `/v1/audio/speech` (端脑 → neuron TTS 模型)
 * 2. **Fallback 路径 (兜底)** — W3C Web Speech API (`window.speechSynthesis`)
 *    仅当 temporal lobe (Agent) 未配置 TTS 模型时启用:
 *    - 端脑 返回 `STRUCT_ERROR|5030|...` (LLM_NOT_REGISTERED)
 *    - 端脑 返回 404 (TTS capability not registered)
 *    - 检测到 STRUCT_ERROR 字符串
 *    其他错误 (网络失败、超时、401/500) 不降级，保留上层错误处理逻辑。
 *
 * 3. **静默失败** — 所有路径都不可用时，记录 console 但不阻塞调用者。
 *
 * **使用范围限制**: 本服务仅用于对话界面 (`ConversationPage`) 朗读 Agent
 * 返回内容。**陪伴模式 (WebRTC / Companion Mode)** 不绑定 TTS — 它走
 * 端脑的 WebRTC → Opus RTP 通道，要求端脑端必须实际有 TTS 模型，
 * 否则无法启动。
 *
 * 自动播放策略：受用户偏好控制（localStorage `shadow.tts.enabled`）
 */

export interface TtsOptions {
  /** Voice id (OpenAI compat: 'alloy', 'echo', 'fable', 'onyx', 'nova', 'shimmer') */
  voice?: string;
  /** TTS model (default 'tts-1') */
  model?: string;
  /** Speed 0.25 - 4.0 */
  speed?: number;
  /** BCP-47 language tag (用于 Web Speech fallback, 例如 'zh-CN' / 'en-US') */
  lang?: string;
  /**
   * 启用 Web Speech API fallback (默认 true)。仅当 temporal lobe agent
   * 没有配置 TTS 模型时 (端脑返回 5030/404) 自动降级。
   * 设为 false 可以强制只在主路径播放。
   */
  allowFallback?: boolean;
  /**
   * **用户执意要听**（点了「仍要朗读」）⇒ ⇒ 绕过设备静音判定。
   *
   * ⚠️ 默认 false ⇒ ⇒ 静音时仍然跳过（省 TTS 算力）⇒ ⇒ 只有用户点了那
   * 个开关才走这条路 ⇒ ⇒ 他既然要听，就别替他省这一次。
   */
  force?: boolean;
}

/**
 * **出声结果** —— 「真的出声了吗」与「因为静音被跳过」要**分开**。
 *
 * ⚠️ 为什么分开：静音跳过**不是失败**（是省算力的主动选择）⇒ ⇒ 但也
 * **不许静默**（用户点了朗读却什么都没发生 ⇒ ⇒ 界面得说清「设备静音，
 * 已跳过」）⇒ ⇒ 所以它既不是 `spoke`，也不是「失败」。
 */
export interface TtsSpeakResult {
  /** 真的出声了吗（音频播完了吗）。 */
  spoke: boolean;
  /** 因为**设备静音**而跳过 —— **一次合成请求都没发**（省 TTS 算力）。 */
  skippedMuted: boolean;
}

const DEFAULT_OPTIONS: Required<TtsOptions> = {
  voice: 'alloy',
  model: 'tts-1',
  speed: 1.0,
  lang: 'zh-CN',
  allowFallback: true,
  force: false,
};

const audioCache = new Map<string, string>();
let currentAudio: HTMLAudioElement | null = null;
let currentUtterance: SpeechSynthesisUtterance | null = null;

function cacheKey(text: string, opts: Required<TtsOptions>): string {
  return `${opts.model}|${opts.voice}|${opts.speed}|${text}`;
}

function isWebSpeechAvailable(): boolean {
  return (
    typeof window !== 'undefined' &&
    typeof window.speechSynthesis !== 'undefined' &&
    typeof window.SpeechSynthesisUtterance !== 'undefined'
  );
}

function pickWebSpeechVoice(lang: string): SpeechSynthesisVoice | null {
  if (!isWebSpeechAvailable()) return null;
  const voices = window.speechSynthesis.getVoices();
  return (
    voices.find((v) => v.lang === lang) ??
    voices.find((v) => v.lang.toLowerCase().startsWith(lang.toLowerCase().split('-')[0])) ??
    voices[0] ??
    null
  );
}

/**
 * 是否因为 "temporal lobe 没配置 TTS 模型" 而失败 — 这种情况下应降级到
 * Web Speech API。判定规则:
 * - HTTP 404: TTS 能力未注册
 * - HTTP 503: 服务不可用 (端脑 LLM 未配置也走 503)
 * - 错误消息包含 STRUCT_ERROR|5030| 或 NoRegisteredModel
 */
function isModelNotRegisteredError(err: unknown): boolean {
  if (!(err instanceof Error)) return false;
  const msg = err.message;
  // STRUCT_ERROR 字符串前缀 — 端脑的统一错误格式
  if (msg.includes('STRUCT_ERROR|5030|')) return true;
  if (msg.includes('STRUCT_ERROR|5020|')) return true;
  if (msg.includes('STRUCT_ERROR|5031|')) return true;
  if (msg.includes('NoRegisteredModel')) return true;
  if (msg.includes('NoRegisteredTts')) return true;
  if (msg.includes('LLM_NOT_REGISTERED')) return true;
  // HTTP 404: TTS capability not registered
  if (/\bHTTP\s+404\b/.test(msg)) return true;
  // HTTP 503 / 502 with "TTS" or "not configured"
  if (/\bHTTP\s+50[23]\b/.test(msg) && /not\s*configur/i.test(msg)) return true;
  return false;
}

export const ttsService = {
  isEnabled(): boolean {
    try {
      return localStorage.getItem('shadow.tts.enabled') !== 'false';
    } catch {
      return true;
    }
  },

  isAvailable(): boolean {
    if (isWebSpeechAvailable()) {
      const voices = window.speechSynthesis.getVoices();
      if (voices.length > 0) return true;
    }
    return true;
  },

  refreshWebSpeechVoices(): SpeechSynthesisVoice[] {
    if (!isWebSpeechAvailable()) return [];
    return window.speechSynthesis.getVoices();
  },

  stop(): void {
    if (currentAudio) {
      currentAudio.pause();
      currentAudio.src = '';
      currentAudio = null;
    }
    if (isWebSpeechAvailable() && window.speechSynthesis.speaking) {
      window.speechSynthesis.cancel();
      currentUtterance = null;
    }
  },

  isPlaying(): boolean {
    if (currentAudio !== null && !currentAudio.paused) return true;
    if (isWebSpeechAvailable() && window.speechSynthesis.speaking) return true;
    return false;
  },

  /**
   * Synthesize and play text.
   *
   * 主路径调用 OpenAI 兼容 `/v1/audio/speech`。失败时:
   * - 如果是 "temporal lobe 没配置 TTS 模型" 错误 AND 允许 fallback
     → 自动降级到 W3C Web Speech API (浏览器/OS 原生)
   * - 其他错误 → 抛出，保留上层错误对话框
   *
   * 仅用于对话界面朗读 — 陪伴模式 (WebRTC) 不走此服务。
   */
  async speak(text: string, options: TtsOptions = {}): Promise<TtsSpeakResult> {
    if (!this.isEnabled() || !text.trim()) {
      return { spoke: false, skippedMuted: false };
    }

    const opts: Required<TtsOptions> = { ...DEFAULT_OPTIONS, ...options };

    // ⚠️ **设备静音 ⇒ 一次合成都不发**（省 TTS 算力）——
    // 静音时合成出来的音频**没人听得见** ⇒ ⇒ 那一发纯属浪费。
    //
    // ⚠️ **「查不到」不跳**（probeDeviceAudio 的 known = false）⇒ ⇒ 宁可
    // 多合成一次，也绝不静默吞掉声音（那是「失败长得像成功」）。
    //
    // ⚠️ **force**（用户点「仍要朗读」）⇒ ⇒ **绕过这一整个判定** ⇒ ⇒
    // 用户执意要听 ⇒ ⇒ 替他省算力就是替他做主。
    if (!opts.force) {
      const deviceAudio = await probeDeviceAudio();
      if (deviceAudio.known && deviceAudio.muted) {
        console.warn(
          '[tts] device output is muted — read-aloud skipped (no synthesis request sent).',
        );
        return { spoke: false, skippedMuted: true };
      }
    }

    try {
      const key = cacheKey(text, opts);
      let url = audioCache.get(key);
      if (!url) {
        const blob = await openaiClient.speech({
          model: opts.model,
          input: text,
          voice: opts.voice,
          response_format: 'mp3',
          speed: opts.speed,
        });
        url = URL.createObjectURL(blob);
        audioCache.set(key, url);
      }
      const played = await this.playOpenAiAudio(url);
      return { spoke: played, skippedMuted: false };
    } catch (openaiErr) {
      // 仅当 temporal lobe 未配置 TTS 模型时降级；其他错误 (网络、401/500)
      // 不应静默吞掉，让上层错误对话框处理
      const isModelMissing = isModelNotRegisteredError(openaiErr);
      if (!opts.allowFallback || !isModelMissing) {
        console.warn(
          '[tts] OpenAI-compatible TTS failed (no fallback):',
          openaiErr instanceof Error ? openaiErr.message : openaiErr,
        );
        throw openaiErr;
      }
      console.warn(
        '[tts] TTS model not registered on telencephalon; falling back to Web Speech API.',
      );
    }

    if (!isWebSpeechAvailable()) {
      console.warn(
        '[tts] Web Speech API not available; TTS playback skipped (text:',
        text.slice(0, 32),
        '...)',
      );
      return { spoke: false, skippedMuted: false };
    }

    await this.playWebSpeech(text, opts.lang);
    return { spoke: true, skippedMuted: false };
  },

  playOpenAiAudio(url: string): Promise<boolean> {
    this.stop();

    return new Promise<boolean>((resolve) => {
      const audio = new Audio(url);
      audio.onended = () => {
        if (currentAudio === audio) currentAudio = null;
        resolve(true);
      };
      audio.onerror = () => {
        if (currentAudio === audio) currentAudio = null;
        resolve(false);
      };
      currentAudio = audio;
      audio.play().catch(() => {
        if (currentAudio === audio) currentAudio = null;
        resolve(false);
      });
    });
  },

  playWebSpeech(text: string, lang: string): Promise<boolean> {
    if (!isWebSpeechAvailable()) return Promise.resolve(false);

    window.speechSynthesis.cancel();

    return new Promise<boolean>((resolve) => {
      const utterance = new SpeechSynthesisUtterance(text);
      utterance.lang = lang;
      const voice = pickWebSpeechVoice(lang);
      if (voice) utterance.voice = voice;

      let resolved = false;
      let safetyTimeout: number | undefined;
      // ⚠️ **播完了（onend）与出错了（onerror）不是一回事** ⇒ ⇒ 结果要分开
      // 报出去（否则「没播出来」会被当成「播了」⇒ ⇒ 失败长得像成功）。
      const finalize = (spoke: boolean) => {
        if (resolved) return;
        resolved = true;
        if (safetyTimeout !== undefined) window.clearTimeout(safetyTimeout);
        if (currentUtterance === utterance) currentUtterance = null;
        resolve(spoke);
      };

      utterance.onend = () => finalize(true);
      utterance.onerror = () => finalize(false);
      // Some browsers (Chrome) stop firing events after ~15s; guard with a timeout.
      safetyTimeout = window.setTimeout(() => finalize(false), Math.max(text.length * 80, 30_000));

      currentUtterance = utterance;
      try {
        window.speechSynthesis.speak(utterance);
      } catch (e) {
        console.warn('[tts] speechSynthesis.speak threw:', e);
        finalize(false);
      }
    });
  },

  clearCache(): void {
    for (const url of audioCache.values()) {
      URL.revokeObjectURL(url);
    }
    audioCache.clear();
  },
};

export const __test_internals = {
  isWebSpeechAvailable,
  pickWebSpeechVoice,
  cacheKey,
  isModelNotRegisteredError,
};
