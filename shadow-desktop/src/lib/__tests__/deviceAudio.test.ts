import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

// ⚠️ **探针的替身** —— 真实现问 Rust（`device_audio_state`）。
const mockInvoke = vi.hoisted(() => vi.fn());

vi.mock('@tauri-apps/api/core', () => ({
  invoke: (...args: unknown[]) => mockInvoke(...args),
}));

import { DEVICE_AUDIO_UNKNOWN, probeDeviceAudio } from '../deviceAudio';

/**
 * 设备静音探针 —— 「查不到」与「静音」必须**分开**。
 *
 * ⚠️ 这一层钉的是**形状与降级**：真读数在 Rust 那侧（src-tauri/src/
 * device_audio.rs，有它自己的单测）⇒ ⇒ 这里钉「前端拿到什么形状就
 * 怎么判」⇒ ⇒ 尤其钉「形状不认识 ⇒ 当查不到」⇒ ⇒ 绝不拿半个读数当静音。
 */
describe('probeDeviceAudio — 设备静音探针', () => {
  beforeEach(() => {
    mockInvoke.mockReset();
    delete (globalThis as any).window.__TAURI_INTERNALS__;
    delete (globalThis as any).window.__TAURI__;
  });

  afterEach(() => {
    delete (globalThis as any).window.__TAURI_INTERNALS__;
    delete (globalThis as any).window.__TAURI__;
  });

  it('网页版（没有 Tauri）⇒ **查不到**（不是「有声音」，也不是「静音」）', async () => {
    const state = await probeDeviceAudio();

    expect(state.known).toBe(false);
    expect(state.muted).toBe(false);
    expect(state).toEqual(DEVICE_AUDIO_UNKNOWN);
  });

  it('Tauri + 真读数「静音」⇒ 原样带上来', async () => {
    (globalThis as any).window.__TAURI_INTERNALS__ = {};
    mockInvoke.mockResolvedValue({ muted: true, known: true });

    const state = await probeDeviceAudio();

    expect(state).toEqual({ muted: true, known: true });
  });

  it('Tauri + 真读数「有声音」⇒ 原样带上来', async () => {
    (globalThis as any).window.__TAURI_INTERNALS__ = {};
    mockInvoke.mockResolvedValue({ muted: false, known: true });

    const state = await probeDeviceAudio();

    expect(state).toEqual({ muted: false, known: true });
  });

  it('Tauri + **形状不认识** ⇒ 当作查不到（不许拿半个读数当静音）', async () => {
    (globalThis as any).window.__TAURI_INTERNALS__ = {};
    mockInvoke.mockResolvedValue({ muted: 'yes' });

    const state = await probeDeviceAudio();

    expect(state).toEqual(DEVICE_AUDIO_UNKNOWN);
  });

  it('Tauri + invoke 抛了 ⇒ 查不到（探针不许自己造「静音」）', async () => {
    (globalThis as any).window.__TAURI_INTERNALS__ = {};
    mockInvoke.mockRejectedValue(new Error('no ipc'));

    const state = await probeDeviceAudio();

    expect(state).toEqual(DEVICE_AUDIO_UNKNOWN);
  });
});
