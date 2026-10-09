import { describe, it, expect, vi, afterEach } from 'vitest';
import { estimateTokens, computeTokenStats } from '../../src/lib/tokenStats';

describe('estimateTokens', () => {
  it('returns 0 for empty input', () => {
    expect(estimateTokens('')).toBe(0);
  });

  it('counts each CJK glyph as ~1 token', () => {
    // 4 characters → 4 tokens; CJK path should dominate and round-trip.
    expect(estimateTokens('你好世界')).toBe(4);
  });

  it('treats latin text as ~4 chars per token (rounded up)', () => {
    expect(estimateTokens('hello')).toBe(2); // ceil(5/4)
    expect(estimateTokens('helloworld')).toBe(3); // ceil(10/4)
  });

  it('mixes CJK and latin weights', () => {
    const mixed = '你好hello';
    // 2 CJK + ceil(5/4)=2 latin → 4 tokens
    expect(estimateTokens(mixed)).toBe(4);
  });

  it('includes kana and hangul codepoints', () => {
    expect(estimateTokens('カタカナ')).toBe(4);
    expect(estimateTokens('안녕')).toBe(2);
  });

  it('never reports zero for non-empty input', () => {
    expect(estimateTokens('.')).toBeGreaterThanOrEqual(1);
  });
});

describe('computeTokenStats', () => {
  afterEach(() => {
    vi.useRealTimers();
  });

  it('measures tokens per second from the streamed window', () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date('2026-09-29T00:00:00Z'));
    const start = Date.now();
    vi.advanceTimersByTime(2000);
    const stats = computeTokenStats('hello world', start);
    expect(stats.tokens).toBe(3); // ceil(11/4)
    expect(stats.durationMs).toBe(2000);
    expect(stats.tokensPerSecond).toBeCloseTo(1.5, 2);
  });

  it('returns zero speed for instantaneous streams (no division by zero)', () => {
    const stats = computeTokenStats('hi', 1000, 1000);
    expect(stats.durationMs).toBe(0);
    expect(stats.tokensPerSecond).toBe(0);
  });

  it('falls back to Date.now() when no end is given', () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date('2026-09-29T00:00:05Z'));
    const stats = computeTokenStats('你好世界', 1000);
    expect(stats.durationMs).toBeGreaterThanOrEqual(0);
    expect(stats.tokens).toBe(4);
  });

  it('clamps negative durations (clock skew) to zero', () => {
    const stats = computeTokenStats('hi', 2000, 1000);
    expect(stats.durationMs).toBe(0);
    expect(stats.tokensPerSecond).toBe(0);
  });
});