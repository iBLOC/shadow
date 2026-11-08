/**
 * 录音格式转换 —— **浏览器录的是 webm/opus，而大脑 ASR 只吃 WAV**。
 *
 * ## 为什么要有这一层
 *
 * 桌面端的语音按钮用 `MediaRecorder` 录音，浏览器给的容器是
 * `audio/webm;codecs=opus`（`components/ui/voice-button.tsx`）⇒ ⇒ 送出去的是
 * **webm** 字节；而大脑那一侧（neuron 的 ASR 运行时：whisper／SenseVoice／
 * sherpa）**只认 RIFF/WAVE** ⇒ ⇒ 它会明确报
 * 「audio does not look like WAV (missing RIFF/WAVE header)」⇒ ⇒
 * **语音按钮在今天是不通的**（好在报的是**真错**，不是假成功）。
 *
 * 端脑侧不提供转换（neuron 的多格式解码只有 MP3／FLAC／OGG-Vorbis，
 * **没有 webm/opus**）⇒ ⇒ 转换发生在**录音的那一侧** ⇒ ⇒ 桌面端
 * （WebView 里有 WebAudio，Chromium 原生能解 opus）⇒ ⇒ 移动端若接语音，
 * 走 Flutter 的 `AudioEncoder.pcm16WAV` 直接产 WAV，同一条路。
 *
 * ## 这一层做什么
 *
 * webm/opus ⇒（WebAudio `decodeAudioData`）⇒ Float32 PCM ⇒（多声道降单声道）
 * ⇒（线性插值重采样到 16 kHz）⇒ **16-bit 单声道 WAV**。
 *
 * ⚠️ **16 kHz 是硬要求**：neuron 的 SenseVoice 是 16 kHz 导出，whisper 家族
 * 内部也会按 16 kHz 走 ⇒ ⇒ 送别的采样率过去，要么报错，要么识别质量塌掉。
 *
 * ## 纯函数与浏览器胶水分开
 *
 * `downmixToMono`／`resample`／`encodeWav16Bit` 是**纯函数** ⇒ ⇒ 可以被
 * vitest 直接测（不依赖 WebAudio）⇒ ⇒ 「WAV 头写对了没有」「重采样比例对不对」
 * 这些都**不用真机就能钉住**。浏览器胶水 `webmToWav16k` 只做解码与串联。
 */

/** 大脑 ASR 期望的采样率（16 kHz）。 */
export const ASR_SAMPLE_RATE = 16000;

/** 多声道 PCM → 单声道（各声道取平均）。 */
export function downmixToMono(channels: Float32Array[]): Float32Array {
  if (channels.length === 0) {
    return new Float32Array(0);
  }
  if (channels.length === 1) {
    return new Float32Array(channels[0]);
  }
  const length = Math.min(...channels.map((c) => c.length));
  const out = new Float32Array(length);
  for (let i = 0; i < length; i++) {
    let sum = 0;
    for (const channel of channels) {
      sum += channel[i];
    }
    out[i] = sum / channels.length;
  }
  return out;
}

/**
 * 线性插值重采样。
 *
 * ⚠️ 线性插值不是最优的（理想是带限滤波），但 ASR 前端的特征提取自己会
 * 低通 ⇒ ⇒ 线性插值够用；而它**没有相位依赖**、**长度可预测** ⇒ ⇒ 可测。
 */
export function resample(
  samples: Float32Array,
  fromRate: number,
  toRate: number = ASR_SAMPLE_RATE,
): Float32Array {
  if (fromRate <= 0 || toRate <= 0) {
    throw new Error('sample rates must be positive');
  }
  if (samples.length === 0) {
    return new Float32Array(0);
  }
  if (fromRate === toRate) {
    return new Float32Array(samples);
  }
  const ratio = fromRate / toRate;
  const outLength = Math.max(1, Math.round(samples.length / ratio));
  const out = new Float32Array(outLength);
  for (let i = 0; i < outLength; i++) {
    const pos = i * ratio;
    const left = Math.floor(pos);
    const right = Math.min(left + 1, samples.length - 1);
    const frac = pos - left;
    out[i] = samples[left] * (1 - frac) + samples[right] * frac;
  }
  return out;
}

/**
 * Float32 PCM ⇒ **16-bit 单声道 RIFF/WAVE** 字节。
 *
 * ⚠️ 头部是 neuron's `decode_wav` 的硬要求：`RIFF....WAVEfmt ` 头 ＋
 * `fmt ` 块（PCM=1／声道=1／采样率／16 bit）＋ `data` 块 ⇒ ⇒ 少一个字节
 * 都不行（`decode_wav` 会直接判「not a valid WAV file」）。
 */
export function encodeWav16Bit(
  samples: Float32Array,
  sampleRate: number = ASR_SAMPLE_RATE,
): Uint8Array {
  const bytesPerSample = 2;
  const dataSize = samples.length * bytesPerSample;
  const buffer = new ArrayBuffer(44 + dataSize);
  const view = new DataView(buffer);

  const writeAscii = (offset: number, text: string) => {
    for (let i = 0; i < text.length; i++) {
      view.setUint8(offset + i, text.charCodeAt(i));
    }
  };

  writeAscii(0, 'RIFF');
  view.setUint32(4, 36 + dataSize, true);
  writeAscii(8, 'WAVE');
  writeAscii(12, 'fmt ');
  view.setUint32(16, 16, true); // PCM 头长度
  view.setUint16(20, 1, true); // 音频格式：PCM
  view.setUint16(22, 1, true); // 声道数：单声道
  view.setUint32(24, sampleRate, true);
  view.setUint32(28, sampleRate * bytesPerSample, true); // byte rate
  view.setUint16(32, bytesPerSample, true); // block align
  view.setUint16(34, 16, true); // 位深
  writeAscii(36, 'data');
  view.setUint32(40, dataSize, true);

  let offset = 44;
  for (let i = 0; i < samples.length; i++) {
    const clamped = Math.max(-1, Math.min(1, samples[i]));
    view.setInt16(offset, Math.round(clamped * 32767), true);
    offset += bytesPerSample;
  }
  return new Uint8Array(buffer);
}

/**
 * 浏览器端：webm/opus 的 Blob ⇒ **16 kHz 单声道 WAV** 字节。
 *
 * ⚠️ `decodeAudioData` 需要 **WebAudio**（Chromium／WebView2 有；jsdom 没有）
 * ⇒ ⇒ 缺能力时**明确报错**，不返回一段假音频（宁可红不可疑）。
 */
export async function webmToWav16k(blob: Blob): Promise<Uint8Array> {
  const AudioContextCtor =
    typeof window !== 'undefined'
      ? window.AudioContext ||
        (window as unknown as { webkitAudioContext?: typeof AudioContext })
          .webkitAudioContext
      : undefined;
  if (!AudioContextCtor) {
    throw new Error(
      'WebAudio is not available in this runtime — cannot decode the recorded audio',
    );
  }

  const context = new AudioContextCtor();
  try {
    const arrayBuffer = await blob.arrayBuffer();
    const decoded = await context.decodeAudioData(arrayBuffer);
    const channels: Float32Array[] = [];
    for (let i = 0; i < decoded.numberOfChannels; i++) {
      channels.push(decoded.getChannelData(i));
    }
    const mono = downmixToMono(channels);
    const at16k = resample(mono, decoded.sampleRate, ASR_SAMPLE_RATE);
    return encodeWav16Bit(at16k, ASR_SAMPLE_RATE);
  } finally {
    await context.close();
  }
}

/** Uint8Array ⇒ base64（浏览器 `btoa`，分块避免 apply 的参数上限）。 */
export function bytesToBase64(bytes: Uint8Array): string {
  let binary = '';
  const chunkSize = 0x8000;
  for (let i = 0; i < bytes.length; i += chunkSize) {
    binary += String.fromCharCode(...bytes.subarray(i, i + chunkSize));
  }
  return btoa(binary);
}
