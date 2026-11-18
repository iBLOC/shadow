/**
 * **设备静音探针**（前端那一半）—— 「这台机器现在有没有声音」。
 *
 * ⚠️ **为什么要有它**：TTS 合成要烧**模型算力**（那一发
 * `/v1/audio/speech`）⇒ ⇒ 用户把音量调到 0（静音）时，合成出来的音频
 * **没人听得见** ⇒ ⇒ 那一发**纯属浪费** ⇒ ⇒ 静音时**一次都不该发**。
 *
 * ⚠️ **三态，不是布尔** —— 「查不到」必须与「有声音」**分开**：
 * · `known = false` ⇒ **查不到**（网页版没有系统音量 API；Linux 上
 *   零依赖读不出来）⇒ ⇒ 按「**有声音**」处理（宁可多合成一次，也绝不
 *   静默吞掉声音）。
 * · `known = true, muted = true` ⇒ **确定静音** ⇒ ⇒ 跳过合成。
 *
 * ⚠️ **探针不许自己造「静音」** —— 只有真读数（Rust 那侧的端点音量）
 * 才算数 ⇒ ⇒ 探针失败 / 形状不认识 ⇒ ⇒ 一律落回「查不到」。
 */

import { safeInvoke } from './tauriSafe';

export interface DeviceAudioState {
  /** 设备**确定**静音了（媒体音量 0 ／ 端点被 mute）。 */
  muted: boolean;
  /** 这个结论**是不是查到的** —— false ⇒ 查不到（按「有声音」处理）。 */
  known: boolean;
}

/** **查不到** —— 不是「有声音」，是「不知道」。 */
export const DEVICE_AUDIO_UNKNOWN: DeviceAudioState = { muted: false, known: false };

/**
 * 探一次设备声音状态。
 *
 * ⚠️ **网页版（Tauri 之外）** ⇒ ⇒ `safeInvoke` 直接给 null ⇒ ⇒ 落回
 * 「查不到」⇒ ⇒ 行为与今天**逐字一致**（该合成还是合成）。
 */
export async function probeDeviceAudio(): Promise<DeviceAudioState> {
  const raw = await safeInvoke<DeviceAudioState | null>(
    'device_audio_state',
    undefined,
    null,
  );
  // ⚠️ **形状不认识 ⇒ 当作查不到**（不许拿半个读数当静音）。
  if (!raw || typeof raw.muted !== 'boolean' || typeof raw.known !== 'boolean') {
    return DEVICE_AUDIO_UNKNOWN;
  }
  return { muted: raw.muted, known: raw.known };
}
