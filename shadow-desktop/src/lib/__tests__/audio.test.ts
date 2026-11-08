import { describe, it, expect } from 'vitest';
import {
  ASR_SAMPLE_RATE,
  downmixToMono,
  resample,
  encodeWav16Bit,
  bytesToBase64,
} from '../audio';

describe('downmixToMono', () => {
  it('averages the channels', () => {
    const left = new Float32Array([1, 0, -1]);
    const right = new Float32Array([0, 0, 1]);
    const mono = downmixToMono([left, right]);
    expect(Array.from(mono)).toEqual([0.5, 0, 0]);
  });

  it('copies a single channel instead of aliasing it', () => {
    const only = new Float32Array([0.25, -0.25]);
    const mono = downmixToMono([only]);
    expect(Array.from(mono)).toEqual([0.25, -0.25]);
    mono[0] = 99;
    expect(only[0]).toBe(0.25);
  });

  it('returns an empty buffer for no channels', () => {
    expect(downmixToMono([]).length).toBe(0);
  });
});

describe('resample', () => {
  it('scales 48 kHz down to 16 kHz by three', () => {
    const input = new Float32Array(300);
    for (let i = 0; i < input.length; i++) {
      input[i] = i / input.length;
    }
    const out = resample(input, 48000, ASR_SAMPLE_RATE);
    expect(out.length).toBe(100);
  });

  it('interpolates between the neighbouring samples', () => {
    const input = new Float32Array([0, 1]);
    // 48 kHz -> 24 kHz ⇒ 两个输入样本对应一个输出样本（落在 0 与 1 之间）
    const out = resample(input, 48000, 24000);
    expect(out.length).toBe(1);
    expect(out[0]).toBeCloseTo(0, 5);
  });

  it('is a no-op when the rate already matches', () => {
    const input = new Float32Array([0.1, 0.2, 0.3]);
    const out = resample(input, ASR_SAMPLE_RATE, ASR_SAMPLE_RATE);
    // ⚠️ Float32Array 存的是 f32 ⇒ 比较要用近似，不能用 toEqual 拿双精度字面量比
    expect(out.length).toBe(3);
    expect(out[0]).toBeCloseTo(0.1, 6);
    expect(out[1]).toBeCloseTo(0.2, 6);
    expect(out[2]).toBeCloseTo(0.3, 6);
  });

  it('rejects a non-positive rate instead of producing garbage', () => {
    expect(() => resample(new Float32Array([1]), 0, 16000)).toThrow();
  });
});

describe('encodeWav16Bit', () => {
  it('writes the RIFF/WAVE header neuron decodes', () => {
    const wav = encodeWav16Bit(new Float32Array([0]), ASR_SAMPLE_RATE);
    const ascii = (offset: number, length: number) =>
      String.fromCharCode(...wav.subarray(offset, offset + length));
    expect(ascii(0, 4)).toBe('RIFF');
    expect(ascii(8, 4)).toBe('WAVE');
    expect(ascii(12, 4)).toBe('fmt ');
    expect(ascii(36, 4)).toBe('data');
    // 44 字节是**头**；后面还跟着样本数据（1 个样本 = 2 字节）
    expect(wav.length).toBe(46);
    expect(encodeWav16Bit(new Float32Array([])).length).toBe(44);
  });

  it('declares 16 kHz mono 16-bit PCM', () => {
    const wav = encodeWav16Bit(new Float32Array([0, 0]), ASR_SAMPLE_RATE);
    const view = new DataView(wav.buffer, wav.byteOffset, wav.byteLength);
    expect(view.getUint16(20, true)).toBe(1); // PCM
    expect(view.getUint16(22, true)).toBe(1); // mono
    expect(view.getUint32(24, true)).toBe(ASR_SAMPLE_RATE);
    expect(view.getUint16(34, true)).toBe(16); // bit depth
    expect(view.getUint16(32, true)).toBe(2); // block align
  });

  it('scales samples to 16-bit and clamps out-of-range values', () => {
    const wav = encodeWav16Bit(new Float32Array([0, 1, -1, 2, -2]));
    const view = new DataView(wav.buffer, wav.byteOffset, wav.byteLength);
    expect(view.getInt16(44, true)).toBe(0);
    expect(view.getInt16(46, true)).toBe(32767);
    expect(view.getInt16(48, true)).toBe(-32767);
    expect(view.getInt16(50, true)).toBe(32767); // clamped
    expect(view.getInt16(52, true)).toBe(-32767); // clamped
  });

  it('writes the data size in both the header and the body', () => {
    const samples = new Float32Array(160);
    const wav = encodeWav16Bit(samples, ASR_SAMPLE_RATE);
    const view = new DataView(wav.buffer, wav.byteOffset, wav.byteLength);
    expect(view.getUint32(40, true)).toBe(320);
    expect(wav.length).toBe(44 + 320);
    expect(view.getUint32(4, true)).toBe(36 + 320);
  });
});

describe('bytesToBase64', () => {
  it('encodes bytes the base64 way', () => {
    expect(bytesToBase64(new Uint8Array([104, 105]))).toBe('aGk=');
    expect(bytesToBase64(new Uint8Array([]))).toBe('');
  });
});
