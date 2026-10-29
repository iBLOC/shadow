import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { deriveAccentTones } from '../../src/styles/accent.g';

/**
 * 主题色派生的**跨端契约**。
 *
 * 桌面端（accent.g.ts）与移动端（app_tokens.g.dart 的 deriveAccentTones）
 * 是两套独立实现 —— 它们必须对同一个 seed 算出同一个色调，否则「同一个
 * 主题色」在两端就是两回事。
 *
 * 契约快照在仓根 `scripts/accent-tones.fixture.json`，两端测试都断言它。
 */
const fixture = JSON.parse(
  readFileSync(
    resolve(__dirname, '../../../scripts/accent-tones.fixture.json'),
    'utf8',
  ),
);

describe('主题色派生 —— 跨端契约', () => {
  it('与契约快照一致', () => {
    expect(fixture.cases.length).toBeGreaterThan(0);

    for (const c of fixture.cases) {
      const tones = deriveAccentTones(c.seed);
      expect(tones.darkTone, `${c.seed} darkTone`).toBe(c.darkTone);
      expect(tones.lightTone, `${c.seed} lightTone`).toBe(c.lightTone);
      expect(tones.darkToneFg, `${c.seed} darkToneFg`).toBe(c.darkToneFg);
      expect(tones.lightToneFg, `${c.seed} lightToneFg`).toBe(c.lightToneFg);
      expect(tones.fg, `${c.seed} fg`).toBe(c.fg);
    }
  });

  it('中性主题色走「反色」：暗底上是光，亮底上是影', () => {
    const tones = deriveAccentTones('#71717A');
    expect(relativeLuminance(tones.darkTone)).toBeGreaterThan(0.8);
    expect(relativeLuminance(tones.lightTone)).toBeLessThan(0.1);
  });

  it('前景色按 WCAG 对比度选，不写死', () => {
    // 亮色相（青）→ 用近黑前景；深色相（绛）→ 用近白前景。
    expect(deriveAccentTones('#22D3EE').fg).toBe('#09090B');
    expect(deriveAccentTones('#4C1D3F').fg).toBe('#FFFFFF');
  });
});

function relativeLuminance(hex: string): number {
  const h = hex.replace('#', '');
  const n = parseInt(h, 16);
  const ch = (v: number) => {
    const c = v / 255;
    return c <= 0.03928 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4;
  };
  return (
    0.2126 * ch((n >> 16) & 255) +
    0.7152 * ch((n >> 8) & 255) +
    0.0722 * ch(n & 255)
  );
}
