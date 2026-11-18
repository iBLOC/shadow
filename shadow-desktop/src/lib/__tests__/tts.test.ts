import { beforeEach, describe, expect, it, vi, afterEach } from 'vitest';

const mockSpeech = vi.fn();
const mockClearErrorDialog = vi.fn();

// ⚠️ **设备静音探针的替身** —— 真实现问 Rust（`device_audio_state`）
// ⇒ ⇒ 这里替身可改 ⇒ ⇒ 「静音时零合成请求」那一格才钉得住。
// ⚠️ 默认值是「**查不到**」（不是「有声音」）⇒ ⇒ 网页版那一格的行为
// 就是这样 ⇒ ⇒ 既有判据不用改口径。
const mockProbeDeviceAudio = vi.hoisted(() =>
  vi.fn(async () => ({ muted: false, known: false })),
);

vi.mock('../openaiClient', () => ({
  openaiClient: {
    speech: (...args: unknown[]) => mockSpeech(...args),
  },
}));

vi.mock('../deviceAudio', () => ({
  probeDeviceAudio: (...args: unknown[]) => mockProbeDeviceAudio(...args),
  DEVICE_AUDIO_UNKNOWN: { muted: false, known: false },
}));

vi.mock('../../stores/errorDialogStore', () => ({
  useErrorDialogStore: {
    getState: () => ({ show: vi.fn(), clear: mockClearErrorDialog }),
  },
}));

class MockUtterance {
  text: string;
  lang = '';
  voice: unknown = null;
  onend: (() => void) | null = null;
  onerror: (() => void) | null = null;
  constructor(text: string) {
    this.text = text;
  }
}

interface MockSpeechSynthesis {
  speaking: boolean;
  cancel: ReturnType<typeof vi.fn>;
  speak: ReturnType<typeof vi.fn>;
  getVoices: ReturnType<typeof vi.fn>;
}

let mockSpeechSynthesis: MockSpeechSynthesis;
let mockVoices: Array<{ lang: string; name: string }>;

beforeEach(() => {
  mockVoices = [
    { lang: 'zh-CN', name: 'Tingting' },
    { lang: 'en-US', name: 'Alex' },
  ];
  mockSpeechSynthesis = {
    speaking: false,
    cancel: vi.fn(),
    speak: vi.fn((utterance: MockUtterance) => {
      setTimeout(() => utterance.onend?.(), 5);
    }),
    getVoices: vi.fn(() => mockVoices),
  };
  // Mutate the existing jsdom window rather than replacing it via spread:
  // a `{ ...window, ... }` plain object loses the prototype getters for
  // `localStorage` and friends, which makes `localStorage.clear()` throw.
  (globalThis as any).window.speechSynthesis = mockSpeechSynthesis;
  (globalThis as any).window.SpeechSynthesisUtterance = MockUtterance;
  (globalThis as any).SpeechSynthesisUtterance = MockUtterance;
  if (!globalThis.URL.createObjectURL) {
    globalThis.URL.createObjectURL = vi.fn(() => 'blob:mock-url');
  }
  if (!globalThis.URL.revokeObjectURL) {
    globalThis.URL.revokeObjectURL = vi.fn();
  }
  class MockAudio {
    src = '';
    paused = true;
    onended: (() => void) | null = null;
    onerror: (() => void) | null = null;
    play() {
      setTimeout(() => this.onended?.(), 5);
      return Promise.resolve();
    }
    pause() {
      this.paused = true;
    }
  }
  (globalThis as any).Audio = MockAudio;
  (globalThis as any).window.Audio = MockAudio;
  mockSpeech.mockReset();
  mockProbeDeviceAudio.mockReset();
  mockProbeDeviceAudio.mockResolvedValue({ muted: false, known: false });
  localStorage.clear();
});

afterEach(() => {
  vi.restoreAllMocks();
});

describe('ttsService — Web Speech fallback', () => {
  it('uses OpenAI path when telencephalon TTS succeeds', async () => {
    mockSpeech.mockResolvedValue(new Blob(['mp3-data'], { type: 'audio/mpeg' }));

    const { ttsService } = await import('../tts');
    await ttsService.speak('你好');

    expect(mockSpeech).toHaveBeenCalledOnce();
    expect(mockSpeechSynthesis.speak).not.toHaveBeenCalled();
  });

  it('falls back to Web Speech when telencephalon returns STRUCT_ERROR|5030|', async () => {
    const structErrBody =
      'STRUCT_ERROR|5030|{"code":5030,"hint":"configure_model","message":"LLM_NOT_REGISTERED","user_message":"驱动模型未配置","options":[]}|';
    mockSpeech.mockRejectedValue(new Error(`HTTP 400: ${structErrBody}`));

    vi.resetModules();
    const { ttsService } = await import('../tts');
    await ttsService.speak('你好');

    expect(mockSpeech).toHaveBeenCalledOnce();
    expect(mockSpeechSynthesis.cancel).toHaveBeenCalled();
    expect(mockSpeechSynthesis.speak).toHaveBeenCalledOnce();
  });

  it('falls back to Web Speech when telencephalon returns HTTP 404 (TTS not registered)', async () => {
    mockSpeech.mockRejectedValue(new Error('HTTP 404: Not Found'));

    const { ttsService } = await import('../tts');
    await ttsService.speak('hello');

    await new Promise((r) => setTimeout(r, 20));
    expect(mockSpeechSynthesis.speak).toHaveBeenCalledOnce();
  });

  it('falls back to Web Speech when NoRegisteredModel is in error message', async () => {
    mockSpeech.mockRejectedValue(new Error('HTTP 503: NoRegisteredModel: TTS not loaded'));

    const { ttsService } = await import('../tts');
    await ttsService.speak('hello');

    await new Promise((r) => setTimeout(r, 20));
    expect(mockSpeechSynthesis.speak).toHaveBeenCalledOnce();
  });

  it('does NOT fall back on network errors (rethrows)', async () => {
    mockSpeech.mockRejectedValue(new Error('Network error: fetch failed'));

    const { ttsService } = await import('../tts');
    await expect(ttsService.speak('hello')).rejects.toThrow('Network error');

    expect(mockSpeechSynthesis.speak).not.toHaveBeenCalled();
  });

  it('does NOT fall back on HTTP 500 (rethrows)', async () => {
    mockSpeech.mockRejectedValue(new Error('HTTP 500: Internal Server Error'));

    const { ttsService } = await import('../tts');
    await expect(ttsService.speak('hello')).rejects.toThrow(/500/);

    expect(mockSpeechSynthesis.speak).not.toHaveBeenCalled();
  });

  it('respects allowFallback=false (no fallback even on 5030)', async () => {
    const structErrBody =
      'STRUCT_ERROR|5030|{"code":5030,"hint":"configure_model"}|';
    mockSpeech.mockRejectedValue(new Error(`HTTP 400: ${structErrBody}`));

    const { ttsService } = await import('../tts');
    await expect(ttsService.speak('hello', { allowFallback: false })).rejects.toThrow();

    expect(mockSpeechSynthesis.speak).not.toHaveBeenCalled();
  });

  it('skips Web Speech if browser does not support it', async () => {
    delete (globalThis as any).window.speechSynthesis;

    const structErrBody =
      'STRUCT_ERROR|5030|{"code":5030,"hint":"configure_model"}|';
    mockSpeech.mockRejectedValue(new Error(`HTTP 400: ${structErrBody}`));

    const { ttsService } = await import('../tts');
    // ⚠️ **口径变了**（2026-11-16）：`speak` 现在回 `TtsSpeakResult`
    // ⇒ ⇒ 这一格从「回 undefined」改成「回**没出声但不是静音跳过**」
    // （Web Speech 不可用 ⇒ 兜底腿也没了 ⇒ 既没出声，也不是静音跳过）。
    await expect(ttsService.speak('hello')).resolves.toEqual({
      spoke: false,
      skippedMuted: false,
    });
  });

  it('respects user-disabled preference', async () => {
    localStorage.setItem('shadow.tts.enabled', 'false');

    const { ttsService } = await import('../tts');
    await ttsService.speak('hello');

    expect(mockSpeech).not.toHaveBeenCalled();
    expect(mockSpeechSynthesis.speak).not.toHaveBeenCalled();
  });

  it('uses cache on repeat OpenAI-path calls', async () => {
    mockSpeech.mockResolvedValue(new Blob(['mp3-data'], { type: 'audio/mpeg' }));

    const { ttsService } = await import('../tts');
    await ttsService.speak('repeat me');
    await ttsService.speak('repeat me');
    await ttsService.speak('repeat me');

    expect(mockSpeech).toHaveBeenCalledOnce();
  });
});

describe('ttsService — 设备静音 ⇒ 不烧 TTS 算力', () => {
  it('静音 ⇒ **一次合成请求都不发**（省算力）且结果说清是「静音跳过」', async () => {
    mockProbeDeviceAudio.mockResolvedValue({ muted: true, known: true });
    mockSpeech.mockResolvedValue(new Blob(['mp3-data'], { type: 'audio/mpeg' }));

    vi.resetModules();
    const { ttsService } = await import('../tts');
    const result = await ttsService.speak('静音这轮');

    // ⚠️ **零请求**才是这一刀的目的（省 TTS 算力）—— 不是「少放一次」。
    expect(mockSpeech).not.toHaveBeenCalled();
    expect(mockSpeechSynthesis.speak).not.toHaveBeenCalled();
    expect(result).toEqual({ spoke: false, skippedMuted: true });
  });

  it('「查不到」⇒ **照常合成**（宁可多烧一次，也绝不静默吞掉声音）', async () => {
    mockProbeDeviceAudio.mockResolvedValue({ muted: false, known: false });
    mockSpeech.mockResolvedValue(new Blob(['mp3-data'], { type: 'audio/mpeg' }));

    vi.resetModules();
    const { ttsService } = await import('../tts');
    const result = await ttsService.speak('查不到这轮');

    expect(mockSpeech).toHaveBeenCalledOnce();
    expect(result.skippedMuted).toBe(false);
  });

  it('有声音 ⇒ 照常合成（静音跳过不许变成常态）', async () => {
    mockProbeDeviceAudio.mockResolvedValue({ muted: false, known: true });
    mockSpeech.mockResolvedValue(new Blob(['mp3-data'], { type: 'audio/mpeg' }));

    vi.resetModules();
    const { ttsService } = await import('../tts');
    const result = await ttsService.speak('有声音这轮');

    expect(mockSpeech).toHaveBeenCalledOnce();
    expect(result.skippedMuted).toBe(false);
  });

  it('「仍要朗读」（force）⇒ **照常合成**（用户执意要听 ⇒ 别替他省这一次）', async () => {
    mockProbeDeviceAudio.mockResolvedValue({ muted: true, known: true });
    mockSpeech.mockResolvedValue(new Blob(['mp3-data'], { type: 'audio/mpeg' }));

    vi.resetModules();
    const { ttsService } = await import('../tts');
    const result = await ttsService.speak('还是要听', { force: true });

    // ⚠️ **force 必须真的绕过探针** ⇒ ⇒ 不是「查到了但没跳」⇒ ⇒ 探针
    // 压根不该被问。
    expect(mockProbeDeviceAudio).not.toHaveBeenCalled();
    expect(mockSpeech).toHaveBeenCalledOnce();
    expect(result.skippedMuted).toBe(false);
  });

  it('静音 ⇒ **连 Web Speech 兜底都不走**（没人听得见 ⇒ 一律不发声）', async () => {
    mockProbeDeviceAudio.mockResolvedValue({ muted: true, known: true });
    mockSpeech.mockRejectedValue(new Error('HTTP 404: Not Found'));

    vi.resetModules();
    const { ttsService } = await import('../tts');
    await ttsService.speak('静音兜底这轮');

    expect(mockSpeech).not.toHaveBeenCalled();
    expect(mockSpeechSynthesis.speak).not.toHaveBeenCalled();
  });
});

describe('ttsService — Web Speech voice selection', () => {
  it('picks voice with exact lang match', async () => {
    const { __test_internals } = await import('../tts');
    const voice = __test_internals.pickWebSpeechVoice('zh-CN');
    expect(voice).not.toBeNull();
    expect(voice?.lang).toBe('zh-CN');
  });

  it('falls back to language prefix match', async () => {
    const { __test_internals } = await import('../tts');
    const voice = __test_internals.pickWebSpeechVoice('zh-TW');
    expect(voice).not.toBeNull();
    expect(voice?.lang).toMatch(/^zh/);
  });

  it('returns null when speechSynthesis is unavailable', async () => {
    delete (globalThis as any).window.speechSynthesis;
    const { __test_internals } = await import('../tts');
    expect(__test_internals.pickWebSpeechVoice('zh-CN')).toBeNull();
  });
});

describe('ttsService — model-not-registered detection', () => {
  it('detects STRUCT_ERROR|5030|', async () => {
    const { __test_internals } = await import('../tts');
    expect(
      __test_internals.isModelNotRegisteredError(
        new Error('HTTP 400: STRUCT_ERROR|5030|{"code":5030}|'),
      ),
    ).toBe(true);
  });

  it('detects HTTP 404', async () => {
    const { __test_internals } = await import('../tts');
    expect(
      __test_internals.isModelNotRegisteredError(new Error('HTTP 404: Not Found')),
    ).toBe(true);
  });

  it('detects LLM_NOT_REGISTERED in message', async () => {
    const { __test_internals } = await import('../tts');
    expect(
      __test_internals.isModelNotRegisteredError(
        new Error('LLM_NOT_REGISTERED: drive model'),
      ),
    ).toBe(true);
  });

  it('does NOT match network errors', async () => {
    const { __test_internals } = await import('../tts');
    expect(
      __test_internals.isModelNotRegisteredError(new Error('Network error')),
    ).toBe(false);
  });

  it('does NOT match generic 500 errors', async () => {
    const { __test_internals } = await import('../tts');
    expect(
      __test_internals.isModelNotRegisteredError(new Error('HTTP 500: Oops')),
    ).toBe(false);
  });
});

describe('ttsService — playback control', () => {
  it('stop() cancels Web Speech utterance', async () => {
    const { ttsService } = await import('../tts');
    mockSpeechSynthesis.speaking = true;
    ttsService.stop();
    expect(mockSpeechSynthesis.cancel).toHaveBeenCalled();
  });

  it('isPlaying() reflects Web Speech speaking state', async () => {
    const { ttsService } = await import('../tts');
    mockSpeechSynthesis.speaking = true;
    expect(ttsService.isPlaying()).toBe(true);
    mockSpeechSynthesis.speaking = false;
    expect(ttsService.isPlaying()).toBe(false);
  });
});
