import { readFileSync, writeFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
import { deriveAccentTones } from './lib/tokens.mjs';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const tokens = JSON.parse(
  readFileSync(join(ROOT, 'design-tokens.json'), 'utf8'),
);

/**
 * 主题色派生的**契约快照**。
 *
 * 两端各有一份实现（移动端 app_tokens.g.dart 的 deriveAccentTones、
 * 桌面端 accent.g.ts 的 deriveAccentTones）。算法一旦分叉，「同一个主题色
 * 在两端算出不同色调」就是静默的 bug。
 *
 * 这份快照是冻结的期望值 —— 两端的测试都断言它。
 * 改算法 = 有意识地改这里，并让两端一起过。
 */
const SEEDS = [
  tokens.color.accent.seed, // 默认中性
  ...tokens.color.accent.userSelectable.map((p) => p.hex),
];

const cases = SEEDS.map((seed) => {
  const t = deriveAccentTones(seed);
  return {
    seed: t.seed,
    darkTone: t.darkTone,
    lightTone: t.lightTone,
    darkToneFg: t.darkToneFg,
    lightToneFg: t.lightToneFg,
    fg: t.fg,
  };
});

const out = {
  _note:
    '主题色派生的契约快照。移动端（app_tokens.g.dart）与桌面端（accent.g.ts）' +
    '的两套实现都必须对上这份期望值。改算法请同时更新本文件。',
  cases,
};

writeFileSync(
  join(ROOT, 'scripts/accent-tones.fixture.json'),
  JSON.stringify(out, null, 2) + '\n',
  'utf8',
);
console.log(`已写出 scripts/accent-tones.fixture.json（${cases.length} 个用例）`);
for (const c of cases) {
  console.log(
    `  ${c.seed} → dark ${c.darkTone} / light ${c.lightTone} / fg ${c.fg}`,
  );
}
