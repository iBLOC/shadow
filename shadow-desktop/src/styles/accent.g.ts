// ============================================================
// Shadow 主题色派生 —— 由 scripts/gen_tokens.mjs 生成
// 请勿手改。改 design-tokens.json 后重新运行：
//     node scripts/gen_tokens.mjs
//
// 与 shadow-mobile/lib/theme/app_tokens.g.dart 里的 deriveAccentTones
// 是同一套规则 —— 两端对同一个 seed 必须算出同一个色调。
// ============================================================

export interface AccentTones {
  seed: string;
  darkTone: string;
  lightTone: string;
  darkToneFg: string;
  lightToneFg: string;
  fg: string;
}

export function hexToRgb(hex: string) {
  const h = hex.replace("#", "");
  const full = h.length === 3 ? h.split("").map((c) => c + c).join("") : h;
  const n = parseInt(full.slice(0, 6), 16);
  return { r: (n >> 16) & 255, g: (n >> 8) & 255, b: n & 255 };
}

function rgbToHsl(r: number, g: number, b: number) {
  const rr = r / 255, gg = g / 255, bb = b / 255;
  const max = Math.max(rr, gg, bb), min = Math.min(rr, gg, bb);
  const l = (max + min) / 2;
  let h = 0, s = 0;
  if (max !== min) {
    const d = max - min;
    s = l > 0.5 ? d / (2 - max - min) : d / (max + min);
    if (max === rr) h = ((gg - bb) / d + (gg < bb ? 6 : 0)) / 6;
    else if (max === gg) h = ((bb - rr) / d + 2) / 6;
    else h = ((rr - gg) / d + 4) / 6;
  }
  return { h: h * 360, s, l };
}

function hslToHex(h: number, s: number, l: number) {
  if (s === 0) {
    const v = Math.round(l * 255);
    return `#${[v, v, v].map((x) => x.toString(16).padStart(2, "0")).join("").toUpperCase()}`;
  }
  const hue2rgb = (p: number, q: number, t: number) => {
    let tt = t;
    if (tt < 0) tt += 1;
    if (tt > 1) tt -= 1;
    if (tt < 1 / 6) return p + (q - p) * 6 * tt;
    if (tt < 1 / 2) return q;
    if (tt < 2 / 3) return p + (q - p) * (2 / 3 - tt) * 6;
    return p;
  };
  const q = l < 0.5 ? l * (1 + s) : l + s - l * s;
  const p = 2 * l - q;
  const hn = (((h % 360) + 360) % 360) / 360;
  const to = (x: number) =>
    Math.round(Math.min(255, Math.max(0, x))).toString(16).padStart(2, "0").toUpperCase();
  return `#${to(hue2rgb(p, q, hn + 1 / 3) * 255)}${to(hue2rgb(p, q, hn) * 255)}${to(hue2rgb(p, q, hn - 1 / 3) * 255)}`;
}

function relativeLuminance(hex: string) {
  const { r, g, b } = hexToRgb(hex);
  const ch = (v: number) => {
    const c = v / 255;
    return c <= 0.03928 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4;
  };
  return 0.2126 * ch(r) + 0.7152 * ch(g) + 0.0722 * ch(b);
}

function contrastRatio(a: string, b: string) {
  const la = relativeLuminance(a), lb = relativeLuminance(b);
  const hi = Math.max(la, lb), lo = Math.min(la, lb);
  return (hi + 0.05) / (lo + 0.05);
}

/** 在近白 / 近黑里挑对比度更高者做前景色（WCAG 2.1） */
export function bestForeground(bg: string) {
  const white = "#FFFFFF";
  const black = "#09090B";
  return contrastRatio(bg, white) >= contrastRatio(bg, black) ? white : black;
}

/**
 * 主题色派生 —— 与移动端 deriveAccentTones 同一套规则。
 *
 * 影子没有颜色，所以默认 seed 是中性色；对中性色走「反色」——
 * 暗色模式上是光（近白），亮色模式上是影（近黑）。
 * 用户选了有彩色的 seed 时，暗色模式用亮色调（L=0.80），亮色模式用暗色调（L=0.42），
 * 前景色按 WCAG 对比度在近白/近黑里挑，不是写死。
 */
export function deriveAccentTones(seedHex: string): AccentTones {
  const { r, g, b } = hexToRgb(seedHex);
  const hsl = rgbToHsl(r, g, b);
  const achromatic = hsl.s < 0.04;
  const sat = Math.min(hsl.s, 0.75);

  const darkTone = achromatic
    ? hslToHex(hsl.h, hsl.s, 0.97)
    : hslToHex(hsl.h, sat, 0.8);
  const lightTone = achromatic
    ? hslToHex(hsl.h, hsl.s, 0.055)
    : hslToHex(hsl.h, sat, 0.42);

  return {
    seed: seedHex.toUpperCase(),
    darkTone,
    lightTone,
    darkToneFg: bestForeground(darkTone),
    lightToneFg: bestForeground(lightTone),
    fg: bestForeground(seedHex.toUpperCase()),
  };
}

/** 把 hex 转成 CSS 里 `hsl(var(--x))` 用的 "H S% L%" 三元组 */
export function hslTriplet(hex: string) {
  const { r, g, b } = hexToRgb(hex);
  const { h, s, l } = rgbToHsl(r, g, b);
  return `${Math.round(h * 10) / 10} ${Math.round(s * 1000) / 10}% ${Math.round(l * 1000) / 10}%`;
}

/** 用户可选主题色预设 —— 显示名走 i18n（appearanceAccent*），不在设计源里写死 */
export const accentPresets: { id: string; hex: string }[] = [
  { id: 'neutral', hex: '#71717A' },
  { id: 'slate', hex: '#64748B' },
  { id: 'indigo', hex: '#6366F1' },
  { id: 'cyan', hex: '#22D3EE' },
  { id: 'emerald', hex: '#10B981' },
  { id: 'amber', hex: '#F59E0B' },
  { id: 'rose', hex: '#F43F5E' },
];

/** 对话框 / 面板背景的可选值 —— null = 跟随主题 */
export const surfaceOverrides: { id: string; hex: string }[] = [
  { id: 'ink', hex: '#0A0A0B' },
  { id: 'deep', hex: '#18181B' },
  { id: 'neutral', hex: '#F4F4F5' },
  { id: 'light', hex: '#FFFFFF' },
];

/** 玻璃底色的基准 alpha —— 桌面端按玻璃强度缩放它（与移动端 _scaleAlpha 同规则） */
export const glassSurfaceAlpha = {
  light: { rgb: [255, 255, 255] as [number, number, number], alpha: 0.702 },
  dark: { rgb: [255, 255, 255] as [number, number, number], alpha: 0.078 },
};
