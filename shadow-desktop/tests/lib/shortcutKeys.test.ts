import { describe, it, expect } from 'vitest';
import { formatChord, isBareTypingChord } from '../../src/lib/shortcutKeys';

describe('shortcutKeys', () => {
  describe('formatChord', () => {
    it('formats keyboard chords with modifiers', () => {
      expect(formatChord('Ctrl+Shift+KeyR', 'zh-CN')).toBe('Ctrl + Shift + R');
      expect(formatChord('Ctrl+Shift+KeyR', 'en-US')).toBe('Ctrl + Shift + R');
    });

    it('renders media keys in Chinese for zh locales', () => {
      expect(formatChord('MediaPlayPause', 'zh-CN')).toBe('播放/暂停');
      expect(formatChord('VolumeUp', 'zh-CN')).toBe('音量+');
      expect(formatChord('ArrowUp', 'zh-CN')).toBe('↑');
    });

    it('falls back to the raw code for en locales', () => {
      expect(formatChord('MediaPlayPause', 'en-US')).toBe('MediaPlayPause');
    });

    it('translates letter, digit and numpad codes', () => {
      expect(formatChord('KeyA', 'zh-CN')).toBe('A');
      expect(formatChord('Digit5', 'zh-CN')).toBe('5');
      expect(formatChord('Numpad5', 'zh-CN')).toBe('小键盘5');
      expect(formatChord('Numpad5', 'en-US')).toBe('Num5');
    });
  });

  describe('isBareTypingChord', () => {
    it('flags bare letters, digits and punctuation as risky', () => {
      expect(isBareTypingChord('KeyA')).toBe(true);
      expect(isBareTypingChord('Digit1')).toBe(true);
      expect(isBareTypingChord('Enter')).toBe(true);
      expect(isBareTypingChord('Space')).toBe(true);
      expect(isBareTypingChord('Numpad5')).toBe(true);
      expect(isBareTypingChord('NumpadAdd')).toBe(true);
    });

    it('clears chords with any modifier', () => {
      expect(isBareTypingChord('Ctrl+KeyA')).toBe(false);
      expect(isBareTypingChord('Shift+Enter')).toBe(false);
      expect(isBareTypingChord('Ctrl+Alt+Numpad5')).toBe(false);
    });

    it('clears non-typing bare keys (remote buttons)', () => {
      expect(isBareTypingChord('MediaPlayPause')).toBe(false);
      expect(isBareTypingChord('VolumeMute')).toBe(false);
      expect(isBareTypingChord('ArrowUp')).toBe(false);
      expect(isBareTypingChord('Escape')).toBe(false);
      expect(isBareTypingChord('F5')).toBe(false);
      expect(isBareTypingChord('BrowserBack')).toBe(false);
    });
  });
});
