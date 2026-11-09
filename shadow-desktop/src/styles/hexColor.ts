/**
 * 主题色输入的**归一器**。
 *
 * ⚠️⚠️ **为什么它不住在 `accent.g.ts` 里** —— 那是个**生成物**
 *   （由 `scripts/gen_tokens.mjs` 从 `design-tokens.json` 生成 ⇒ ⇒ 生成器里没有的
 *   任何一行都会被下一次生成**抹掉**）⇒ ⇒ 手写代码放进去 = 给自己埋一个「重跑生成器
 *   就丢功能」的雷 ⇒ ⇒ 而且「生成物 ≠ 生成器输出」会让生成物判据
 *   （`shadow-desktop/tests/generatedEol.test.ts`）当场判红。
 *   ⇒ ⇒ **规矩：手写代码住手写模块，生成物只装生成器产出的东西。**
 */

/**
 * 把用户随手输入的色号归一成 `#RRGGBB`；认不得就返回 null。
 *
 * 接受 `#RGB` / `#RRGGBB` / `#RRGGBBAA`（8 位取前 6 位，丢弃 alpha ——
 * 主题色槽位不吃透明度）以及不带 `#` 的写法。返回大写，与预设比较
 * 的 `toUpperCase()` 口径一致。
 */
export function normalizeHexColor(input: string): string | null {
  const raw = input.trim().replace(/^#/, '');
  let hex: string;
  if (/^[0-9a-fA-F]{3}$/.test(raw)) {
    hex = raw.split('').map((c) => c + c).join('');
  } else if (/^[0-9a-fA-F]{6}$/.test(raw)) {
    hex = raw;
  } else if (/^[0-9a-fA-F]{8}$/.test(raw)) {
    hex = raw.slice(0, 6);
  } else {
    return null;
  }
  return `#${hex.toUpperCase()}`;
}
